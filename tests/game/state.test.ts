import { describe, expect, test } from 'vitest';
import { generateDoubleDeck } from '../../lib/game/cards';
import { createInitialState, startRound } from '../../lib/game/state';

describe('game state', () => {
  test('starts in waiting and transitions to playing with dealt hands', () => {
    const waiting = createInitialState({ mode: '4', levelRank: '2' });
    const playing = startRound(waiting, generateDoubleDeck());

    expect(waiting).toMatchObject({ phase: 'waiting', mode: '4', levelRank: '2' });
    expect(playing).toMatchObject({ phase: 'playing', currentTurn: 'p1', version: 1 });
    expect(Object.values(playing.hands).every((hand) => hand.length === 27)).toBe(true);
    expect(playing.currentTrick).toMatchObject({ leader: 'p1', passes: [] });
  });
});
