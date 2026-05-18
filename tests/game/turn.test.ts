import { describe, expect, test } from 'vitest';
import { createPlayers } from '../../lib/game/state';
import { nextActivePlayer, partnerOf, teamOf } from '../../lib/game/turn';

describe('turn order', () => {
  test('uses counter-clockwise 4P order and opposite-seat partners', () => {
    const players = createPlayers('4');
    const active = new Set(players.map((player) => player.id));

    expect(players.map((player) => player.seat)).toEqual(['east', 'south', 'west', 'north']);
    expect(nextActivePlayer(players, 'p1', active)).toBe('p2');
    expect(nextActivePlayer(players, 'p4', active)).toBe('p1');
    expect(partnerOf(players, 'p1')).toBe('p3');
    expect(partnerOf(players, 'p2')).toBe('p4');
    expect(teamOf(players, 'p1')).toBe('t1');
    expect(teamOf(players, 'p2')).toBe('t2');
  });

  test('skips players who have already gone out', () => {
    const players = createPlayers('4');
    const active = new Set(['p1', 'p3', 'p4']);

    expect(nextActivePlayer(players, 'p1', active)).toBe('p3');
    expect(nextActivePlayer(players, 'p3', active)).toBe('p4');
  });
});
