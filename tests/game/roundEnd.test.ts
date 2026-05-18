import { describe, expect, test } from 'vitest';
import { computeRoundEnd } from '../../lib/game/roundEnd';
import type { Placement } from '../../lib/game/state';

const cases: Array<{ name: string; placements: Placement[]; upgrade: number }> = [
  {
    name: 'double-up positions 1+2 upgrades 3',
    placements: [
      { playerId: 'p1', position: 1, team: 't1' },
      { playerId: 'p3', position: 2, team: 't1' },
      { playerId: 'p2', position: 3, team: 't2' },
      { playerId: 'p4', position: 4, team: 't2' },
    ],
    upgrade: 3,
  },
  {
    name: 'positions 1+3 upgrades 2',
    placements: [
      { playerId: 'p1', position: 1, team: 't1' },
      { playerId: 'p2', position: 2, team: 't2' },
      { playerId: 'p3', position: 3, team: 't1' },
      { playerId: 'p4', position: 4, team: 't2' },
    ],
    upgrade: 2,
  },
  {
    name: 'positions 1+4 upgrades 1',
    placements: [
      { playerId: 'p1', position: 1, team: 't1' },
      { playerId: 'p2', position: 2, team: 't2' },
      { playerId: 'p4', position: 3, team: 't2' },
      { playerId: 'p3', position: 4, team: 't1' },
    ],
    upgrade: 1,
  },
];

describe('round-end scoring', () => {
  test.each(cases)('$name', ({ placements, upgrade }) => {
    expect(computeRoundEnd('4', placements)).toMatchObject({
      winnerTeam: 't1',
      winnerRanks: placements.filter((placement) => placement.team === 't1').map((placement) => placement.position),
      upgrade,
    });
  });
});
