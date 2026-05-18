import { describe, expect, test } from 'vitest';
import type { Card, Rank, Suit } from '../../lib/game/cards';
import type { ReturnPendingState, TributePendingState } from '../../lib/game/state';
import { submitReturnSelection, submitTributeSelection } from '../../lib/game/tributeFlow';
import { DEFAULT_ROOM_RULES } from '../../lib/room/rules';

function c(rank: Rank, suit: Suit = 'spades', deck = 1): Card {
  return { rank, suit, deck: deck as 1 | 2 };
}

function tributeState(overrides: Partial<TributePendingState> = {}): TributePendingState {
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
    ...overrides,
  };
}

function submitBothTributes(): ReturnPendingState {
  const first = submitTributeSelection(tributeState(), {
    playerId: 'p2',
    card: c('A'),
    rules: DEFAULT_ROOM_RULES,
    deadlineAt: '2026-05-18T00:00:30.000Z',
  });
  if (!first.ok || first.state.phase !== 'tribute-pending') throw new Error('expected partial tribute state');

  const second = submitTributeSelection(first.state, {
    playerId: 'p4',
    card: c('K'),
    rules: DEFAULT_ROOM_RULES,
    deadlineAt: '2026-05-18T00:00:30.000Z',
  });
  if (!second.ok || second.state.phase !== 'return-pending') throw new Error('expected return-pending state');
  return second.state;
}

describe('tribute flow transitions', () => {
  test('records tribute selections and opens return-pending once all obligations are selected', () => {
    const first = submitTributeSelection(tributeState(), {
      playerId: 'p2',
      card: c('A'),
      rules: DEFAULT_ROOM_RULES,
      deadlineAt: '2026-05-18T00:00:30.000Z',
    });
    expect(first).toMatchObject({
      ok: true,
      state: { phase: 'tribute-pending', selectedTributes: { p2: c('A') }, version: 11 },
      events: [{ type: 'state_resync', reason: 'tribute:p2' }],
    });

    if (!first.ok || first.state.phase !== 'tribute-pending') throw new Error('expected partial tribute state');
    const second = submitTributeSelection(first.state, {
      playerId: 'p4',
      card: c('K'),
      rules: DEFAULT_ROOM_RULES,
      deadlineAt: '2026-05-18T00:00:30.000Z',
    });

    expect(second).toMatchObject({
      ok: true,
      state: {
        phase: 'return-pending',
        exchanges: [
          { from: 'p2', to: 'p3', tributeCard: c('A') },
          { from: 'p4', to: 'p1', tributeCard: c('K') },
        ],
        selectedReturns: {},
        firstLeader: 'p2',
        version: 12,
      },
      events: [
        { type: 'tribute_completed' },
        { type: 'return_required', playerId: 'p3' },
        { type: 'return_required', playerId: 'p1' },
      ],
    });
  });

  test('applies return cards and starts normal play when exchange is disabled', () => {
    const returnPending = submitBothTributes();
    const first = submitReturnSelection(returnPending, {
      playerId: 'p3',
      card: c('7'),
      rules: { ...DEFAULT_ROOM_RULES, cardExchange: false },
      deadlineAt: '2026-05-18T00:00:45.000Z',
    });
    expect(first).toMatchObject({
      ok: true,
      state: { phase: 'return-pending', selectedReturns: { p3: c('7') }, version: 13 },
      events: [{ type: 'state_resync', reason: 'return:p3' }],
    });

    if (!first.ok || first.state.phase !== 'return-pending') throw new Error('expected partial return state');
    const second = submitReturnSelection(first.state, {
      playerId: 'p1',
      card: c('5'),
      rules: { ...DEFAULT_ROOM_RULES, cardExchange: false },
      deadlineAt: '2026-05-18T00:00:45.000Z',
    });

    expect(second).toMatchObject({
      ok: true,
      state: {
        phase: 'playing',
        currentTurn: 'p2',
        currentTrick: { leader: 'p2', passes: [] },
        hands: {
          p1: [c('6'), c('K')],
          p2: [c('3'), c('7')],
          p3: [c('8'), c('A')],
          p4: [c('4'), c('5')],
        },
        version: 14,
      },
      events: [{ type: 'tribute_resolved', firstLeader: 'p2' }],
    });
  });

  test('single tribute gives the first lead to the tributer', () => {
    const single = tributeState({
      obligations: [{ from: 'p4', to: 'p1', fromPosition: 4, toPosition: 1 }],
      hands: {
        p1: [c('5'), c('6')],
        p2: [c('A'), c('3')],
        p3: [c('7'), c('8')],
        p4: [c('K'), c('4')],
      },
    });
    const tribute = submitTributeSelection(single, {
      playerId: 'p4',
      card: c('K'),
      rules: DEFAULT_ROOM_RULES,
      deadlineAt: '2026-05-18T00:00:30.000Z',
    });
    if (!tribute.ok || tribute.state.phase !== 'return-pending') throw new Error('expected return-pending state');

    const returned = submitReturnSelection(tribute.state, {
      playerId: 'p1',
      card: c('5'),
      rules: { ...DEFAULT_ROOM_RULES, cardExchange: false },
      deadlineAt: '2026-05-18T00:00:45.000Z',
    });

    expect(returned).toMatchObject({
      ok: true,
      state: {
        phase: 'playing',
        currentTurn: 'p4',
        currentTrick: { leader: 'p4', passes: [] },
      },
      events: [{ type: 'tribute_resolved', firstLeader: 'p4' }],
    });
  });

  test('same-rank double tribute gives the first lead to head players next seat', () => {
    const tied = tributeState({
      obligations: [
        { from: 'p2', to: 'p1', fromPosition: 3, toPosition: 2 },
        { from: 'p4', to: 'p3', fromPosition: 4, toPosition: 1 },
      ],
      firstLeader: 'p3',
      hands: {
        p1: [c('5'), c('6')],
        p2: [c('K'), c('3')],
        p3: [c('7'), c('8')],
        p4: [c('K', 'hearts'), c('4')],
      },
    });

    const first = submitTributeSelection(tied, {
      playerId: 'p2',
      card: c('K'),
      rules: DEFAULT_ROOM_RULES,
      deadlineAt: '2026-05-18T00:00:30.000Z',
    });
    if (!first.ok || first.state.phase !== 'tribute-pending') throw new Error('expected partial tribute state');
    const second = submitTributeSelection(first.state, {
      playerId: 'p4',
      card: c('K', 'hearts'),
      rules: DEFAULT_ROOM_RULES,
      deadlineAt: '2026-05-18T00:00:30.000Z',
    });

    expect(second).toMatchObject({
      ok: true,
      state: {
        phase: 'return-pending',
        firstLeader: 'p4',
      },
    });
  });

  test('opens exchange voting after return cards when exchange is enabled', () => {
    const returnPending = submitBothTributes();
    const first = submitReturnSelection(returnPending, {
      playerId: 'p3',
      card: c('7'),
      rules: { ...DEFAULT_ROOM_RULES, cardExchange: true },
      deadlineAt: '2026-05-18T00:00:45.000Z',
    });
    if (!first.ok || first.state.phase !== 'return-pending') throw new Error('expected partial return state');

    const second = submitReturnSelection(first.state, {
      playerId: 'p1',
      card: c('5'),
      rules: { ...DEFAULT_ROOM_RULES, cardExchange: true },
      deadlineAt: '2026-05-18T00:00:45.000Z',
    });

    expect(second).toMatchObject({
      ok: true,
      state: {
        phase: 'exchange-vote-pending',
        eligibleVoters: ['p2', 'p4'],
        votes: {},
        deadlineAt: '2026-05-18T00:00:45.000Z',
        version: 14,
      },
      events: [
        { type: 'tribute_resolved', firstLeader: 'p2' },
        { type: 'exchange_vote_required', voterIds: ['p2', 'p4'] },
      ],
    });
  });

  test('opens exchange selection after returns when the post-round vote already passed', () => {
    const returnPending = {
      ...submitBothTributes(),
      exchangeVotePassed: true,
    };
    const first = submitReturnSelection(returnPending, {
      playerId: 'p3',
      card: c('7'),
      rules: { ...DEFAULT_ROOM_RULES, cardExchange: true },
      deadlineAt: '2026-05-18T00:00:45.000Z',
      exchangeDirection: 'clockwise',
    });
    if (!first.ok || first.state.phase !== 'return-pending') throw new Error('expected partial return state');

    const second = submitReturnSelection(first.state, {
      playerId: 'p1',
      card: c('5'),
      rules: { ...DEFAULT_ROOM_RULES, cardExchange: true },
      deadlineAt: '2026-05-18T00:00:45.000Z',
      exchangeDirection: 'clockwise',
    });

    expect(second).toMatchObject({
      ok: true,
      state: {
        phase: 'exchange-select-pending',
        direction: 'clockwise',
        cardCount: 3,
        firstLeader: 'p2',
        deadlineAt: '2026-05-18T00:00:45.000Z',
        version: 14,
      },
      events: [
        { type: 'tribute_resolved', firstLeader: 'p2' },
        { type: 'exchange_select_required', playerId: 'p1', direction: 'clockwise' },
        { type: 'exchange_select_required', playerId: 'p2', direction: 'clockwise' },
        { type: 'exchange_select_required', playerId: 'p3', direction: 'clockwise' },
        { type: 'exchange_select_required', playerId: 'p4', direction: 'clockwise' },
      ],
    });
  });

  test('starts normal play after returns when the post-round exchange vote failed', () => {
    const returnPending = {
      ...submitBothTributes(),
      exchangeVotePassed: false,
    };
    const first = submitReturnSelection(returnPending, {
      playerId: 'p3',
      card: c('7'),
      rules: { ...DEFAULT_ROOM_RULES, cardExchange: true },
      deadlineAt: '2026-05-18T00:00:45.000Z',
    });
    if (!first.ok || first.state.phase !== 'return-pending') throw new Error('expected partial return state');

    const second = submitReturnSelection(first.state, {
      playerId: 'p1',
      card: c('5'),
      rules: { ...DEFAULT_ROOM_RULES, cardExchange: true },
      deadlineAt: '2026-05-18T00:00:45.000Z',
    });

    expect(second).toMatchObject({
      ok: true,
      state: {
        phase: 'playing',
        currentTurn: 'p2',
        currentTrick: { leader: 'p2', passes: [] },
        version: 14,
      },
      events: [{ type: 'tribute_resolved', firstLeader: 'p2' }],
    });
  });
});
