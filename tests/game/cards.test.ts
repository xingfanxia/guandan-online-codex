import { describe, expect, test } from 'vitest';
import {
  cardKey,
  compareCardRanks,
  generateDoubleDeck,
  isHeartLevelWildcard,
  rankValue,
  shuffleDeck,
  generateDeckForMode,
} from '../../lib/game/cards';

describe('card model', () => {
  test('builds a unique 108-card two-deck Guandan deck', () => {
    const deck = generateDoubleDeck();
    expect(deck).toHaveLength(108);
    expect(new Set(deck.map(cardKey)).size).toBe(108);

    const bigJokers = deck.filter((card) => card.rank === 'RJ');
    const smallJokers = deck.filter((card) => card.rank === 'BJ');
    expect(bigJokers).toHaveLength(2);
    expect(smallJokers).toHaveLength(2);

    const fivesOfHearts = deck.filter((card) => card.rank === '5' && card.suit === 'hearts');
    expect(fivesOfHearts).toHaveLength(2);
  });

  test('builds mode-sized Guandan decks for 6P and 8P rooms', () => {
    expect(generateDeckForMode('4')).toHaveLength(108);
    expect(generateDeckForMode('6')).toHaveLength(162);
    expect(generateDeckForMode('8')).toHaveLength(216);

    expect(new Set(generateDeckForMode('6').map(cardKey)).size).toBe(162);
    expect(new Set(generateDeckForMode('8').map(cardKey)).size).toBe(216);
  });

  test('detects only heart current-level cards as wildcards', () => {
    const [heartFive] = generateDoubleDeck().filter((card) => card.rank === '5' && card.suit === 'hearts');
    const [spadeFive] = generateDoubleDeck().filter((card) => card.rank === '5' && card.suit === 'spades');
    const [heartSix] = generateDoubleDeck().filter((card) => card.rank === '6' && card.suit === 'hearts');
    const [redJoker] = generateDoubleDeck().filter((card) => card.rank === 'RJ');

    expect(isHeartLevelWildcard(heartFive!, '5')).toBe(true);
    expect(isHeartLevelWildcard(spadeFive!, '5')).toBe(false);
    expect(isHeartLevelWildcard(heartSix!, '5')).toBe(false);
    expect(isHeartLevelWildcard(redJoker!, '5')).toBe(false);
  });

  test('ranks jokers above level cards and level cards above ace', () => {
    expect(rankValue('RJ', '5')).toBeGreaterThan(rankValue('BJ', '5'));
    expect(rankValue('BJ', '5')).toBeGreaterThan(rankValue('5', '5'));
    expect(rankValue('5', '5')).toBeGreaterThan(rankValue('A', '5'));
    expect(rankValue('A', '5')).toBeGreaterThan(rankValue('K', '5'));
    expect(compareCardRanks('5', 'A', '5')).toBeGreaterThan(0);
  });

  test('supports deterministic shuffle with injected random source', () => {
    const deck = generateDoubleDeck();
    const randoms = [0.1, 0.7, 0.3, 0.9, 0.2];
    let i = 0;
    const first = shuffleDeck(deck, () => randoms[i++ % randoms.length]!);
    i = 0;
    const second = shuffleDeck(deck, () => randoms[i++ % randoms.length]!);

    expect(first.map(cardKey)).toEqual(second.map(cardKey));
    expect(first.map(cardKey)).not.toEqual(deck.map(cardKey));
    expect(deck).toEqual(generateDoubleDeck());
  });

  test('uses Math.random by default without mutating input', () => {
    const deck = generateDoubleDeck();
    const shuffled = shuffleDeck(deck);

    expect(shuffled).toHaveLength(deck.length);
    expect(deck).toEqual(generateDoubleDeck());
  });
});
