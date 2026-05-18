import { describe, expect, test } from 'vitest';
import { generateDeckForMode, generateDoubleDeck } from '../../lib/game/cards';
import { dealCards } from '../../lib/game/deal';
import { createPlayers } from '../../lib/game/state';

describe('dealing', () => {
  test('deals 27 cards each in 4P with no undealt cards', () => {
    const result = dealCards('4', createPlayers('4'), generateDoubleDeck());

    expect(Object.values(result.hands).map((hand) => hand.length)).toEqual([27, 27, 27, 27]);
    expect(result.undealt).toHaveLength(0);
  });

  test('deals 27 cards each in 6P with no undealt cards', () => {
    const result = dealCards('6', createPlayers('6'), generateDeckForMode('6'));

    expect(Object.values(result.hands).map((hand) => hand.length)).toEqual([27, 27, 27, 27, 27, 27]);
    expect(result.undealt).toHaveLength(0);
  });

  test('deals 27 cards each in 8P with no undealt cards', () => {
    const result = dealCards('8', createPlayers('8'), generateDeckForMode('8'));

    expect(Object.values(result.hands).map((hand) => hand.length)).toEqual([27, 27, 27, 27, 27, 27, 27, 27]);
    expect(result.undealt).toHaveLength(0);
  });

  test('rejects a deck that cannot deal the whole table', () => {
    expect(() => dealCards('4', createPlayers('4'), generateDoubleDeck().slice(0, 4))).toThrow('ERR_NOT_ENOUGH_CARDS');
  });
});
