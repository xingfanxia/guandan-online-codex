import { describe, expect, test } from 'vitest';
import { createExchangeSelectHandler, MemoryExchangeSelectStore } from '../../api/exchange/select';
import { createExchangeVoteHandler, MemoryExchangeVoteStore } from '../../api/exchange/vote';
import type { Card, Rank, Suit } from '../../lib/game/cards';
import type { ExchangeSelectPendingState, ExchangeVotePendingState } from '../../lib/game/state';
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
  return new Request('https://gdo.ax0x.ai/api/exchange', init);
}

function voteState(): ExchangeVotePendingState {
  return {
    phase: 'exchange-vote-pending',
    mode: '4',
    levelRank: '2',
    players: [
      { id: 'p1', seat: 'east', team: 't1' },
      { id: 'p2', seat: 'south', team: 't2' },
      { id: 'p3', seat: 'west', team: 't1' },
      { id: 'p4', seat: 'north', team: 't2' },
    ],
    hands: {
      p1: [c('3'), c('4'), c('5')],
      p2: [c('6'), c('7'), c('8')],
      p3: [c('9'), c('10'), c('J')],
      p4: [c('Q'), c('K'), c('A')],
    },
    undealt: [],
    eligibleVoters: ['p2', 'p4'],
    votes: {},
    firstLeader: 'p1',
    deadlineAt: '2026-05-18T00:00:15.000Z',
    version: 20,
  };
}

function selectState(): ExchangeSelectPendingState {
  const base = voteState();
  return {
    phase: 'exchange-select-pending',
    mode: base.mode,
    levelRank: base.levelRank,
    players: base.players,
    hands: base.hands,
    undealt: [],
    direction: 'clockwise',
    cardCount: 1,
    selections: {},
    firstLeader: 'p1',
    deadlineAt: '2026-05-18T00:00:30.000Z',
    version: 22,
  };
}

describe('exchange API handlers', () => {
  test('casts losing-team votes and resolves direction once threshold passes', async () => {
    const store = new MemoryExchangeVoteStore([{
      roomId: 'K7M2P9',
      eligibleVoters: ['p2', 'p4'],
      votes: {},
      threshold: 'majority',
      deadlineAt: '2026-05-18T00:00:15.000Z',
    }]);
    const handler = createExchangeVoteHandler({ store, random: () => 0.25 });

    const first = await handler(request({ roomId: 'K7M2P9', playerId: 'p2', choice: 'yes' }));
    const second = await handler(request({ roomId: 'K7M2P9', playerId: 'p4', choice: 'yes' }));

    expect(await first.json()).toMatchObject({ ok: true, result: { passed: false, yes: 1, required: 2 } });
    expect(await second.json()).toMatchObject({ ok: true, result: { passed: true, direction: 'clockwise' } });
  });

  test('rejects ineligible exchange voters and malformed requests', async () => {
    const store = new MemoryExchangeVoteStore([{
      roomId: 'K7M2P9',
      eligibleVoters: ['p2'],
      votes: {},
      threshold: 'majority',
      deadlineAt: '2026-05-18T00:00:15.000Z',
    }]);
    const handler = createExchangeVoteHandler({ store });

    expect((await handler(request({}, 'GET'))).status).toBe(405);
    expect(await (await handler(request({ roomId: 'NOPE', playerId: 'p2', choice: 'yes' }))).json()).toEqual({ ok: false, error: 'ERR_EXCHANGE_NOT_FOUND' });
    expect(await (await handler(request({ roomId: 'K7M2P9', playerId: 'p1', choice: 'yes' }))).json()).toEqual({ ok: false, error: 'ERR_NOT_EXCHANGE_VOTER' });
  });

  test('records selections and only returns recipient-private received cards on completion', async () => {
    const store = new MemoryExchangeSelectStore([{
      roomId: 'K7M2P9',
      playerOrder: ['p1', 'p2'],
      hands: {
        p1: [c('A'), c('3')],
        p2: [c('K'), c('4')],
      },
      selections: {},
      direction: 'clockwise',
      cardCount: 1,
      deadlineAt: '2026-05-18T00:00:30.000Z',
    }]);
    const handler = createExchangeSelectHandler({ store });

    const first = await handler(request({ roomId: 'K7M2P9', playerId: 'p1', cards: [c('A')] }));
    const second = await handler(request({ roomId: 'K7M2P9', playerId: 'p2', cards: [c('K')] }));
    const secondBody = await second.json();

    expect(await first.json()).toEqual({ ok: true, completed: false });
    expect(secondBody).toEqual({ ok: true, completed: true, receivedCards: [c('A')] });
    expect(JSON.stringify(secondBody)).not.toContain('"hands"');
  });

  test('rejects invalid exchange selections', async () => {
    const store = new MemoryExchangeSelectStore([{
      roomId: 'K7M2P9',
      playerOrder: ['p1'],
      hands: { p1: [c('A')] },
      selections: {},
      direction: 'clockwise',
      cardCount: 1,
      deadlineAt: '2026-05-18T00:00:30.000Z',
    }]);
    const handler = createExchangeSelectHandler({ store });

    expect(await (await handler(request({ roomId: 'K7M2P9', playerId: 'p1', cards: [c('K')] }))).json()).toEqual({
      ok: false,
      error: 'ERR_INVALID_EXCHANGE_SELECTION',
    });
  });

  test('stateful vote handler transitions stored exchange vote into select-pending', async () => {
    const stateStore = new MemoryGameStateStore([['K7M2P9', voteState()]]);
    const eventLog = new MemoryEventLog();
    const published: Array<{ channel: string; payload: string }> = [];
    const publisher: RealtimePublisher = {
      async publish(channel, payload) {
        published.push({ channel, payload });
      },
    };
    const handler = createExchangeVoteHandler({
      stateStore,
      eventLog,
      publisher,
      rulesForRoom: () => DEFAULT_ROOM_RULES,
      direction: () => 'clockwise',
      deadlineAt: () => '2026-05-18T00:00:30.000Z',
    });

    expect(await (await handler(request({ roomId: 'K7M2P9', playerId: 'p2', choice: 'yes' }))).json()).toMatchObject({
      ok: true,
      phase: 'exchange-vote-pending',
      version: 21,
      events: [MessageType.StateResync],
    });
    expect(await (await handler(request({ roomId: 'K7M2P9', playerId: 'p4', choice: 'yes' }))).json()).toMatchObject({
      ok: true,
      phase: 'exchange-select-pending',
      version: 22,
      events: [
        MessageType.ExchangeVoteResolved,
        MessageType.ExchangeSelectRequired,
        MessageType.ExchangeSelectRequired,
        MessageType.ExchangeSelectRequired,
        MessageType.ExchangeSelectRequired,
      ],
    });
    expect(await stateStore.get('K7M2P9')).toMatchObject({
      phase: 'exchange-select-pending',
      direction: 'clockwise',
      cardCount: 3,
    });
    expect(published.length).toBeGreaterThan(0);
    expect(JSON.stringify(eventLog.replayAfter('K7M2P9', 'p1'))).not.toContain('"p2":[{"rank"');
  });

  test('stateful select handler transitions stored exchange selection into playing', async () => {
    const stateStore = new MemoryGameStateStore([['K7M2P9', selectState()]]);
    const handler = createExchangeSelectHandler({
      stateStore,
      eventLog: new MemoryEventLog(),
      publisher: { async publish() {} },
    });

    for (const [playerId, cards] of [
      ['p1', [c('3')]],
      ['p2', [c('6')]],
      ['p3', [c('9')]],
    ] as const) {
      expect(await (await handler(request({ roomId: 'K7M2P9', playerId, cards }))).json()).toMatchObject({
        ok: true,
        phase: 'exchange-select-pending',
      });
    }

    expect(await (await handler(request({ roomId: 'K7M2P9', playerId: 'p4', cards: [c('Q')] }))).json()).toMatchObject({
      ok: true,
      phase: 'playing',
      version: 26,
      events: [MessageType.ExchangeCompleted],
    });
    expect(await stateStore.get('K7M2P9')).toMatchObject({
      phase: 'playing',
      currentTurn: 'p1',
      hands: {
        p1: [c('4'), c('5'), c('Q')],
        p2: [c('7'), c('8'), c('3')],
        p3: [c('10'), c('J'), c('6')],
        p4: [c('K'), c('A'), c('9')],
      },
    });
  });
});
