import { describe, expect, test } from 'vitest';
import { generateDoubleDeck } from '../../lib/game/cards';
import { createInitialState, createPlayers, startRound } from '../../lib/game/state';

describe('game state', () => {
  test('starts in waiting and transitions to playing with dealt hands', () => {
    const waiting = createInitialState({ mode: '4', levelRank: '2' });
    const playing = startRound(waiting, generateDoubleDeck(), () => 0);

    expect(waiting).toMatchObject({ phase: 'waiting', mode: '4', levelRank: '2' });
    expect(playing).toMatchObject({ phase: 'playing', currentTurn: 'p1', version: 1 });
    expect(Object.values(playing.hands).every((hand) => hand.length === 27)).toBe(true);
    expect(playing.currentTrick).toMatchObject({ leader: 'p1', passes: [] });
  });

  test('uses revealed-card leader selection when starting the first round', () => {
    const waiting = createInitialState({ mode: '4', levelRank: '2' });
    const playing = startRound(waiting, generateDoubleDeck(), () => 0.5);

    expect(playing).toMatchObject({
      phase: 'playing',
      currentTurn: 'p3',
      currentTrick: { leader: 'p3', passes: [] },
    });
  });

  test('creates 6P/8P teams-of-2 seats for multi-team rooms', () => {
    expect(createPlayers('6', 'teams-of-2').map((player) => player.team)).toEqual([
      't1', 't2', 't3', 't1', 't2', 't3',
    ]);
    expect(createPlayers('8', 'teams-of-2').map((player) => player.team)).toEqual([
      't1', 't2', 't3', 't4', 't1', 't2', 't3', 't4',
    ]);
  });
});
