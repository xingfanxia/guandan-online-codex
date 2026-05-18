import { describe, expect, test } from 'vitest';
import type { PlayingState } from '../../lib/game/state';
import { MessageType, type ServerEvent } from '../../lib/realtime/messages';
import type { ClientPayload } from '../../lib/realtime/payload';
import {
  UpstashEventLog,
  UpstashGameStateStore,
  UpstashIdempotencyStore,
  UpstashPublisher,
  UpstashRedis,
} from '../../lib/realtime/upstashRest';
import { startIdempotentOperation } from '../../lib/realtime/idempotency';

type FetchWithCalls = typeof fetch & { calls: Array<{ url: string; init?: RequestInit }> };

function fakeFetch(responses: unknown[]): FetchWithCalls {
  const calls: FetchWithCalls['calls'] = [];
  const fetcher = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const call: { url: string; init?: RequestInit } = { url: String(url) };
    if (init) call.init = init;
    calls.push(call);
    const next = responses.shift();
    return new Response(JSON.stringify(next), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return Object.assign(fetcher, { calls }) as FetchWithCalls;
}

function state(): PlayingState {
  return {
    phase: 'playing',
    mode: '4',
    levelRank: '2',
    players: [{ id: 'p1', seat: 'east', team: 't1' }],
    hands: { p1: [] },
    undealt: [],
    finished: [],
    currentTurn: 'p1',
    currentTrick: { leader: 'p1', passes: [] },
    version: 1,
  };
}

function payload(event: ServerEvent): ClientPayload {
  return {
    type: event.type,
    event,
    view: {
      phase: 'waiting',
      mode: '4',
      levelRank: '2',
      version: 1,
      players: [],
    },
  };
}

describe('Upstash REST adapters', () => {
  test('sends Redis commands as authenticated POST JSON arrays', async () => {
    const fetcher = fakeFetch([{ result: 'OK' }]);
    const redis = new UpstashRedis({ url: 'https://redis.example', token: 'secret', fetcher });

    await expect(redis.command<string>(['SET', 'k', 'v'])).resolves.toBe('OK');

    expect(fetcher.calls).toHaveLength(1);
    expect(fetcher.calls[0]!.url).toBe('https://redis.example');
    expect(fetcher.calls[0]!.init).toMatchObject({
      method: 'POST',
      headers: {
        authorization: 'Bearer secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify(['SET', 'k', 'v']),
    });
  });

  test('throws named errors for rejected Redis commands', async () => {
    const redis = new UpstashRedis({
      url: 'https://redis.example',
      token: 'secret',
      fetcher: fakeFetch([{ error: 'ERR bad command' }]),
    });

    await expect(redis.command(['NOPE'])).rejects.toThrow('ERR bad command');
  });

  test('publishes filtered payloads through Redis PUBLISH', async () => {
    const fetcher = fakeFetch([{ result: 1 }]);
    const publisher = new UpstashPublisher(new UpstashRedis({ url: 'https://redis.example', token: 'secret', fetcher }));

    await publisher.publish('game:K7M2P9:player:p1', '{"ok":true}');

    expect(JSON.parse(fetcher.calls[0]!.init!.body as string)).toEqual(['PUBLISH', 'game:K7M2P9:player:p1', '{"ok":true}']);
  });

  test('stores and loads game state JSON', async () => {
    const game = state();
    const fetcher = fakeFetch([{ result: 'OK' }, { result: JSON.stringify(game) }]);
    const store = new UpstashGameStateStore(new UpstashRedis({ url: 'https://redis.example', token: 'secret', fetcher }));

    await store.set('K7M2P9', game);
    await expect(store.get('K7M2P9')).resolves.toEqual(game);

    expect(JSON.parse(fetcher.calls[0]!.init!.body as string)).toEqual(['SET', 'game:K7M2P9:state', JSON.stringify(game)]);
    expect(JSON.parse(fetcher.calls[1]!.init!.body as string)).toEqual(['GET', 'game:K7M2P9:state']);
  });

  test('uses Redis SET NX for idempotency reservation races', async () => {
    const pending = { state: 'pending', expiresAtMs: 301_000 };
    const fetcher = fakeFetch([{ result: null }, { result: null }, { result: JSON.stringify(pending) }]);
    const store = new UpstashIdempotencyStore(new UpstashRedis({ url: 'https://redis.example', token: 'secret', fetcher }));

    await expect(startIdempotentOperation(store, 'idem:K7M2P9:m1', 300, 1_000)).resolves.toEqual({ status: 'pending' });

    expect(JSON.parse(fetcher.calls[1]!.init!.body as string)).toEqual([
      'SET',
      'idem:K7M2P9:m1',
      JSON.stringify(pending),
      'NX',
      'EX',
      300,
    ]);
  });

  test('appends and replays per-player event streams', async () => {
    const event = { type: MessageType.Heartbeat, at: '2026-05-18T00:00:00.000Z' } satisfies ServerEvent;
    const clientPayload = payload(event);
    const fetcher = fakeFetch([
      { result: '1747570000000-0' },
      { result: [['1747570000000-0', ['payload', JSON.stringify(clientPayload)]]] },
    ]);
    const log = new UpstashEventLog(new UpstashRedis({ url: 'https://redis.example', token: 'secret', fetcher }), {
      maxLength: 500,
    });

    await expect(log.append('K7M2P9', 'p1', clientPayload)).resolves.toEqual({ id: '1747570000000-0', payload: clientPayload });
    await expect(log.replayAfter('K7M2P9', 'p1')).resolves.toEqual([{ id: '1747570000000-0', payload: clientPayload }]);

    expect(JSON.parse(fetcher.calls[0]!.init!.body as string)).toEqual([
      'XADD',
      'game:K7M2P9:events:p1',
      'MAXLEN',
      '~',
      500,
      '*',
      'payload',
      JSON.stringify(clientPayload),
    ]);
    expect(JSON.parse(fetcher.calls[1]!.init!.body as string)).toEqual(['XRANGE', 'game:K7M2P9:events:p1', '-', '+']);
  });

  test('replays only events after Last-Event-ID', async () => {
    const fetcher = fakeFetch([{ result: [] }]);
    const log = new UpstashEventLog(new UpstashRedis({ url: 'https://redis.example', token: 'secret', fetcher }));

    await log.replayAfter('K7M2P9', 'p1', '1747570000000-0');

    expect(JSON.parse(fetcher.calls[0]!.init!.body as string)).toEqual([
      'XRANGE',
      'game:K7M2P9:events:p1',
      '(1747570000000-0',
      '+',
    ]);
  });
});
