import { describe, expect, test } from 'vitest';
import type { Card, LevelRank, Rank, Suit } from '../../lib/game/cards';
import { analyzeHand } from '../../lib/game/patterns';
import { countWildcards } from '../../lib/game/wildcard';

function c(rank: Rank, suit: Suit = 'spades', deck = 1): Card {
  return { rank, suit, deck: deck as 1 | 2 };
}

describe('heart-level wildcard handling', () => {
  test.each([
    { name: 'heart current-level card', cards: [c('5', 'hearts')], levelRank: '5', expected: 1 },
    { name: 'both heart current-level copies', cards: [c('5', 'hearts', 1), c('5', 'hearts', 2)], levelRank: '5', expected: 2 },
    { name: 'non-heart current-level card', cards: [c('5', 'spades')], levelRank: '5', expected: 0 },
    { name: 'heart card at another rank', cards: [c('6', 'hearts')], levelRank: '5', expected: 0 },
    { name: 'jokers', cards: [c('BJ', 'joker'), c('RJ', 'joker')], levelRank: '5', expected: 0 },
  ] satisfies Array<{ name: string; cards: Card[]; levelRank: LevelRank; expected: number }>)(
    'counts $name',
    ({ cards, levelRank, expected }) => {
      expect(countWildcards(cards, levelRank)).toBe(expected);
    },
  );

  test.each([
    {
      name: 'pair',
      levelRank: '5',
      cards: [c('5', 'hearts'), c('Q')],
      expected: { kind: 'pair', primaryRank: 'Q', wildcardsUsed: 1 },
    },
    {
      name: 'triple',
      levelRank: '5',
      cards: [c('5', 'hearts'), c('Q'), c('Q', 'clubs')],
      expected: { kind: 'triple', primaryRank: 'Q', wildcardsUsed: 1 },
    },
    {
      name: 'full house',
      levelRank: '5',
      cards: [c('5', 'hearts'), c('Q'), c('Q', 'clubs'), c('4'), c('4', 'clubs')],
      expected: { kind: 'fullHouse', primaryRank: 'Q', wildcardsUsed: 1 },
    },
    {
      name: 'straight',
      levelRank: '5',
      cards: [c('5', 'hearts'), c('10'), c('J', 'clubs'), c('Q', 'diamonds'), c('K')],
      expected: { kind: 'straight', primaryRank: 'A', wildcardsUsed: 1 },
    },
    {
      name: 'straight flush',
      levelRank: '5',
      cards: [c('5', 'hearts'), c('9'), c('10'), c('J'), c('Q')],
      expected: { kind: 'straightFlush', primaryRank: 'K', wildcardsUsed: 1 },
    },
    {
      name: 'three-pair run',
      levelRank: '5',
      cards: [c('3'), c('3', 'clubs'), c('4'), c('4', 'clubs'), c('5', 'hearts'), c('5', 'clubs')],
      expected: { kind: 'threePairRun', primaryRank: '5', wildcardsUsed: 1 },
    },
    {
      name: 'two-triple run',
      levelRank: '6',
      cards: [c('6', 'hearts'), c('7'), c('7', 'clubs'), c('7', 'diamonds'), c('8'), c('8', 'clubs')],
      expected: { kind: 'twoTripleRun', primaryRank: '8', wildcardsUsed: 1 },
    },
    {
      name: 'same-rank bomb',
      levelRank: '5',
      cards: [c('5', 'hearts'), c('Q'), c('Q', 'clubs'), c('Q', 'diamonds')],
      expected: { kind: 'bomb', primaryRank: 'Q', wildcardsUsed: 1 },
    },
    {
      name: 'double-wild triple',
      levelRank: '5',
      cards: [c('5', 'hearts', 1), c('5', 'hearts', 2), c('Q')],
      expected: { kind: 'triple', primaryRank: 'Q', wildcardsUsed: 2 },
    },
    {
      name: 'double-wild bomb',
      levelRank: '5',
      cards: [c('5', 'hearts', 1), c('5', 'hearts', 2), c('Q'), c('Q', 'clubs')],
      expected: { kind: 'bomb', primaryRank: 'Q', wildcardsUsed: 2 },
    },
    {
      name: 'double-wild straight',
      levelRank: '5',
      cards: [c('5', 'hearts', 1), c('5', 'hearts', 2), c('10'), c('J', 'clubs'), c('Q', 'diamonds')],
      expected: { kind: 'straight', primaryRank: 'A', wildcardsUsed: 2 },
    },
    {
      name: 'double-wild straight flush',
      levelRank: '5',
      cards: [c('5', 'hearts', 1), c('5', 'hearts', 2), c('9'), c('10'), c('J')],
      expected: { kind: 'straightFlush', primaryRank: 'K', wildcardsUsed: 2 },
    },
    {
      name: 'double-wild three-pair run',
      levelRank: '5',
      cards: [c('5', 'hearts', 1), c('5', 'hearts', 2), c('3'), c('3', 'clubs'), c('4'), c('4', 'clubs')],
      expected: { kind: 'threePairRun', primaryRank: '5', wildcardsUsed: 2 },
    },
    {
      name: 'double-wild two-triple run',
      levelRank: '6',
      cards: [c('6', 'hearts', 1), c('6', 'hearts', 2), c('7'), c('7', 'clubs'), c('7', 'diamonds'), c('8')],
      expected: { kind: 'twoTripleRun', primaryRank: '8', wildcardsUsed: 2 },
    },
  ] satisfies Array<{ name: string; levelRank: LevelRank; cards: Card[]; expected: Record<string, unknown> }>)(
    'substitutes into $name',
    ({ levelRank, cards, expected }) => {
      expect(analyzeHand(cards, levelRank)).toMatchObject(expected);
    },
  );

  test.each([
    { name: 'wildcard plus red joker', cards: [c('5', 'hearts'), c('RJ', 'joker')] },
    { name: 'wildcard plus black and red joker', cards: [c('5', 'hearts'), c('BJ', 'joker'), c('RJ', 'joker')] },
    { name: 'wildcard plus joker pair', cards: [c('5', 'hearts'), c('RJ', 'joker', 1), c('RJ', 'joker', 2)] },
    { name: 'two wildcards plus two jokers', cards: [c('5', 'hearts', 1), c('5', 'hearts', 2), c('BJ', 'joker'), c('RJ', 'joker')] },
    { name: 'single wildcard cannot fill two straight gaps', cards: [c('5', 'hearts'), c('3'), c('4'), c('6'), c('8')] },
  ])('rejects $name', ({ cards }) => {
    expect(analyzeHand(cards, '5')).toBeNull();
  });
});
