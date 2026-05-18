import { describe, expect, test } from 'vitest';
import type { Card, Rank, Suit } from '../../lib/game/cards';
import { analyzeHand, canBeat } from '../../lib/game/patterns';
import type { PlayingState } from '../../lib/game/state';
import { buildPlayerView } from '../../lib/ai/engine';
import { mediumBotMove } from '../../lib/ai/bots/medium';

function c(rank: Rank, suit: Suit = 'spades', deck = 1): Card {
  return { rank, suit, deck: deck as 1 | 2 };
}

function state(overrides: Partial<PlayingState> = {}): PlayingState {
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
      p1: [c('3'), c('3', 'hearts'), c('4'), c('4', 'hearts'), c('5')],
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

describe('Medium bot', () => {
  test('prefers card-efficient lead moves over low singles', () => {
    const move = mediumBotMove(buildPlayerView(state(), 'p1'));

    expect(move.type).toBe('play');
    if (move.type === 'play') expect(move.cards.length).toBeGreaterThan(1);
  });

  test('passes when partner is winning the current trick', () => {
    const target = analyzeHand([c('9')], '2')!;
    const move = mediumBotMove(buildPlayerView(state({
      hands: { p1: [c('10'), c('J')], p2: [], p3: [c('9')], p4: [] },
      currentTrick: { leader: 'p3', currentPlay: { playerId: 'p3', cards: [c('9')], pattern: target }, passes: [] },
    }), 'p1'));

    expect(move).toEqual({ type: 'pass' });
  });

  test('does not pass when an opponent is winning and a beating play exists', () => {
    const target = analyzeHand([c('9')], '2')!;
    const move = mediumBotMove(buildPlayerView(state({
      hands: { p1: [c('10'), c('J')], p2: [c('9')], p3: [], p4: [] },
      currentTrick: { leader: 'p2', currentPlay: { playerId: 'p2', cards: [c('9')], pattern: target }, passes: [] },
    }), 'p1'));

    expect(move.type).toBe('play');
    if (move.type === 'play') expect(canBeat(move.pattern, target, '2')).toBe(true);
  });

  test('falls back to pass when no legal play can beat the trick', () => {
    const target = analyzeHand([c('A')], '2')!;
    const move = mediumBotMove(buildPlayerView(state({
      hands: { p1: [c('3'), c('4')], p2: [c('A')], p3: [], p4: [] },
      currentTrick: { leader: 'p2', currentPlay: { playerId: 'p2', cards: [c('A')], pattern: target }, passes: [] },
    }), 'p1'));

    expect(move).toEqual({ type: 'pass' });
  });
});
