import { describe, expect, test } from 'vitest';
import { createTickHandler } from '../../api/tick';
import type { Card, Rank, Suit } from '../../lib/game/cards';
import type { PlayingState } from '../../lib/game/state';
import { MemoryEventLog } from '../../lib/realtime/eventLog';
import { MemoryGameStateStore } from '../../lib/realtime/stateStore';
import type { RealtimePublisher } from '../../lib/realtime/upstash';

function c(rank: Rank, suit: Suit = 'spades', deck = 1): Card {
  return { rank, suit, deck: deck as 1 | 2 };
}

function request(body: unknown, secret = 'tick-secret'): Request {
  return new Request('https://gdo.ax0x.ai/api/tick', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-secret': secret },
    body: JSON.stringify(body),
  });
}

function state(): PlayingState {
  return {
    phase: 'playing',
    mode: '4',
    levelRank: '2',
    players: [
      { id: 'p1', seat: 'east', team: 't1' },
      { id: 'p2', seat: 'south', team: 't2', kind: 'bot', botDifficulty: 'easy' },
      { id: 'p3', seat: 'west', team: 't1' },
      { id: 'p4', seat: 'north', team: 't2' },
    ],
    hands: {
      p1: [c('3')],
      p2: [c('4')],
      p3: [c('5')],
      p4: [c('6')],
    },
    undealt: [],
    finished: [],
    currentTurn: 'p2',
    currentTrick: {
      leader: 'p1',
      currentPlay: {
        playerId: 'p1',
        cards: [c('3')],
        pattern: { kind: 'single', length: 1, primaryRank: '3', wildcardsUsed: 0 },
      },
      passes: [],
    },
    version: 2,
  };
}

describe('api/tick handler', () => {
  test('requires internal secret when configured', async () => {
    const handler = createTickHandler({
      stateStore: new MemoryGameStateStore(),
      eventLog: new MemoryEventLog(),
      publisher: { async publish() {} },
      internalSecret: 'tick-secret',
    });

    expect(await (await handler(request({ roomId: 'K7M2P9' }, 'wrong'))).json()).toEqual({
      ok: false,
      error: 'ERR_UNAUTHORIZED',
    });
  });

  test('runs bot turns, persists state, and publishes filtered events', async () => {
    const stateStore = new MemoryGameStateStore([['K7M2P9', state()]]);
    const eventLog = new MemoryEventLog();
    const published: Array<{ channel: string; payload: string }> = [];
    const publisher: RealtimePublisher = {
      async publish(channel, payload) {
        published.push({ channel, payload });
      },
    };
    const handler = createTickHandler({
      stateStore,
      eventLog,
      publisher,
      internalSecret: 'tick-secret',
      random: () => 0.9,
    });

    const response = await handler(request({ roomId: 'K7M2P9', maxMoves: 1 }));

    expect(await response.json()).toMatchObject({
      ok: true,
      version: 3,
      events: ['move_played'],
      botMoves: [{ playerId: 'p2', command: { type: 'play', cards: [c('4')] } }],
    });
    expect(await stateStore.get('K7M2P9')).toMatchObject({
      phase: 'playing',
      currentTurn: 'p3',
      hands: { p2: [] },
    });
    expect(published).toHaveLength(4);
    expect(eventLog.replayAfter('K7M2P9', 'p3').map((entry) => entry.payload.type)).toEqual(['move_played']);
  });
});
