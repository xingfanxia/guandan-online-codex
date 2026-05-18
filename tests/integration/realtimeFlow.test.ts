import { describe, expect, test } from 'vitest';
import { createMoveHandler, MemoryGameStateStore } from '../../api/move';
import { createSseHandler } from '../../api/sse/[roomId]';
import type { Card } from '../../lib/game/cards';
import type { PlayingState } from '../../lib/game/state';
import { MemoryEventLog } from '../../lib/realtime/eventLog';
import { MemoryIdempotencyStore } from '../../lib/realtime/idempotency';

function c(rank: Card['rank'], suit: Card['suit'] = 'spades', deck = 1): Card {
  return { rank, suit, deck: deck as 1 | 2 };
}

function state(): PlayingState {
  return {
    phase: 'playing',
    mode: '4',
    levelRank: '2',
    players: [
      { id: 'p1', seat: 'east', team: 't1' },
      { id: 'p2', seat: 'south', team: 't2' },
    ],
    hands: {
      p1: [c('3')],
      p2: [c('RJ', 'joker')],
    },
    undealt: [],
    finished: [],
    currentTurn: 'p1',
    currentTrick: { leader: 'p1', passes: [] },
    version: 1,
  };
}

describe('realtime move to SSE replay flow', () => {
  test('stores per-player filtered payloads that SSE can replay', async () => {
    const eventLog = new MemoryEventLog();
    const move = createMoveHandler({
      stateStore: new MemoryGameStateStore([['K7M2P9', state()]]),
      idempotency: new MemoryIdempotencyStore(),
      eventLog,
      publisher: { async publish() {} },
      nowMs: () => 1_000,
    });
    const sse = createSseHandler({ eventLog, nowIso: () => '2026-05-18T00:00:00.000Z' });

    const moveResponse = await move(new Request('https://gdo.ax0x.ai/api/move', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        roomId: 'K7M2P9',
        moveId: 'move-1',
        playerId: 'p1',
        command: { type: 'play', cards: [c('3')] },
      }),
    }));
    const p1Replay = await sse(new Request('https://gdo.ax0x.ai/api/sse/K7M2P9?playerId=p1'), { roomId: 'K7M2P9' });
    const p2Replay = await sse(new Request('https://gdo.ax0x.ai/api/sse/K7M2P9?playerId=p2'), { roomId: 'K7M2P9' });

    expect(moveResponse.status).toBe(200);
    expect(await p1Replay.text()).not.toContain('RJ');
    const p2Body = await p2Replay.text();
    expect(p2Body).toContain('event: move_played');
    expect(p2Body).toContain('RJ');
  });
});
