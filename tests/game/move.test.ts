import { describe, expect, test } from 'vitest';
import { applyMove } from '../../lib/game/move';
import { type Card } from '../../lib/game/cards';
import { type Player, type PlayingState } from '../../lib/game/state';
import type { GameMode } from '../../lib/game/mode';

function c(rank: Card['rank'], suit: Card['suit'] = 'spades', deck = 1): Card {
  return { rank, suit, deck: deck as 1 | 2 };
}

function state(hands: PlayingState['hands'], currentTurn = 'p1'): PlayingState {
  return {
    phase: 'playing',
    mode: '4',
    levelRank: '2',
    players: [
      { id: 'p1', seat: 'east', team: 't1' },
      { id: 'p2', seat: 'south', team: 't2' },
      { id: 'p3', seat: 'west', team: 't1' },
      { id: 'p4', seat: 'north', team: 't2' },
    ],
    hands,
    undealt: [],
    finished: [],
    currentTurn,
    currentTrick: { leader: currentTurn, passes: [] },
    version: 1,
  };
}

function multiplayerState({
  mode,
  players,
  hands,
  finished,
  currentTurn,
}: Pick<PlayingState, 'mode' | 'players' | 'hands' | 'finished' | 'currentTurn'>): PlayingState {
  return {
    phase: 'playing',
    mode,
    levelRank: '2',
    players,
    hands,
    undealt: [],
    finished,
    currentTurn,
    currentTrick: { leader: currentTurn, passes: [] },
    version: 1,
  };
}

function playersFor(mode: GameMode): Player[] {
  const count = mode === '6' ? 6 : 8;
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    seat: `seat${index + 1}`,
    team: index % 2 === 0 ? 't1' : 't2',
  }));
}

function expectPlaying(result: ReturnType<typeof applyMove>): PlayingState {
  if (!result.ok || result.state.phase !== 'playing') {
    throw new Error(`Expected playing state, got ${JSON.stringify(result)}`);
  }
  return result.state;
}

describe('applyMove', () => {
  test('rejects wrong turn, missing cards, invalid combos, and non-beating plays', () => {
    let game = state({
      p1: [c('3'), c('4')],
      p2: [c('3', 'hearts'), c('4', 'hearts')],
      p3: [c('3', 'clubs')],
      p4: [c('3', 'diamonds')],
    });

    expect(applyMove(game, { type: 'play', playerId: 'p2', cards: [c('3', 'hearts')] })).toMatchObject({
      ok: false,
      error: 'ERR_WRONG_TURN',
    });
    expect(applyMove(game, { type: 'play', playerId: 'p1', cards: [c('9')] })).toMatchObject({
      ok: false,
      error: 'ERR_CARD_NOT_IN_HAND',
    });
    expect(applyMove(game, { type: 'play', playerId: 'p1', cards: [c('3'), c('4')] })).toMatchObject({
      ok: false,
      error: 'ERR_INVALID_COMBO',
    });

    const lead = applyMove(game, { type: 'play', playerId: 'p1', cards: [c('4')] });
    expect(lead.ok).toBe(true);
    game = expectPlaying(lead);

    expect(applyMove(game, { type: 'play', playerId: 'p2', cards: [c('3', 'hearts')] })).toMatchObject({
      ok: false,
      error: 'ERR_DOESNT_BEAT_PREVIOUS',
    });
  });

  test('plays, passes, completes tricks, and resets lead to last unbeaten player', () => {
    let game = state({
      p1: [c('3'), c('8')],
      p2: [c('4', 'hearts')],
      p3: [c('5', 'clubs'), c('9')],
      p4: [c('6', 'diamonds')],
    });

    const p1 = applyMove(game, { type: 'play', playerId: 'p1', cards: [c('3')] });
    expect(p1).toMatchObject({ ok: true, state: { currentTurn: 'p2', version: 2 } });
    game = expectPlaying(p1);

    const p2 = applyMove(game, { type: 'pass', playerId: 'p2' });
    expect(p2).toMatchObject({ ok: true, state: { currentTurn: 'p3', currentTrick: { passes: ['p2'] } } });
    game = expectPlaying(p2);

    const p3 = applyMove(game, { type: 'play', playerId: 'p3', cards: [c('5', 'clubs')] });
    expect(p3).toMatchObject({ ok: true, state: { currentTurn: 'p4', currentTrick: { passes: [] } } });
    game = expectPlaying(p3);

    game = expectPlaying(applyMove(game, { type: 'pass', playerId: 'p4' }));
    game = expectPlaying(applyMove(game, { type: 'pass', playerId: 'p1' }));
    const complete = applyMove(game, { type: 'pass', playerId: 'p2' });

    expect(complete).toMatchObject({
      ok: true,
      state: {
        phase: 'playing',
        currentTurn: 'p3',
        currentTrick: { leader: 'p3', passes: [] },
      },
    });
    expect(expectPlaying(complete).currentTrick.currentPlay).toBeUndefined();
  });

  test('applies teammate wind when a player goes out unbeaten', () => {
    let game = state({
      p1: [c('A')],
      p2: [c('3', 'hearts')],
      p3: [c('4', 'clubs')],
      p4: [c('5', 'diamonds')],
    });

    game = expectPlaying(applyMove(game, { type: 'play', playerId: 'p1', cards: [c('A')] }));
    expect(game.finished).toEqual([{ playerId: 'p1', position: 1, team: 't1' }]);

    game = expectPlaying(applyMove(game, { type: 'pass', playerId: 'p2' }));
    game = expectPlaying(applyMove(game, { type: 'pass', playerId: 'p3' }));
    const result = applyMove(game, { type: 'pass', playerId: 'p4' });

    expect(result).toMatchObject({
      ok: true,
      state: { phase: 'playing', currentTurn: 'p3', currentTrick: { leader: 'p3' } },
    });
  });

  test('ends a 4P round immediately when one team finishes first and second', () => {
    let game = state({
      p1: [c('A')],
      p2: [c('3', 'hearts')],
      p3: [c('K', 'clubs')],
      p4: [c('4', 'diamonds')],
    });

    game = expectPlaying(applyMove(game, { type: 'play', playerId: 'p1', cards: [c('A')] }));
    game = expectPlaying(applyMove(game, { type: 'pass', playerId: 'p2' }));
    game = expectPlaying(applyMove(game, { type: 'pass', playerId: 'p3' }));
    game = expectPlaying(applyMove(game, { type: 'pass', playerId: 'p4' }));

    const roundEnd = applyMove(game, { type: 'play', playerId: 'p3', cards: [c('K', 'clubs')] });

    expect(roundEnd).toMatchObject({
      ok: true,
      state: {
        phase: 'round-end',
        winnerTeam: 't1',
        placements: [
          { playerId: 'p1', position: 1, team: 't1' },
          { playerId: 'p3', position: 2, team: 't1' },
          { playerId: 'p2', position: 3, team: 't2' },
          { playerId: 'p4', position: 4, team: 't2' },
        ],
        upgrade: 3,
      },
    });
  });

  test('ends a 6P round when the first-place team has all three players out', () => {
    const game = multiplayerState({
      mode: '6',
      players: playersFor('6'),
      hands: {
        p1: [],
        p2: [c('3', 'hearts')],
        p3: [],
        p4: [c('4', 'diamonds')],
        p5: [c('A')],
        p6: [c('5', 'clubs')],
      },
      finished: [
        { playerId: 'p1', position: 1, team: 't1' },
        { playerId: 'p3', position: 2, team: 't1' },
      ],
      currentTurn: 'p5',
    });

    const roundEnd = applyMove(game, { type: 'play', playerId: 'p5', cards: [c('A')] });

    expect(roundEnd).toMatchObject({
      ok: true,
      state: {
        phase: 'round-end',
        winnerTeam: 't1',
        placements: [
          { playerId: 'p1', position: 1, team: 't1' },
          { playerId: 'p3', position: 2, team: 't1' },
          { playerId: 'p5', position: 3, team: 't1' },
          { playerId: 'p2', position: 4, team: 't2' },
          { playerId: 'p4', position: 5, team: 't2' },
          { playerId: 'p6', position: 6, team: 't2' },
        ],
        upgrade: 3,
      },
    });
  });

  test('ends a 6P round at the penultimate finisher and auto-places the last player', () => {
    const game = multiplayerState({
      mode: '6',
      players: playersFor('6'),
      hands: {
        p1: [],
        p2: [],
        p3: [],
        p4: [],
        p5: [c('9', 'clubs')],
        p6: [c('A')],
      },
      finished: [
        { playerId: 'p1', position: 1, team: 't1' },
        { playerId: 'p2', position: 2, team: 't2' },
        { playerId: 'p3', position: 3, team: 't1' },
        { playerId: 'p4', position: 4, team: 't2' },
      ],
      currentTurn: 'p6',
    });

    const roundEnd = applyMove(game, { type: 'play', playerId: 'p6', cards: [c('A')] });

    expect(roundEnd).toMatchObject({
      ok: true,
      state: {
        phase: 'round-end',
        winnerTeam: 't1',
        placements: [
          { playerId: 'p1', position: 1, team: 't1' },
          { playerId: 'p2', position: 2, team: 't2' },
          { playerId: 'p3', position: 3, team: 't1' },
          { playerId: 'p4', position: 4, team: 't2' },
          { playerId: 'p6', position: 5, team: 't2' },
          { playerId: 'p5', position: 6, team: 't1' },
        ],
      },
    });
  });

  test('ends an 8P sweep as soon as the first-place team occupies top four', () => {
    const game = multiplayerState({
      mode: '8',
      players: playersFor('8'),
      hands: {
        p1: [],
        p2: [c('3', 'hearts')],
        p3: [],
        p4: [c('4', 'diamonds')],
        p5: [],
        p6: [c('5', 'clubs')],
        p7: [c('A')],
        p8: [c('6', 'clubs')],
      },
      finished: [
        { playerId: 'p1', position: 1, team: 't1' },
        { playerId: 'p3', position: 2, team: 't1' },
        { playerId: 'p5', position: 3, team: 't1' },
      ],
      currentTurn: 'p7',
    });

    const roundEnd = applyMove(game, { type: 'play', playerId: 'p7', cards: [c('A')] });

    expect(roundEnd).toMatchObject({
      ok: true,
      state: {
        phase: 'round-end',
        winnerTeam: 't1',
        placements: [
          { playerId: 'p1', position: 1, team: 't1' },
          { playerId: 'p3', position: 2, team: 't1' },
          { playerId: 'p5', position: 3, team: 't1' },
          { playerId: 'p7', position: 4, team: 't1' },
          { playerId: 'p2', position: 5, team: 't2' },
          { playerId: 'p4', position: 6, team: 't2' },
          { playerId: 'p6', position: 7, team: 't2' },
          { playerId: 'p8', position: 8, team: 't2' },
        ],
        upgrade: 4,
      },
    });
  });
});
