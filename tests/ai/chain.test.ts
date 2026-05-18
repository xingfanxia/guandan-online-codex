import { describe, expect, test } from 'vitest';
import type { Card, Rank, Suit } from '../../lib/game/cards';
import type { PlayingState } from '../../lib/game/state';
import { runBotTurns } from '../../lib/ai/chain';

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
      { id: 'p2', seat: 'south', team: 't2', kind: 'bot', botDifficulty: 'easy' },
      { id: 'p3', seat: 'west', team: 't1' },
      { id: 'p4', seat: 'north', team: 't2' },
    ],
    hands: {
      p1: [c('3')],
      p2: [c('4')],
      p3: [c('5')],
      p4: [c('6')],
    },
    undealt: [],
    finished: [],
    currentTurn: 'p2',
    currentTrick: {
      leader: 'p1',
      currentPlay: {
        playerId: 'p1',
        cards: [c('3')],
        pattern: { kind: 'single', length: 1, primaryRank: '3', wildcardsUsed: 0 },
      },
      passes: [],
    },
    version: 2,
    ...overrides,
  };
}

describe('bot turn chain', () => {
  test('applies one bot move and returns move events', () => {
    const result = runBotTurns(state(), { maxMoves: 1, random: () => 0.9 });

    expect(result.state).toMatchObject({
      phase: 'playing',
      currentTurn: 'p3',
      hands: { p2: [] },
      version: 3,
    });
    expect(result.moves).toEqual([{ playerId: 'p2', command: { type: 'play', cards: [c('4')] } }]);
    expect(result.events).toEqual([{ type: 'move_played', playerId: 'p2', cards: [c('4')] }]);
  });

  test('stops when the current turn belongs to a human', () => {
    const result = runBotTurns(state({ currentTurn: 'p1' }), { maxMoves: 3 });

    expect(result.moves).toEqual([]);
    expect(result.state).toMatchObject({ currentTurn: 'p1', version: 2 });
  });

  test('emits round_end when a bot move finishes the round', () => {
    const result = runBotTurns(state({
      players: [
        { id: 'p1', seat: 'east', team: 't1' },
        { id: 'p2', seat: 'south', team: 't2' },
        { id: 'p3', seat: 'west', team: 't1', kind: 'bot', botDifficulty: 'easy' },
        { id: 'p4', seat: 'north', team: 't2' },
      ],
      hands: {
        p1: [],
        p2: [c('4')],
        p3: [c('5')],
        p4: [c('6')],
      },
      finished: [{ playerId: 'p1', position: 1, team: 't1' }],
      currentTurn: 'p3',
    }), { maxMoves: 1, random: () => 0.9 });

    expect(result.state).toMatchObject({ phase: 'round-end', winnerTeam: 't1' });
    expect(result.events.map((event) => event.type)).toEqual(['move_played', 'round_end']);
  });
});
