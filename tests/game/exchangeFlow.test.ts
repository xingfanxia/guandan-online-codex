import { describe, expect, test } from 'vitest';
import type { Card, Rank, Suit } from '../../lib/game/cards';
import type { ExchangeSelectPendingState, ExchangeVotePendingState } from '../../lib/game/state';
import { submitExchangeSelection, submitExchangeVote } from '../../lib/game/exchangeFlow';
import { DEFAULT_ROOM_RULES } from '../../lib/room/rules';

function c(rank: Rank, suit: Suit = 'spades', deck = 1): Card {
  return { rank, suit, deck: deck as 1 | 2 };
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
  return {
    phase: 'exchange-select-pending',
    mode: '4',
    levelRank: '2',
    players: voteState().players,
    hands: voteState().hands,
    undealt: [],
    direction: 'clockwise',
    cardCount: 1,
    selections: {},
    firstLeader: 'p1',
    deadlineAt: '2026-05-18T00:00:30.000Z',
    version: 22,
  };
}

describe('exchange flow transitions', () => {
  test('records votes and opens exchange selection once the threshold passes', () => {
    const first = submitExchangeVote(voteState(), {
      playerId: 'p2',
      choice: 'yes',
      rules: DEFAULT_ROOM_RULES,
      direction: 'clockwise',
      deadlineAt: '2026-05-18T00:00:30.000Z',
    });
    expect(first).toMatchObject({
      ok: true,
      state: { phase: 'exchange-vote-pending', votes: { p2: 'yes' }, version: 21 },
      events: [{ type: 'state_resync', reason: 'exchange-vote:p2' }],
    });

    if (!first.ok || first.state.phase !== 'exchange-vote-pending') throw new Error('expected vote-pending state');
    const second = submitExchangeVote(first.state, {
      playerId: 'p4',
      choice: 'yes',
      rules: DEFAULT_ROOM_RULES,
      direction: 'clockwise',
      deadlineAt: '2026-05-18T00:00:30.000Z',
    });

    expect(second).toMatchObject({
      ok: true,
      state: {
        phase: 'exchange-select-pending',
        direction: 'clockwise',
        cardCount: 3,
        selections: {},
        firstLeader: 'p1',
        version: 22,
      },
      events: [
        { type: 'exchange_vote_resolved', passed: true, yes: 2, required: 2, direction: 'clockwise' },
        { type: 'exchange_select_required', playerId: 'p1' },
        { type: 'exchange_select_required', playerId: 'p2' },
        { type: 'exchange_select_required', playerId: 'p3' },
        { type: 'exchange_select_required', playerId: 'p4' },
      ],
    });
  });

  test('starts play when all eligible voters reject exchange', () => {
    const first = submitExchangeVote(voteState(), {
      playerId: 'p2',
      choice: 'no',
      rules: DEFAULT_ROOM_RULES,
      direction: 'clockwise',
      deadlineAt: '2026-05-18T00:00:30.000Z',
    });
    if (!first.ok || first.state.phase !== 'exchange-vote-pending') throw new Error('expected vote-pending state');

    const second = submitExchangeVote(first.state, {
      playerId: 'p4',
      choice: 'no',
      rules: DEFAULT_ROOM_RULES,
      direction: 'clockwise',
      deadlineAt: '2026-05-18T00:00:30.000Z',
    });

    expect(second).toMatchObject({
      ok: true,
      state: { phase: 'playing', currentTurn: 'p1', version: 22 },
      events: [{ type: 'exchange_vote_resolved', passed: false, yes: 0, required: 2 }],
    });
  });

  test('records selections and starts play with exchanged hands when all players select', () => {
    let state = selectState();
    for (const [playerId, cards] of [
      ['p1', [c('3')]],
      ['p2', [c('6')]],
      ['p3', [c('9')]],
    ] as const) {
      const partial = submitExchangeSelection(state, { playerId, cards });
      expect(partial).toMatchObject({
        ok: true,
        state: { phase: 'exchange-select-pending' },
        events: [{ type: 'state_resync', reason: `exchange-select:${playerId}` }],
      });
      if (!partial.ok || partial.state.phase !== 'exchange-select-pending') throw new Error('expected select-pending state');
      state = partial.state;
    }

    const completed = submitExchangeSelection(state, { playerId: 'p4', cards: [c('Q')] });

    expect(completed).toMatchObject({
      ok: true,
      state: {
        phase: 'playing',
        currentTurn: 'p1',
        hands: {
          p1: [c('4'), c('5'), c('Q')],
          p2: [c('7'), c('8'), c('3')],
          p3: [c('10'), c('J'), c('6')],
          p4: [c('K'), c('A'), c('9')],
        },
        version: 26,
      },
      events: [{ type: 'exchange_completed', direction: 'clockwise' }],
    });
  });
});
