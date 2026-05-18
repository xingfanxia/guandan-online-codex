import { describe, expect, test } from 'vitest';
import { analyzeHand, canBeat } from '../../lib/game/patterns';
import type { Card, Rank, Suit } from '../../lib/game/cards';
import { countWildcards } from '../../lib/game/wildcard';

function c(rank: Rank, suit: Suit = 'spades', deck = 1): Card {
  return { rank, suit, deck: deck as 1 | 2 };
}

describe('hand pattern recognition', () => {
  test.each([
    { name: 'single', cards: [c('3')], kind: 'single', primaryRank: '3' },
    { name: 'pair', cards: [c('8'), c('8', 'hearts')], kind: 'pair', primaryRank: '8' },
    { name: 'triple', cards: [c('9'), c('9', 'hearts'), c('9', 'clubs')], kind: 'triple', primaryRank: '9' },
    {
      name: 'full house',
      cards: [c('Q'), c('Q', 'hearts'), c('Q', 'clubs'), c('4'), c('4', 'hearts')],
      kind: 'fullHouse',
      primaryRank: 'Q',
    },
    {
      name: 'three-pair run',
      cards: [c('3'), c('3', 'hearts'), c('4'), c('4', 'hearts'), c('5'), c('5', 'clubs')],
      kind: 'threePairRun',
      primaryRank: '5',
    },
    {
      name: 'two-triple run',
      cards: [c('7'), c('7', 'hearts'), c('7', 'clubs'), c('8'), c('8', 'hearts'), c('8', 'clubs')],
      kind: 'twoTripleRun',
      primaryRank: '8',
    },
    {
      name: 'straight',
      cards: [c('10'), c('J', 'hearts'), c('Q'), c('K', 'clubs'), c('A')],
      kind: 'straight',
      primaryRank: 'A',
    },
    {
      name: 'straight flush',
      cards: [c('3'), c('4'), c('5'), c('6'), c('7')],
      kind: 'straightFlush',
      primaryRank: '7',
    },
    {
      name: 'same-rank bomb',
      cards: [c('6'), c('6', 'hearts'), c('6', 'clubs'), c('6', 'diamonds')],
      kind: 'bomb',
      primaryRank: '6',
    },
    {
      name: 'joker bomb',
      cards: [c('BJ', 'joker', 1), c('BJ', 'joker', 2), c('RJ', 'joker', 1), c('RJ', 'joker', 2)],
      kind: 'jokerBomb',
      primaryRank: 'RJ',
    },
  ])('recognizes $name', ({ cards, kind, primaryRank }) => {
    const pattern = analyzeHand(cards, '2');

    expect(pattern).toMatchObject({ kind, primaryRank, length: cards.length });
  });

  test('recognizes A-low sequence windows without allowing longer straights', () => {
    expect(analyzeHand([c('A'), c('2', 'hearts'), c('3'), c('4', 'clubs'), c('5')], '7')).toMatchObject({
      kind: 'straight',
      primaryRank: '5',
    });
    expect(
      analyzeHand([c('A'), c('A', 'hearts'), c('2'), c('2', 'hearts'), c('3'), c('3', 'clubs')], '7'),
    ).toMatchObject({
      kind: 'threePairRun',
      primaryRank: '3',
    });
    expect(analyzeHand([c('A'), c('2'), c('3'), c('4'), c('5'), c('6')], '7')).toBeNull();
  });

  test('uses heart-level wildcards for non-joker substitutions only', () => {
    const cards = [c('5', 'hearts'), c('Q'), c('Q', 'clubs')];

    expect(countWildcards(cards, '5')).toBe(1);
    expect(analyzeHand([c('5', 'hearts'), c('Q'), c('Q', 'clubs')], '5')).toMatchObject({
      kind: 'triple',
      primaryRank: 'Q',
      wildcardsUsed: 1,
    });
    expect(analyzeHand([c('5', 'hearts'), c('RJ', 'joker')], '5')).toBeNull();
    expect(analyzeHand([c('5', 'hearts')], '5')).toMatchObject({
      kind: 'single',
      primaryRank: '5',
      wildcardsUsed: 0,
    });
    expect(analyzeHand([c('5', 'hearts', 1), c('5', 'hearts', 2)], '5')).toMatchObject({
      kind: 'pair',
      primaryRank: '5',
      wildcardsUsed: 0,
    });
  });

  test('does not allow three-pair runs to beat two-triple runs', () => {
    const pairs = analyzeHand([c('3'), c('3', 'hearts'), c('4'), c('4', 'hearts'), c('5'), c('5', 'clubs')], '2');
    const triples = analyzeHand([
      c('3'),
      c('3', 'hearts'),
      c('3', 'clubs'),
      c('4'),
      c('4', 'hearts'),
      c('4', 'clubs'),
    ], '2');

    expect(pairs?.kind).toBe('threePairRun');
    expect(triples?.kind).toBe('twoTripleRun');
    expect(canBeat(pairs!, triples!, '2')).toBe(false);
    expect(canBeat(triples!, pairs!, '2')).toBe(false);
  });

  test('rejects malformed and unsupported patterns', () => {
    expect(analyzeHand([], '2')).toBeNull();
    expect(analyzeHand([c('BJ', 'joker'), c('RJ', 'joker')], '2')).toBeNull();
    expect(analyzeHand([c('3'), c('3', 'hearts'), c('3', 'clubs'), c('4'), c('5')], '2')).toBeNull();
    expect(analyzeHand([c('3'), c('3', 'hearts'), c('4'), c('4', 'hearts')], '2')).toBeNull();
    expect(analyzeHand([c('3'), c('4'), c('5'), c('6'), c('8')], '2')).toBeNull();
  });

  test('compares same-kind non-bombs by length and rank', () => {
    const lowPair = analyzeHand([c('4'), c('4', 'hearts')], '2')!;
    const highPair = analyzeHand([c('K'), c('K', 'hearts')], '2')!;
    const triple = analyzeHand([c('4'), c('4', 'hearts'), c('4', 'clubs')], '2')!;

    expect(canBeat(highPair, lowPair, '2')).toBe(true);
    expect(canBeat(lowPair, highPair, '2')).toBe(false);
    expect(canBeat(highPair, triple, '2')).toBe(false);
  });
});
