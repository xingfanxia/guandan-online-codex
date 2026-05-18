import { describe, expect, test } from 'vitest';
import type { Card, Rank, Suit } from '../../lib/game/cards';
import type { PlayingState } from '../../lib/game/state';
import { sortHand, suggestMove } from '../../lib/ai/assist';

function c(rank: Rank, suit: Suit = 'spades', deck = 1): Card {
  return { rank, suit, deck: deck as 1 | 2 };
}

function state(overrides: Partial<PlayingState> = {}): PlayingState {
  return {
    phase: 'playing',
    mode: '4',
    levelRank: '5',
    players: [
      { id: 'p1', seat: 'east', team: 't1' },
      { id: 'p2', seat: 'south', team: 't2' },
      { id: 'p3', seat: 'west', team: 't1' },
      { id: 'p4', seat: 'north', team: 't2' },
    ],
    hands: {
      p1: [c('3'), c('3', 'hearts'), c('4'), c('4', 'hearts'), c('5', 'hearts'), c('A')],
      p2: [c('6')],
      p3: [c('7')],
      p4: [c('8')],
    },
    undealt: [],
    finished: [],
    currentTurn: 'p1',
    currentTrick: { leader: 'p1', passes: [] },
    version: 1,
    ...overrides,
  };
}

describe('player assistance helpers', () => {
  test('sorts hand by rank while keeping current-level heart wildcard visible at the end', () => {
    expect(sortHand([c('A'), c('5', 'hearts'), c('3'), c('BJ', 'joker'), c('10')], '5')).toEqual([
      c('3'),
      c('10'),
      c('A'),
      c('BJ', 'joker'),
      c('5', 'hearts'),
    ]);
  });

  test('suggests a legal medium-tier move with a concise Chinese hint', () => {
    const suggestion = suggestMove(state(), 'p1');

    expect(suggestion.move.type).toBe('play');
    expect(suggestion.description.length).toBeGreaterThan(0);
    expect(suggestion.description.length).toBeLessThanOrEqual(20);
  });

  test('returns pass suggestion when the player cannot beat the current trick', () => {
    const target = { kind: 'single' as const, length: 1, primaryRank: 'A' as const, wildcardsUsed: 0 };
    const suggestion = suggestMove(state({
      hands: { p1: [c('3'), c('4')], p2: [c('A')], p3: [], p4: [] },
      currentTrick: { leader: 'p2', currentPlay: { playerId: 'p2', cards: [c('A')], pattern: target }, passes: [] },
    }), 'p1');

    expect(suggestion).toEqual({ move: { type: 'pass' }, description: '没有合适压牌' });
  });
});
