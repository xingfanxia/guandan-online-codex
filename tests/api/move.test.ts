import { describe, expect, test } from 'vitest';
import { createMoveHandler, MemoryGameStateStore } from '../../api/move';
import { type Card } from '../../lib/game/cards';
import { type PlayingState } from '../../lib/game/state';
import { MemoryEventLog } from '../../lib/realtime/eventLog';
import { MemoryIdempotencyStore } from '../../lib/realtime/idempotency';
import { createRoom, MemoryRoomStore } from '../../lib/room/lifecycle';
import type { RealtimePublisher } from '../../lib/realtime/upstash';

function c(rank: Card['rank'], suit: Card['suit'] = 'spades', deck = 1): Card {
  return { rank, suit, deck: deck as 1 | 2 };
}

function playingState(): PlayingState {
  return {
    phase: 'playing',
    mode: '4',
    levelRank: '2',
    players: [
      { id: 'p1', seat: 'east', team: 't1' },
      { id: 'p2', seat: 'south', team: 't2' },
      { id: 'p3', seat: 'west', team: 't1' },
      { id: 'p4', seat: 'north', team: 't2' },
    ],
    hands: {
      p1: [c('3')],
      p2: [c('RJ', 'joker')],
      p3: [c('5')],
      p4: [c('6')],
    },
    undealt: [],
    finished: [],
    currentTurn: 'p1',
    currentTrick: { leader: 'p1', passes: [] },
    version: 1,
  };
}

function roundEndingState(): PlayingState {
  return {
    ...playingState(),
    hands: {
      p1: [],
      p2: [c('3', 'hearts')],
      p3: [c('A')],
      p4: [c('4', 'diamonds')],
    },
    finished: [{ playerId: 'p1', position: 1, team: 't1' }],
    currentTurn: 'p3',
    currentTrick: { leader: 'p3', passes: [] },
  };
}

function jsonRequest(body: unknown, method = 'POST'): Request {
  const init: RequestInit = {
    method,
    headers: { 'content-type': 'application/json' },
  };
  if (method === 'POST') init.body = JSON.stringify(body);
  return new Request('https://gdo.ax0x.ai/api/move', {
    ...init,
  });
}

describe('api/move handler', () => {
  test('applies a move once, publishes filtered per-player payloads, and replays duplicate moveId response', async () => {
    const stateStore = new MemoryGameStateStore([['K7M2P9', playingState()]]);
    const idempotency = new MemoryIdempotencyStore();
    const eventLog = new MemoryEventLog();
    const published: Array<{ channel: string; payload: string }> = [];
    const publisher: RealtimePublisher = {
      async publish(channel, payload) {
        published.push({ channel, payload });
      },
    };
    const handler = createMoveHandler({ stateStore, idempotency, eventLog, publisher, nowMs: () => 1_000 });
    const body = {
      roomId: 'K7M2P9',
      moveId: 'move-1',
      playerId: 'p1',
      command: { type: 'play', cards: [c('3')] },
    };

    const first = await handler(jsonRequest(body));
    const firstJson = await first.json();
    const second = await handler(jsonRequest(body));
    const secondJson = await second.json();

    expect(first.status).toBe(200);
    expect(firstJson).toMatchObject({ ok: true, version: 2, view: { phase: 'playing', self: { playerId: 'p1' } } });
    expect(second.status).toBe(200);
    expect(secondJson).toEqual(firstJson);
    expect((await stateStore.get('K7M2P9'))?.version).toBe(2);
    expect(published).toHaveLength(4);
    expect(published[0]!.channel).toBe('game:K7M2P9:player:p1');
    expect(published[0]!.payload).not.toContain('RJ');
    const p1Replay = eventLog.replayAfter('K7M2P9', 'p1');
    const p2Replay = eventLog.replayAfter('K7M2P9', 'p2');
    expect(p1Replay).toHaveLength(1);
    expect(JSON.stringify(p1Replay)).not.toContain('RJ');
    expect(p1Replay[0]!.payload.view.self?.playerId).toBe('p1');
    expect(p2Replay[0]!.payload.view.self?.hand).toEqual([c('RJ', 'joker')]);
  });

  test('returns named errors for invalid method, missing room, and illegal move', async () => {
    const stateStore = new MemoryGameStateStore([['K7M2P9', playingState()]]);
    const handler = createMoveHandler({
      stateStore,
      idempotency: new MemoryIdempotencyStore(),
      eventLog: new MemoryEventLog(),
      publisher: { async publish() {} },
      nowMs: () => 1_000,
    });

    expect(await (await handler(jsonRequest({}, 'GET'))).json()).toEqual({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' });
    expect(
      await (
        await handler(
          jsonRequest({
            roomId: 'NOPE',
            moveId: 'move-1',
            playerId: 'p1',
            command: { type: 'play', cards: [c('3')] },
          }),
        )
      ).json(),
    ).toEqual({ ok: false, error: 'ERR_ROOM_NOT_FOUND' });
    expect(
      await (
        await handler(
          jsonRequest({
            roomId: 'K7M2P9',
            moveId: 'move-2',
            playerId: 'p2',
            command: { type: 'play', cards: [c('RJ', 'joker')] },
          }),
        )
      ).json(),
    ).toEqual({ ok: false, error: 'ERR_WRONG_TURN' });
  });

  test('publishes round_end when a move finishes the round', async () => {
    const stateStore = new MemoryGameStateStore([['K7M2P9', roundEndingState()]]);
    const eventLog = new MemoryEventLog();
    const published: Array<{ channel: string; payload: string }> = [];
    const handler = createMoveHandler({
      stateStore,
      idempotency: new MemoryIdempotencyStore(),
      eventLog,
      publisher: {
        async publish(channel, payload) {
          published.push({ channel, payload });
        },
      },
      nowMs: () => 1_000,
    });

    const response = await handler(jsonRequest({
      roomId: 'K7M2P9',
      moveId: 'move-round-end',
      playerId: 'p3',
      command: { type: 'play', cards: [c('A')] },
    }));

    expect(await response.json()).toMatchObject({
      ok: true,
      version: 3,
      events: ['move_played', 'round_end'],
    });
    expect(await stateStore.get('K7M2P9')).toMatchObject({ phase: 'round-end', winnerTeam: 't1' });
    expect(published).toHaveLength(8);
    expect(eventLog.replayAfter('K7M2P9', 'p2').map((entry) => entry.payload.type)).toEqual(['move_played', 'round_end']);
  });

  test('chains a bounded bot turn after a human move when the next player is a bot', async () => {
    const game = playingState();
    game.players[1] = { ...game.players[1]!, kind: 'bot', botDifficulty: 'easy' };
    game.hands = {
      p1: [c('3'), c('9')],
      p2: [c('4')],
      p3: [c('5')],
      p4: [c('6')],
    };
    const stateStore = new MemoryGameStateStore([['K7M2P9', game]]);
    const eventLog = new MemoryEventLog();
    const handler = createMoveHandler({
      stateStore,
      idempotency: new MemoryIdempotencyStore(),
      eventLog,
      publisher: { async publish() {} },
      nowMs: () => 1_000,
      botChain: { maxMoves: 1, random: () => 0.9 },
    });

    const response = await handler(jsonRequest({
      roomId: 'K7M2P9',
      moveId: 'move-with-bot',
      playerId: 'p1',
      command: { type: 'play', cards: [c('3')] },
    }));

    expect(await response.json()).toMatchObject({
      ok: true,
      version: 3,
      events: ['move_played', 'move_played'],
      botMoves: [{ playerId: 'p2', command: { type: 'play', cards: [c('4')] } }],
    });
    expect(await stateStore.get('K7M2P9')).toMatchObject({
      phase: 'playing',
      currentTurn: 'p3',
      hands: { p2: [] },
    });
    expect(eventLog.replayAfter('K7M2P9', 'p3').map((entry) => entry.payload.type)).toEqual(['move_played', 'move_played']);
  });

  test('returns 429 when the injected rate limiter rejects the move request', async () => {
    const handler = createMoveHandler({
      stateStore: new MemoryGameStateStore([['K7M2P9', playingState()]]),
      idempotency: new MemoryIdempotencyStore(),
      eventLog: new MemoryEventLog(),
      publisher: { async publish() {} },
      rateLimiter: {
        async check() {
          return { allowed: false, remaining: 0, resetAt: 7_000 };
        },
      },
      nowMs: () => 1_000,
    });

    const response = await handler(jsonRequest({
      roomId: 'K7M2P9',
      moveId: 'rate-limited',
      playerId: 'p1',
      command: { type: 'play', cards: [c('3')] },
    }));

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('6');
    expect(await response.json()).toEqual({ ok: false, error: 'ERR_RATE_LIMITED' });
  });

  test('blocks explicit BotID bot verdicts before applying moves', async () => {
    const stateStore = new MemoryGameStateStore([['K7M2P9', playingState()]]);
    const handler = createMoveHandler({
      stateStore,
      idempotency: new MemoryIdempotencyStore(),
      eventLog: new MemoryEventLog(),
      publisher: { async publish() {} },
      nowMs: () => 1_000,
    });

    const response = await handler(new Request('https://gdo.ax0x.ai/api/move', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-vercel-bot-detection': 'bot',
      },
      body: JSON.stringify({
        roomId: 'K7M2P9',
        moveId: 'move-bot',
        playerId: 'p1',
        command: { type: 'play', cards: [c('3')] },
      }),
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: 'ERR_BOT_DETECTED' });
    expect((await stateStore.get('K7M2P9'))?.version).toBe(1);
  });

  test('requires a valid player token when a room store is configured', async () => {
    const roomStore = new MemoryRoomStore();
    const created = await createRoom(roomStore, { hostHandle: 'fufu', random: () => 0 });
    const stateStore = new MemoryGameStateStore([[created.room.code, playingState()]]);
    const handler = createMoveHandler({
      stateStore,
      idempotency: new MemoryIdempotencyStore(),
      eventLog: new MemoryEventLog(),
      publisher: { async publish() {} },
      roomStore,
      nowMs: () => 1_000,
    });

    const denied = await handler(jsonRequest({
      roomId: created.room.code,
      moveId: 'move-denied',
      playerId: 'p1',
      token: 'wrong',
      command: { type: 'play', cards: [c('3')] },
    }));
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ ok: false, error: 'ERR_INVALID_PLAYER_TOKEN' });

    const allowed = await handler(jsonRequest({
      roomId: created.room.code,
      moveId: 'move-allowed',
      playerId: 'p1',
      token: created.playerToken,
      command: { type: 'play', cards: [c('3')] },
    }));
    expect(allowed.status).toBe(200);
  });
});
