import { describe, expect, test } from 'vitest';
import { createDefaultRoomStore } from '../../lib/room/defaultStore';
import type { RoomRecord } from '../../lib/room/lifecycle';
import { MemoryRoomStore } from '../../lib/room/lifecycle';
import { DEFAULT_ROOM_RULES } from '../../lib/room/rules';
import { UpstashRoomStore } from '../../lib/room/upstashStore';
import { UpstashRedis } from '../../lib/realtime/upstashRest';

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

function room(): RoomRecord {
  return {
    code: 'A2A2A2',
    hostHandle: 'fufu',
    hostToken: 'host_A2A2A2_secret',
    joinToken: 'join_A2A2A2_secret',
    players: [{ id: 'p1', handle: 'fufu', role: 'host', playerToken: 'player_A2A2A2_secret' }],
    rules: DEFAULT_ROOM_RULES,
    visibility: 'public',
    createdAt: '2026-05-18T00:00:00.000Z',
    updatedAt: '2026-05-18T00:00:00.000Z',
    maxPlayers: 4,
  };
}

describe('Upstash room store', () => {
  test('stores, loads, checks, and deletes rooms under go:room keys', async () => {
    const record = room();
    const fetcher = fakeFetch([
      { result: 'OK' },
      { result: JSON.stringify(record) },
      { result: 1 },
      { result: 1 },
    ]);
    const store = new UpstashRoomStore(new UpstashRedis({ url: 'https://redis.example', token: 'secret', fetcher }));

    await store.set(record.code, record);
    await expect(store.get(record.code)).resolves.toEqual(record);
    await expect(store.has(record.code)).resolves.toBe(true);
    await store.delete(record.code);

    expect(JSON.parse(fetcher.calls[0]!.init!.body as string)).toEqual(['SET', 'go:room:A2A2A2', JSON.stringify(record)]);
    expect(JSON.parse(fetcher.calls[1]!.init!.body as string)).toEqual(['GET', 'go:room:A2A2A2']);
    expect(JSON.parse(fetcher.calls[2]!.init!.body as string)).toEqual(['EXISTS', 'go:room:A2A2A2']);
    expect(JSON.parse(fetcher.calls[3]!.init!.body as string)).toEqual(['DEL', 'go:room:A2A2A2']);
  });

  test('returns undefined for missing rooms', async () => {
    const fetcher = fakeFetch([{ result: null }, { result: 0 }]);
    const store = new UpstashRoomStore(new UpstashRedis({ url: 'https://redis.example', token: 'secret', fetcher }));

    await expect(store.get('A2A2A2')).resolves.toBeUndefined();
    await expect(store.has('A2A2A2')).resolves.toBe(false);
  });

  test('lists rooms with KEYS and MGET', async () => {
    const record = room();
    const fetcher = fakeFetch([{ result: ['go:room:A2A2A2'] }, { result: [JSON.stringify(record)] }]);
    const store = new UpstashRoomStore(new UpstashRedis({ url: 'https://redis.example', token: 'secret', fetcher }));

    await expect(store.list()).resolves.toEqual([record]);

    expect(JSON.parse(fetcher.calls[0]!.init!.body as string)).toEqual(['KEYS', 'go:room:*']);
    expect(JSON.parse(fetcher.calls[1]!.init!.body as string)).toEqual(['MGET', 'go:room:A2A2A2']);
  });

  test('returns empty room list without MGET when no keys exist', async () => {
    const fetcher = fakeFetch([{ result: [] }]);
    const store = new UpstashRoomStore(new UpstashRedis({ url: 'https://redis.example', token: 'secret', fetcher }));

    await expect(store.list()).resolves.toEqual([]);
    expect(fetcher.calls).toHaveLength(1);
  });

  test('default room store follows Upstash env presence', () => {
    expect(createDefaultRoomStore({})).toBeInstanceOf(MemoryRoomStore);
    expect(
      createDefaultRoomStore({
        UPSTASH_REDIS_REST_URL: 'https://redis.example',
        UPSTASH_REDIS_REST_TOKEN: 'secret',
      }),
    ).toBeInstanceOf(UpstashRoomStore);
  });
});
