import { describe, expect, test } from 'vitest';
import { generateDoubleDeck } from '../../lib/game/cards';
import { dealCards } from '../../lib/game/deal';
import { createPlayers } from '../../lib/game/state';

describe('dealing', () => {
  test('deals 27 cards each in 4P with no undealt cards', () => {
    const result = dealCards('4', createPlayers('4'), generateDoubleDeck());

    expect(Object.values(result.hands).map((hand) => hand.length)).toEqual([27, 27, 27, 27]);
    expect(result.undealt).toHaveLength(0);
  });

  test('deals 18 cards each in 6P with no undealt cards', () => {
    const result = dealCards('6', createPlayers('6'), generateDoubleDeck());

    expect(Object.values(result.hands).map((hand) => hand.length)).toEqual([18, 18, 18, 18, 18, 18]);
    expect(result.undealt).toHaveLength(0);
  });

  test('deals 13 cards each in 8P and leaves four cards aside', () => {
    const result = dealCards('8', createPlayers('8'), generateDoubleDeck());

    expect(Object.values(result.hands).map((hand) => hand.length)).toEqual([13, 13, 13, 13, 13, 13, 13, 13]);
    expect(result.undealt).toHaveLength(4);
  });
});
