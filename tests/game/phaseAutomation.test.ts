import { describe, expect, test } from 'vitest';
import type { Card, Rank, Suit } from '../../lib/game/cards';
import type { ExchangeVotePendingState, TributePendingState } from '../../lib/game/state';
import { runAutomaticPhaseActions } from '../../lib/game/phaseAutomation';
import { DEFAULT_ROOM_RULES } from '../../lib/room/rules';

function c(rank: Rank, suit: Suit = 'spades', deck = 1): Card {
  return { rank, suit, deck: deck as 1 | 2 };
}

function tributeState(): TributePendingState {
  return {
    phase: 'tribute-pending',
    mode: '4',
    levelRank: '2',
    players: [
      { id: 'p1', seat: 'east', team: 't1', kind: 'human' },
      { id: 'p2', seat: 'south', team: 't2', kind: 'bot', botDifficulty: 'easy' },
      { id: 'p3', seat: 'west', team: 't1', kind: 'bot', botDifficulty: 'easy' },
      { id: 'p4', seat: 'north', team: 't2', kind: 'bot', botDifficulty: 'easy' },
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

function exchangeVoteState(): ExchangeVotePendingState {
  return {
    phase: 'exchange-vote-pending',
    mode: '4',
    levelRank: '2',
    players: [
      { id: 'p1', seat: 'east', team: 't1', kind: 'bot', botDifficulty: 'easy' },
      { id: 'p2', seat: 'south', team: 't2', kind: 'bot', botDifficulty: 'easy' },
      { id: 'p3', seat: 'west', team: 't1', kind: 'bot', botDifficulty: 'easy' },
      { id: 'p4', seat: 'north', team: 't2', kind: 'bot', botDifficulty: 'easy' },
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

describe('automatic phase actions', () => {
  test('auto-picks default tribute cards and bot returns, then waits for the human return', () => {
    const result = runAutomaticPhaseActions(tributeState(), {
      rules: DEFAULT_ROOM_RULES,
      returnDeadlineAt: () => '2026-05-18T00:00:30.000Z',
      exchangeDeadlineAt: () => '2026-05-18T00:00:45.000Z',
    });

    expect(result.state).toMatchObject({
      phase: 'return-pending',
      selectedReturns: { p3: c('7') },
      hands: {
        p1: [c('5'), c('6')],
        p2: [c('A'), c('3')],
        p3: [c('7'), c('8')],
        p4: [c('K'), c('4')],
      },
      version: 13,
    });
    expect(result.actions).toEqual([
      { phase: 'tribute-pending', playerId: 'p2', type: 'tribute' },
      { phase: 'tribute-pending', playerId: 'p4', type: 'tribute' },
      { phase: 'return-pending', playerId: 'p3', type: 'return' },
    ]);
    expect(result.events.map((event) => event.type)).toEqual([
      'state_resync',
      'tribute_completed',
      'return_required',
      'return_required',
      'state_resync',
    ]);
  });

  test('bot exchange voters approve and bot selectors swap cards without human input', () => {
    const result = runAutomaticPhaseActions(exchangeVoteState(), {
      rules: { ...DEFAULT_ROOM_RULES, cardExchange: true },
      returnDeadlineAt: () => '2026-05-18T00:00:30.000Z',
      exchangeDeadlineAt: () => '2026-05-18T00:00:45.000Z',
      exchangeDirection: () => 'clockwise',
    });

    expect(result.state).toMatchObject({
      phase: 'playing',
      currentTurn: 'p1',
      hands: {
        p1: [c('Q'), c('K'), c('A')],
        p2: [c('3'), c('4'), c('5')],
        p3: [c('6'), c('7'), c('8')],
        p4: [c('9'), c('10'), c('J')],
      },
      version: 26,
    });
    expect(result.actions.map((action) => `${action.type}:${action.playerId}`)).toEqual([
      'exchange-vote:p2',
      'exchange-vote:p4',
      'exchange-select:p1',
      'exchange-select:p2',
      'exchange-select:p3',
      'exchange-select:p4',
    ]);
  });
});
