import { describe, expect, test } from 'vitest';
import { cardKey, type Card } from '../../lib/game/cards';
import { type ExchangeSelectPendingState, type PlayingState, type TributePendingState } from '../../lib/game/state';
import { buildClientPayload } from '../../lib/realtime/payload';
import { MESSAGE_TYPES, MessageType, type ServerEvent } from '../../lib/realtime/messages';

function c(rank: Card['rank'], suit: Card['suit'] = 'spades', deck = 1): Card {
  return { rank, suit, deck: deck as 1 | 2 };
}

function sampleState(): PlayingState {
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
      p1: [c('3'), c('4')],
      p2: [c('RJ', 'joker'), c('A', 'hearts')],
      p3: [c('7', 'clubs')],
      p4: [c('9', 'diamonds')],
    },
    undealt: [],
    finished: [],
    currentTurn: 'p1',
    currentTrick: { leader: 'p1', passes: [] },
    version: 9,
  };
}

function tributeState(): TributePendingState {
  const playing = sampleState();
  return {
    phase: 'tribute-pending',
    mode: playing.mode,
    levelRank: playing.levelRank,
    players: playing.players,
    hands: playing.hands,
    undealt: playing.undealt,
    obligations: [{ from: 'p2', to: 'p1', fromPosition: 4, toPosition: 1 }],
    selectedTributes: {},
    firstLeader: 'p1',
    deadlineAt: '2026-05-18T00:00:15.000Z',
    version: playing.version,
  };
}

function exchangeSelectState(): ExchangeSelectPendingState {
  const playing = sampleState();
  return {
    phase: 'exchange-select-pending',
    mode: playing.mode,
    levelRank: playing.levelRank,
    players: playing.players,
    hands: playing.hands,
    undealt: playing.undealt,
    direction: 'clockwise',
    cardCount: 3,
    deadlineAt: '2026-05-18T00:00:15.000Z',
    selections: {
      p2: [c('RJ', 'joker')],
    },
    firstLeader: 'p1',
    version: playing.version,
  };
}

function eventFor(type: (typeof MESSAGE_TYPES)[number]): ServerEvent {
  switch (type) {
    case MessageType.RoomJoined:
      return { type, playerId: 'p1' };
    case MessageType.MovePlayed:
      return { type, playerId: 'p1', cards: [c('3')] };
    case MessageType.TributePending:
      return { type, playerId: 'p2' };
    case MessageType.TributeCompleted:
      return { type, exchanges: [{ fromPlayerId: 'p2', toPlayerId: 'p1', card: c('A') }] };
    case MessageType.TributeResolved:
      return {
        type,
        exchanges: [{ fromPlayerId: 'p2', toPlayerId: 'p1', tributeCard: c('A'), returnCard: c('3') }],
        firstLeader: 'p2',
      };
    case MessageType.AntiTribute:
      return { type, team: 't2' };
    case MessageType.ReturnRequired:
      return { type, playerId: 'p1' };
    case MessageType.ExchangeVoteRequired:
      return { type, voterIds: ['p2', 'p4'], deadlineAt: '2026-05-18T00:00:15.000Z' };
    case MessageType.ExchangeVoteResolved:
      return { type, passed: true, yes: 2, required: 2, direction: 'clockwise' };
    case MessageType.ExchangeSelectRequired:
      return { type, playerId: 'p1', cardCount: 3, direction: 'clockwise', deadlineAt: '2026-05-18T00:00:30.000Z' };
    case MessageType.ExchangeCompleted:
      return { type, direction: 'clockwise', receivedCards: [c('3')] };
    case MessageType.RoundEnd:
      return { type, winnerTeam: 't1' };
    case MessageType.GameEnd:
      return { type, winnerTeam: 't1' };
    case MessageType.StateResync:
      return { type, reason: 'manual' };
    case MessageType.PlayerDc:
      return { type, playerId: 'p2' };
    case MessageType.PlayerReconnect:
      return { type, playerId: 'p2' };
    case MessageType.BotTakeover:
      return { type, playerId: 'p2', difficulty: 'medium' };
    case MessageType.ChatMessage:
      return { type, playerId: 'p1', text: 'hello' };
    case MessageType.Heartbeat:
      return { type, at: '2026-05-18T00:00:00.000Z' };
    case MessageType.Error:
      return { type, code: 'ERR_TEST', message: 'test error' };
  }
}

describe('buildClientPayload', () => {
  test('includes only recipient hand and public hand counts for every event type', () => {
    const state = sampleState();
    const p1Cards = state.hands.p1!.map(cardKey);
    const p2Cards = state.hands.p2!.map(cardKey);

    for (const type of MESSAGE_TYPES) {
      const payload = buildClientPayload('p1', eventFor(type), state);
      const serialized = JSON.stringify(payload);

      expect(payload.type).toBe(type);
      expect(payload.view.self?.hand.map(cardKey)).toEqual(state.hands.p1!.map(cardKey));
      expect(payload.view.handCounts).toEqual({ p1: 2, p2: 2, p3: 1, p4: 1 });
      for (const key of p1Cards) expect(serialized).toContain(key.split(':').at(-1)!);
      for (const key of p2Cards) expect(serialized).not.toContain(key);
    }
  });

  test('does not leak undealt cards or opponent hands to spectators', () => {
    const state = sampleState();
    state.undealt = [c('K', 'clubs')];
    const payload = buildClientPayload('spectator', { type: MessageType.StateResync, reason: 'spectator' }, state);
    const serialized = JSON.stringify(payload);

    expect(payload.view.self).toBeUndefined();
    expect(serialized).not.toContain(cardKey(state.undealt[0]!));
    expect(serialized).not.toContain(cardKey(state.hands.p2![0]!));
  });

  test('exposes tribute obligations without leaking opponent hands', () => {
    const payload = buildClientPayload('p1', { type: MessageType.StateResync, reason: 'tribute' }, tributeState());
    const serialized = JSON.stringify(payload);

    expect(payload.view.tribute).toEqual({
      obligations: [{ from: 'p2', to: 'p1', fromPosition: 4, toPosition: 1 }],
      deadlineAt: '2026-05-18T00:00:15.000Z',
    });
    expect(serialized).not.toContain(cardKey(c('RJ', 'joker')));
  });

  test('hides exchange selections while exposing direction and card count', () => {
    const payload = buildClientPayload('p1', { type: MessageType.StateResync, reason: 'exchange' }, exchangeSelectState());
    const serialized = JSON.stringify(payload);

    expect(payload.view.exchange).toEqual({
      direction: 'clockwise',
      cardCount: 3,
      deadlineAt: '2026-05-18T00:00:15.000Z',
    });
    expect(serialized).not.toContain(cardKey(c('RJ', 'joker')));
    expect(serialized).not.toContain('selections');
  });

  test('does not broadcast private received cards on exchange completion events', () => {
    const payload = buildClientPayload('p1', {
      type: MessageType.ExchangeCompleted,
      direction: 'clockwise',
      receivedCards: [c('RJ', 'joker')],
    }, sampleState());

    expect(payload.event).toEqual({ type: MessageType.ExchangeCompleted, direction: 'clockwise' });
    expect(JSON.stringify(payload)).not.toContain(cardKey(c('RJ', 'joker')));
  });
});
