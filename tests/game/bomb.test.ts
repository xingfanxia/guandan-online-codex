import { describe, expect, test } from 'vitest';
import { bombPower } from '../../lib/game/bomb';
import { analyzeHand, canBeat } from '../../lib/game/patterns';
import type { Card, Rank, Suit } from '../../lib/game/cards';

function c(rank: Rank, suit: Suit = 'spades', deck = 1): Card {
  return { rank, suit, deck: deck as 1 | 2 };
}

function bomb(rank: Rank, size: number) {
  const suits: Suit[] = ['spades', 'hearts', 'clubs', 'diamonds'];
  return Array.from({ length: size }, (_, i) => c(rank, suits[i % suits.length]!, i < 4 ? 1 : 2));
}

describe('bomb hierarchy', () => {
  test('orders 4-bomb < 5-bomb < straight flush < 6-bomb < 7-bomb < 8-bomb < joker bomb', () => {
    const four = analyzeHand(bomb('6', 4), '2')!;
    const five = analyzeHand(bomb('6', 5), '2')!;
    const flush = analyzeHand([c('3'), c('4'), c('5'), c('6'), c('7')], '2')!;
    const six = analyzeHand(bomb('6', 6), '2')!;
    const seven = analyzeHand(bomb('6', 7), '2')!;
    const eight = analyzeHand(bomb('6', 8), '2')!;
    const jokers = analyzeHand([c('BJ', 'joker', 1), c('BJ', 'joker', 2), c('RJ', 'joker', 1), c('RJ', 'joker', 2)], '2')!;

    expect([four, five, flush, six, seven, eight, jokers].map(bombPower)).toEqual([180, 200, 450, 620, 640, 660, 1000]);
  });

  test('lets bombs interrupt non-bombs and compares same-size bombs by rank', () => {
    const straight = analyzeHand([c('4'), c('5', 'hearts'), c('6'), c('7', 'clubs'), c('8')], '2')!;
    const fourSixes = analyzeHand(bomb('6', 4), '2')!;
    const fourSevens = analyzeHand(bomb('7', 4), '2')!;

    expect(canBeat(fourSixes, straight, '2')).toBe(true);
    expect(canBeat(fourSevens, fourSixes, '2')).toBe(true);
    expect(canBeat(fourSixes, fourSevens, '2')).toBe(false);
  });

  test('keeps wildcard-completed bomb rank at its natural rank', () => {
    const wildcardBomb = analyzeHand([c('5', 'hearts'), c('5', 'spades'), c('5', 'clubs'), c('5', 'diamonds')], '5')!;
    const aceBomb = analyzeHand(bomb('A', 4), '5')!;

    expect(wildcardBomb).toMatchObject({ kind: 'bomb', primaryRank: '5', wildcardsUsed: 1 });
    expect(canBeat(wildcardBomb, aceBomb, '5')).toBe(true);
  });

  test('returns zero bomb power for non-bomb patterns', () => {
    const pair = analyzeHand([c('7'), c('7', 'hearts')], '2')!;

    expect(bombPower(pair)).toBe(0);
  });
});
