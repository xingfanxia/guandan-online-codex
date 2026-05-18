import { describe, expect, test } from 'vitest';
import type { Card, Rank, Suit } from '../../lib/game/cards';
import { analyzeHand } from '../../lib/game/patterns';
import type { PlayingState } from '../../lib/game/state';
import { buildPlayerView, enumerateLegalMoves } from '../../lib/ai/engine';

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
      p1: [c('3'), c('4'), c('4', 'hearts'), c('5'), c('5', 'hearts'), c('5', 'clubs')],
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

describe('AI engine legal move enumeration', () => {
  test('builds a bot-safe player view from a playing state', () => {
    const view = buildPlayerView(state(), 'p1');

    expect(view.playerId).toBe('p1');
    expect(view.hand).toEqual(state().hands.p1);
    expect(view.handCounts).toEqual({ p1: 6, p2: 1, p3: 1, p4: 1 });
    expect(view.teamByPlayer.p3).toBe('t1');
  });

  test('enumerates valid lead moves without pass', () => {
    const view = buildPlayerView(state(), 'p1');
    const moves = enumerateLegalMoves(view);

    expect(moves.some((move) => move.type === 'pass')).toBe(false);
    expect(moves.filter((move) => move.type === 'play').every((move) => analyzeHand(move.cards, view.levelRank))).toBe(true);
    expect(moves.some((move) => move.type === 'play' && move.pattern.kind === 'pair' && move.cards.length === 2)).toBe(true);
    expect(moves.some((move) => move.type === 'play' && move.pattern.kind === 'triple' && move.cards.length === 3)).toBe(true);
  });

  test('includes pass and only beating plays when responding to a trick', () => {
    const currentPlay = {
      playerId: 'p2',
      cards: [c('9')],
      pattern: analyzeHand([c('9')], '2')!,
    };
    const view = buildPlayerView(state({
      hands: {
        p1: [c('3'), c('10'), c('10', 'hearts'), c('6'), c('6', 'hearts'), c('6', 'clubs'), c('6', 'diamonds')],
        p2: [c('9')],
        p3: [c('7')],
        p4: [c('8')],
      },
      currentTrick: { leader: 'p2', currentPlay, passes: [] },
    }), 'p1');

    const moves = enumerateLegalMoves(view);

    expect(moves[0]).toEqual({ type: 'pass' });
    expect(moves.some((move) => move.type === 'play' && move.cards.length === 1 && move.cards[0]!.rank === '3')).toBe(false);
    expect(moves.some((move) => move.type === 'play' && move.cards.length === 1 && move.cards[0]!.rank === '10')).toBe(true);
    expect(moves.some((move) => move.type === 'play' && move.pattern.kind === 'bomb')).toBe(true);
  });

  test('keeps generated move count bounded for a full 27-card hand', () => {
    const fullHand = [
      c('3'), c('3', 'hearts'), c('3', 'clubs'),
      c('4'), c('4', 'hearts'), c('4', 'clubs'),
      c('5'), c('5', 'hearts'), c('5', 'clubs'),
      c('6'), c('6', 'hearts'), c('6', 'clubs'),
      c('7'), c('7', 'hearts'), c('7', 'clubs'),
      c('8'), c('8', 'hearts'), c('8', 'clubs'),
      c('9'), c('9', 'hearts'), c('9', 'clubs'),
      c('10'), c('10', 'hearts'), c('J'), c('Q'), c('K'), c('A'),
    ];
    const moves = enumerateLegalMoves(buildPlayerView(state({ hands: { p1: fullHand, p2: [], p3: [], p4: [] } }), 'p1'));

    expect(moves.length).toBeGreaterThan(10);
    expect(moves.length).toBeLessThan(700);
    expect(moves.filter((move) => move.type === 'play').every((move) => analyzeHand(move.cards, '2'))).toBe(true);
  });
});
