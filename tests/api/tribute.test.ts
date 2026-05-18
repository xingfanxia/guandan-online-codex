import { describe, expect, test } from 'vitest';
import { createTributeSelectHandler, MemoryTributeSelectStore } from '../../api/tribute/select';
import type { Card, Rank, Suit } from '../../lib/game/cards';
import type { TributePendingState } from '../../lib/game/state';
import { MemoryEventLog } from '../../lib/realtime/eventLog';
import { MessageType } from '../../lib/realtime/messages';
import { MemoryGameStateStore } from '../../lib/realtime/stateStore';
import type { RealtimePublisher } from '../../lib/realtime/upstash';
import { DEFAULT_ROOM_RULES } from '../../lib/room/rules';

function c(rank: Rank, suit: Suit = 'spades', deck = 1): Card {
  return { rank, suit, deck: deck as 1 | 2 };
}

function request(body: unknown, method = 'POST'): Request {
  const init: RequestInit = { method, headers: { 'content-type': 'application/json' } };
  if (method === 'POST') init.body = JSON.stringify(body);
  return new Request('https://gdo.ax0x.ai/api/tribute/select', init);
}

function tributeState(): TributePendingState {
  return {
    phase: 'tribute-pending',
    mode: '4',
    levelRank: '2',
    players: [
      { id: 'p1', seat: 'east', team: 't1' },
      { id: 'p2', seat: 'south', team: 't2' },
      { id: 'p3', seat: 'west', team: 't1' },
      { id: 'p4', seat: 'north', team: 't2' },
    ],
    hands: {
      p1: [c('5'), c('6')],
      p2: [c('A'), c('3')],
      p3: [c('7'), c('8')],
      p4: [c('K'), c('4')],
    },
    undealt: [],
    obligations: [
      { from: 'p2', to: 'p3', fromPosition: 3, toPosition: 2 },
      { from: 'p4', to: 'p1', fromPosition: 4, toPosition: 1 },
    ],
    selectedTributes: {},
    firstLeader: 'p1',
    deadlineAt: '2026-05-18T00:00:15.000Z',
    version: 10,
  };
}

describe('tribute select API handler', () => {
  test('accepts legal player-picked tribute card', async () => {
    const store = new MemoryTributeSelectStore([{
      roomId: 'K7M2P9',
      playerId: 'p2',
      kind: 'tribute',
      hand: [c('A'), c('A', 'clubs'), c('5', 'hearts')],
      levelRank: '5',
      returnCardCap: 'rank_10',
    }]);
    const handler = createTributeSelectHandler({ store });

    const response = await handler(request({ roomId: 'K7M2P9', playerId: 'p2', card: c('A', 'clubs') }));

    expect(await response.json()).toEqual({ ok: true, kind: 'tribute', card: c('A', 'clubs') });
  });

  test('accepts legal return card and rejects capped high card when a low card exists', async () => {
    const store = new MemoryTributeSelectStore([{
      roomId: 'K7M2P9',
      playerId: 'p1',
      kind: 'return',
      hand: [c('J'), c('10')],
      levelRank: '5',
      returnCardCap: 'rank_10',
    }]);
    const handler = createTributeSelectHandler({ store });

    expect(await (await handler(request({ roomId: 'K7M2P9', playerId: 'p1', card: c('J') }))).json()).toEqual({
      ok: false,
      error: 'ERR_INVALID_RETURN_CARD',
    });
    expect(await (await handler(request({ roomId: 'K7M2P9', playerId: 'p1', card: c('10') }))).json()).toEqual({
      ok: true,
      kind: 'return',
      card: c('10'),
    });
  });

  test('returns named errors for missing sessions and invalid methods', async () => {
    const handler = createTributeSelectHandler({ store: new MemoryTributeSelectStore() });

    expect((await handler(request({}, 'GET'))).status).toBe(405);
    expect(await (await handler(request({ roomId: 'NOPE', playerId: 'p1', card: c('A') }))).json()).toEqual({
      ok: false,
      error: 'ERR_TRIBUTE_SELECTION_NOT_FOUND',
    });
  });

  test('stateful handler advances tribute and return phases through the game state store', async () => {
    const stateStore = new MemoryGameStateStore([['K7M2P9', tributeState()]]);
    const eventLog = new MemoryEventLog();
    const published: Array<{ channel: string; payload: string }> = [];
    const publisher: RealtimePublisher = {
      async publish(channel, payload) {
        published.push({ channel, payload });
      },
    };
    const handler = createTributeSelectHandler({
      stateStore,
      eventLog,
      publisher,
      rulesForRoom: () => ({ ...DEFAULT_ROOM_RULES, cardExchange: false }),
      returnDeadlineAt: () => '2026-05-18T00:00:30.000Z',
      exchangeDeadlineAt: () => '2026-05-18T00:00:45.000Z',
    });

    expect(await (await handler(request({ roomId: 'K7M2P9', playerId: 'p2', card: c('A') }))).json()).toMatchObject({
      ok: true,
      phase: 'tribute-pending',
      version: 11,
      events: [MessageType.StateResync],
    });
    expect(await (await handler(request({ roomId: 'K7M2P9', playerId: 'p4', card: c('K') }))).json()).toMatchObject({
      ok: true,
      phase: 'return-pending',
      version: 12,
      events: [MessageType.TributeCompleted, MessageType.ReturnRequired, MessageType.ReturnRequired],
    });
    expect(await (await handler(request({ roomId: 'K7M2P9', playerId: 'p3', card: c('7') }))).json()).toMatchObject({
      ok: true,
      phase: 'return-pending',
      version: 13,
    });
    expect(await (await handler(request({ roomId: 'K7M2P9', playerId: 'p1', card: c('5') }))).json()).toMatchObject({
      ok: true,
      phase: 'playing',
      version: 14,
      events: [MessageType.TributeResolved],
    });
    expect(await stateStore.get('K7M2P9')).toMatchObject({
      phase: 'playing',
      currentTurn: 'p1',
      hands: {
        p1: [c('6'), c('K')],
        p2: [c('3'), c('7')],
        p3: [c('8'), c('A')],
        p4: [c('4'), c('5')],
      },
    });
    expect(published.length).toBeGreaterThan(0);
    expect(JSON.stringify(eventLog.replayAfter('K7M2P9', 'p2'))).not.toContain('"p1":[{"rank"');
  });
});
