import { describe, expect, test } from 'vitest';
import { createNextRoundHandler } from '../../api/round/next';
import type { Card, Rank, Suit } from '../../lib/game/cards';
import { generateDoubleDeck } from '../../lib/game/cards';
import type { RoundEndState } from '../../lib/game/state';
import { MemoryEventLog } from '../../lib/realtime/eventLog';
import { MemoryIdempotencyStore } from '../../lib/realtime/idempotency';
import { MessageType } from '../../lib/realtime/messages';
import { MemoryGameStateStore } from '../../lib/realtime/stateStore';
import type { RealtimePublisher } from '../../lib/realtime/upstash';
import { createRoom, MemoryRoomStore } from '../../lib/room/lifecycle';
import { DEFAULT_ROOM_RULES } from '../../lib/room/rules';

function c(rank: Rank, suit: Suit = 'spades', deck = 1): Card {
  return { rank, suit, deck: deck as 1 | 2 };
}

function request(body: unknown, method = 'POST'): Request {
  const init: RequestInit = { method, headers: { 'content-type': 'application/json' } };
  if (method === 'POST') init.body = JSON.stringify(body);
  return new Request('https://gdo.ax0x.ai/api/round/next', init);
}

function roundEnd(): RoundEndState {
  return {
    phase: 'round-end',
    mode: '4',
    levelRank: '5',
    players: [
      { id: 'p1', seat: 'east', team: 't1' },
      { id: 'p2', seat: 'south', team: 't2' },
      { id: 'p3', seat: 'west', team: 't1' },
      { id: 'p4', seat: 'north', team: 't2' },
    ],
    hands: {},
    undealt: [],
    placements: [
      { playerId: 'p1', position: 1, team: 't1' },
      { playerId: 'p3', position: 2, team: 't1' },
      { playerId: 'p2', position: 3, team: 't2' },
      { playerId: 'p4', position: 4, team: 't2' },
    ],
    winnerTeam: 't1',
    upgrade: 3,
    version: 9,
  };
}

function deps(state: RoundEndState, deck: Card[] = generateDoubleDeck()) {
  const stateStore = new MemoryGameStateStore([['K7M2P9', state]]);
  const idempotency = new MemoryIdempotencyStore();
  const eventLog = new MemoryEventLog();
  const published: Array<{ channel: string; payload: string }> = [];
  const publisher: RealtimePublisher = {
    async publish(channel, payload) {
      published.push({ channel, payload });
    },
  };
  return { stateStore, idempotency, eventLog, publisher, published, deck };
}

function plainDeck(): Card[] {
  const ranks: Rank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  return Array.from({ length: 108 }, (_, index) => c(ranks[index % ranks.length]!, 'spades', index % 2 === 0 ? 1 : 2));
}

describe('api/round/next handler', () => {
  test('advances a stored round-end state into tribute-pending and publishes filtered events idempotently', async () => {
    const d = deps(roundEnd(), plainDeck());
    const handler = createNextRoundHandler({
      ...d,
      deckForRoom: () => d.deck,
      rulesForRoom: () => ({ ...DEFAULT_ROOM_RULES, antiTributeCondition: 'disabled', tributeSelection: 'player_picks' }),
      deadlineAt: () => '2026-05-18T00:00:15.000Z',
      nowMs: () => 1_000,
    });
    const body = { roomId: 'K7M2P9', transitionId: 'round-1' };

    const first = await handler(request(body));
    const firstJson = await first.json();
    const second = await handler(request(body));

    expect(firstJson).toMatchObject({
      ok: true,
      phase: 'tribute-pending',
      version: 10,
      view: {
        phase: 'tribute-pending',
        mode: '4',
        self: { playerId: 'p1' },
      },
      events: [MessageType.TributePending, MessageType.TributePending],
    });
    expect(firstJson.view.self.hand).toHaveLength(27);
    expect(await second.json()).toEqual(firstJson);
    expect((await d.stateStore.get('K7M2P9'))?.phase).toBe('tribute-pending');
    expect(d.published).toHaveLength(8);
    expect(d.eventLog.replayAfter('K7M2P9', 'p2')).toHaveLength(2);
    expect(JSON.stringify(d.eventLog.replayAfter('K7M2P9', 'p1'))).not.toContain('RJ');
  });

  test('auto-resolves default tribute picks and bot returns after advancing a bot-filled round', async () => {
    const state = roundEnd();
    state.players = [
      { id: 'p1', seat: 'east', team: 't1', kind: 'human' },
      { id: 'p2', seat: 'south', team: 't2', kind: 'bot', botDifficulty: 'easy' },
      { id: 'p3', seat: 'west', team: 't1', kind: 'bot', botDifficulty: 'easy' },
      { id: 'p4', seat: 'north', team: 't2', kind: 'bot', botDifficulty: 'easy' },
    ];
    const d = deps(state, plainDeck());
    const handler = createNextRoundHandler({
      ...d,
      deckForRoom: () => d.deck,
      rulesForRoom: () => ({ ...DEFAULT_ROOM_RULES, antiTributeCondition: 'disabled' }),
      deadlineAt: () => '2026-05-18T00:00:15.000Z',
      exchangeDeadlineAt: () => '2026-05-18T00:00:30.000Z',
      nowMs: () => 1_000,
    });

    const response = await handler(request({ roomId: 'K7M2P9', transitionId: 'round-auto' }));
    const body = await response.json();

    expect(body).toMatchObject({
      ok: true,
      phase: 'return-pending',
      version: 13,
      view: { phase: 'return-pending', self: { playerId: 'p1' } },
      events: [
        MessageType.TributePending,
        MessageType.TributePending,
        MessageType.StateResync,
        MessageType.TributeCompleted,
        MessageType.ReturnRequired,
        MessageType.ReturnRequired,
        MessageType.StateResync,
      ],
    });
    expect(await d.stateStore.get('K7M2P9')).toMatchObject({
      phase: 'return-pending',
      selectedReturns: { p3: expect.any(Object) },
    });
  });

  test('anti-tribute skips tribute and opens exchange voting when the rule is enabled', async () => {
    const antiDeck = [
      c('3'), c('RJ', 'joker', 1), c('4'), c('RJ', 'joker', 2),
      ...generateDoubleDeck().slice(4),
    ];
    const d = deps(roundEnd(), antiDeck);
    const handler = createNextRoundHandler({
      ...d,
      deckForRoom: () => d.deck,
      rulesForRoom: () => ({ ...DEFAULT_ROOM_RULES, cardExchange: true }),
      deadlineAt: () => '2026-05-18T00:00:15.000Z',
      exchangeDeadlineAt: () => '2026-05-18T00:00:30.000Z',
      nowMs: () => 1_000,
    });

    const response = await handler(request({ roomId: 'K7M2P9', transitionId: 'round-2' }));
    const body = await response.json();

    expect(body).toMatchObject({
      ok: true,
      phase: 'exchange-vote-pending',
      events: [MessageType.AntiTribute, MessageType.ExchangeVoteRequired],
    });
    expect(await d.stateStore.get('K7M2P9')).toMatchObject({
      phase: 'exchange-vote-pending',
      eligibleVoters: ['p2', 'p4'],
      votes: {},
    });
  });

  test('publishes a resync when next round starts directly with no tribute or exchange events', async () => {
    const d = deps(roundEnd(), plainDeck());
    const handler = createNextRoundHandler({
      ...d,
      deckForRoom: () => d.deck,
      rulesForRoom: () => ({ ...DEFAULT_ROOM_RULES, tributeEnabled: false, cardExchange: false }),
      deadlineAt: () => '2026-05-18T00:00:15.000Z',
      nowMs: () => 1_000,
    });

    const response = await handler(request({ roomId: 'K7M2P9', transitionId: 'round-direct' }));

    expect(await response.json()).toMatchObject({
      ok: true,
      phase: 'playing',
      view: { phase: 'playing', self: { playerId: 'p1' } },
      events: [MessageType.StateResync],
    });
    expect(d.eventLog.replayAfter('K7M2P9', 'p1').map((entry) => entry.payload.type)).toEqual([MessageType.StateResync]);
  });

  test('returns named errors for invalid method, missing room, and non-round-end state', async () => {
    const d = deps(roundEnd());
    const handler = createNextRoundHandler({
      ...d,
      deckForRoom: () => d.deck,
      rulesForRoom: () => DEFAULT_ROOM_RULES,
      deadlineAt: () => '2026-05-18T00:00:15.000Z',
      nowMs: () => 1_000,
    });

    expect(await (await handler(request({}, 'GET'))).json()).toEqual({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' });
    expect(await (await handler(request({ roomId: 'NOPE', transitionId: 'round-1' }))).json()).toEqual({
      ok: false,
      error: 'ERR_ROOM_NOT_FOUND',
    });

    await d.stateStore.set('K7M2P9', {
      phase: 'waiting',
      mode: '4',
      levelRank: '5',
      players: [],
      version: 1,
    });
    expect(await (await handler(request({ roomId: 'K7M2P9', transitionId: 'round-3' }))).json()).toEqual({
      ok: false,
      error: 'ERR_NOT_ROUND_END',
    });
  });

  test('requires a valid player token when a room store is configured', async () => {
    const roomStore = new MemoryRoomStore();
    const created = await createRoom(roomStore, { hostHandle: 'fufu', random: () => 0 });
    const d = deps(roundEnd(), plainDeck());
    await d.stateStore.set(created.room.code, roundEnd());
    const handler = createNextRoundHandler({
      ...d,
      roomStore,
      deckForRoom: () => d.deck,
      rulesForRoom: () => ({ ...DEFAULT_ROOM_RULES, tributeEnabled: false }),
      nowMs: () => 1_000,
    });

    const denied = await handler(request({
      roomId: created.room.code,
      transitionId: 'round-denied',
      playerId: 'p1',
      token: 'wrong',
    }));
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ ok: false, error: 'ERR_INVALID_PLAYER_TOKEN' });

    const allowed = await handler(request({
      roomId: created.room.code,
      transitionId: 'round-allowed',
      playerId: 'p1',
      token: created.playerToken,
    }));
    expect(allowed.status).toBe(200);
  });
});
