import { describe, expect, test } from 'vitest';
import type { Card, Rank, Suit } from '../../lib/game/cards';
import { analyzeHand, canBeat } from '../../lib/game/patterns';
import type { PlayingState } from '../../lib/game/state';
import { buildPlayerView } from '../../lib/ai/engine';
import { easyBotMove } from '../../lib/ai/bots/easy';

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
      p1: [c('3'), c('4'), c('4', 'hearts'), c('A'), c('A', 'hearts'), c('A', 'clubs'), c('A', 'diamonds')],
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

describe('Easy bot', () => {
  test('always returns a legal lead move and avoids proactive bombs when a low play exists', () => {
    const move = easyBotMove(buildPlayerView(state(), 'p1'), { random: () => 0.9 });

    expect(move.type).toBe('play');
    if (move.type !== 'play') throw new Error('expected play');
    expect(analyzeHand(move.cards, '2')).toBeTruthy();
    expect(move.pattern.kind).not.toBe('bomb');
  });

  test('passes when it has no legal beating play', () => {
    const target = analyzeHand([c('A')], '2')!;
    const move = easyBotMove(buildPlayerView(state({
      hands: { p1: [c('3'), c('4')], p2: [c('A')], p3: [], p4: [] },
      currentTrick: { leader: 'p2', currentPlay: { playerId: 'p2', cards: [c('A')], pattern: target }, passes: [] },
    }), 'p1'), { random: () => 0.9 });

    expect(move).toEqual({ type: 'pass' });
  });

  test('noise can pick a non-best legal candidate', () => {
    const view = buildPlayerView(state({ hands: { p1: [c('3'), c('4'), c('5')], p2: [], p3: [], p4: [] } }), 'p1');
    const best = easyBotMove(view, { random: () => 0.9 });
    const noisy = easyBotMove(view, { random: () => 0.1 });

    expect(best.type).toBe('play');
    expect(noisy.type).toBe('play');
    if (best.type === 'play' && noisy.type === 'play') {
      expect(noisy.cards.map((card) => card.rank)).not.toEqual(best.cards.map((card) => card.rank));
    }
  });

  test('response plays beat the current trick when not passing', () => {
    const target = analyzeHand([c('9')], '2')!;
    const view = buildPlayerView(state({
      hands: { p1: [c('10'), c('J')], p2: [c('9')], p3: [], p4: [] },
      currentTrick: { leader: 'p2', currentPlay: { playerId: 'p2', cards: [c('9')], pattern: target }, passes: [] },
    }), 'p1');
    const move = easyBotMove(view, { random: () => 0.9 });

    expect(move.type).toBe('play');
    if (move.type === 'play') expect(canBeat(move.pattern, target, '2')).toBe(true);
  });
});
