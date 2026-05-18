import { describe, expect, test } from 'vitest';
import type { Card, Rank, Suit } from '../../lib/game/cards';
import {
  applyCardExchange,
  autoPickExchangeCards,
  pickExchangeDirection,
  resolveExchangeVote,
  validateExchangeSelection,
} from '../../lib/game/exchange';

function c(rank: Rank, suit: Suit = 'spades', deck = 1): Card {
  return { rank, suit, deck: deck as 1 | 2 };
}

describe('exchange vote rules', () => {
  test('majority requires strictly more than half of losing voters', () => {
    expect(resolveExchangeVote({ eligibleVoters: ['p1', 'p2'], votes: { p1: 'yes' }, threshold: 'majority' })).toMatchObject({
      passed: false,
      yes: 1,
      required: 2,
    });
    expect(resolveExchangeVote({ eligibleVoters: ['p1', 'p2'], votes: { p1: 'yes', p2: 'yes' }, threshold: 'majority' }).passed).toBe(true);
    expect(resolveExchangeVote({
      eligibleVoters: ['p1', 'p2', 'p3', 'p4'],
      votes: { p1: 'yes', p2: 'yes' },
      threshold: 'majority',
    }).passed).toBe(false);
  });

  test('unanimous requires every losing voter to vote yes', () => {
    expect(resolveExchangeVote({ eligibleVoters: ['p1', 'p2'], votes: { p1: 'yes', p2: 'no' }, threshold: 'unanimous' }).passed).toBe(false);
    expect(resolveExchangeVote({ eligibleVoters: ['p1', 'p2'], votes: { p1: 'yes', p2: 'yes' }, threshold: 'unanimous' }).passed).toBe(true);
  });

  test('server randomizes direction uniformly from random source', () => {
    expect(pickExchangeDirection(() => 0.49)).toBe('clockwise');
    expect(pickExchangeDirection(() => 0.5)).toBe('counterclockwise');
  });
});

describe('exchange card selection and swap', () => {
  test('auto-picks lowest cards for timeout fallback', () => {
    expect(autoPickExchangeCards([c('A'), c('3'), c('9'), c('2')], 3)).toEqual([c('2'), c('3'), c('9')]);
    expect(autoPickExchangeCards([c('RJ', 'joker'), c('BJ', 'joker'), c('A')], 2)).toEqual([c('A'), c('BJ', 'joker')]);
    expect(() => autoPickExchangeCards([c('A')], 2)).toThrow('ERR_NOT_ENOUGH_CARDS');
  });

  test('validates exact card-count selections from the player hand', () => {
    const hand = [c('A'), c('3'), c('9')];

    expect(validateExchangeSelection([c('A'), c('3')], hand, 2)).toBe(true);
    expect(validateExchangeSelection([c('A')], hand, 2)).toBe(false);
    expect(validateExchangeSelection([c('A'), c('K')], hand, 2)).toBe(false);
    expect(validateExchangeSelection([c('A'), c('A')], [c('A'), c('3')], 2)).toBe(false);
  });

  test('applies clockwise exchange to adjacent players and preserves hand sizes', () => {
    const result = applyCardExchange({
      playerOrder: ['p1', 'p2', 'p3', 'p4'],
      hands: {
        p1: [c('A'), c('3'), c('4')],
        p2: [c('K'), c('5'), c('6')],
        p3: [c('Q'), c('7'), c('8')],
        p4: [c('J'), c('9'), c('10')],
      },
      selections: {
        p1: [c('A')],
        p2: [c('K')],
        p3: [c('Q')],
        p4: [c('J')],
      },
      direction: 'clockwise',
      cardCount: 1,
    });

    expect(result.hands.p2).toContainEqual(c('A'));
    expect(result.hands.p3).toContainEqual(c('K'));
    expect(result.hands.p4).toContainEqual(c('Q'));
    expect(result.hands.p1).toContainEqual(c('J'));
    expect(Object.values(result.hands).map((hand) => hand.length)).toEqual([3, 3, 3, 3]);
  });

  test('applies counterclockwise exchange to adjacent players and reports received private cards', () => {
    const result = applyCardExchange({
      playerOrder: ['p1', 'p2', 'p3'],
      hands: {
        p1: [c('A'), c('3')],
        p2: [c('K'), c('5')],
        p3: [c('Q'), c('7')],
      },
      selections: {
        p1: [c('A')],
        p2: [c('K')],
        p3: [c('Q')],
      },
      direction: 'counterclockwise',
      cardCount: 1,
    });

    expect(result.received).toEqual({
      p1: [c('K')],
      p2: [c('Q')],
      p3: [c('A')],
    });
  });

  test('rejects missing and invalid player selections', () => {
    expect(() => applyCardExchange({
      playerOrder: ['p1'],
      hands: { p1: [c('A')] },
      selections: {},
      direction: 'clockwise',
      cardCount: 1,
    })).toThrow('ERR_MISSING_EXCHANGE_SELECTION');

    expect(() => applyCardExchange({
      playerOrder: ['p1'],
      hands: { p1: [c('A')] },
      selections: { p1: [c('K')] },
      direction: 'clockwise',
      cardCount: 1,
    })).toThrow('ERR_INVALID_EXCHANGE_SELECTION');
  });
});
