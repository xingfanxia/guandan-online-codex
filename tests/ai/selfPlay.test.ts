import { describe, expect, test } from 'vitest';
import { runBotRound } from '../../lib/ai/selfPlay';
import type { Card, Rank, Suit } from '../../lib/game/cards';
import type { Player, PlayingState } from '../../lib/game/state';

function c(rank: Rank, suit: Suit = 'spades', deck = 1): Card {
  return { rank, suit, deck: deck as 1 | 2 };
}

function botPlayers(): Player[] {
  return [
    { id: 'p1', seat: 'east', team: 't1', kind: 'bot', botDifficulty: 'easy' },
    { id: 'p2', seat: 'south', team: 't2', kind: 'bot', botDifficulty: 'easy' },
    { id: 'p3', seat: 'west', team: 't1', kind: 'bot', botDifficulty: 'easy' },
    { id: 'p4', seat: 'north', team: 't2', kind: 'bot', botDifficulty: 'easy' },
  ];
}

function state(overrides: Partial<PlayingState> = {}): PlayingState {
  return {
    phase: 'playing',
    mode: '4',
    levelRank: '2',
    players: botPlayers(),
    hands: {
      p1: [c('A')],
      p2: [c('3')],
      p3: [c('K')],
      p4: [c('4')],
    },
    undealt: [],
    finished: [],
    currentTurn: 'p1',
    currentTrick: { leader: 'p1', passes: [] },
    version: 1,
    ...overrides,
  };
}

describe('bot self-play round runner', () => {
  test('drives a deterministic all-bot round to round-end', () => {
    const result = runBotRound(state(), { maxMoves: 10, random: () => 0.9 });

    expect(result.state).toMatchObject({
      phase: 'round-end',
      winnerTeam: 't1',
    });
    expect(result.state.phase === 'round-end' ? result.state.placements.slice(0, 2) : []).toEqual([
      { playerId: 'p1', position: 1, team: 't1' },
      { playerId: 'p3', position: 2, team: 't1' },
    ]);
    expect(result.moves).toEqual([
      { playerId: 'p1', command: { type: 'play', cards: [c('A')] } },
      { playerId: 'p2', command: { type: 'pass' } },
      { playerId: 'p3', command: { type: 'pass' } },
      { playerId: 'p4', command: { type: 'pass' } },
      { playerId: 'p3', command: { type: 'play', cards: [c('K')] } },
    ]);
    expect(result.events.map((event) => event.type)).toEqual([
      'move_played',
      'state_resync',
      'state_resync',
      'state_resync',
      'move_played',
      'round_end',
    ]);
  });

  test('fails fast when the current player is human', () => {
    expect(() => runBotRound(state({
      players: [
        { id: 'p1', seat: 'east', team: 't1', kind: 'human' },
        ...botPlayers().slice(1),
      ],
    }))).toThrow('ERR_BOT_ROUND_STUCK');
  });

  test('fails when the move budget is exhausted before round-end', () => {
    expect(() => runBotRound(state(), { maxMoves: 1, random: () => 0.9 })).toThrow('ERR_SELF_PLAY_MAX_MOVES');
  });
});
