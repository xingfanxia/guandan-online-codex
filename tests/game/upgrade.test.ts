import { describe, expect, test } from 'vitest';
import { calculateUpgrade, nextLevel } from '../../lib/game/upgrade';
import { DEFAULT_MODE_RULES, expectedTeamRankCount, maxRankForMode } from '../../lib/game/mode';

describe('level upgrades', () => {
  test('clamps nextLevel at A', () => {
    expect(nextLevel('2', 3)).toBe('5');
    expect(nextLevel('K', 1)).toBe('A');
    expect(nextLevel('A', 3)).toBe('A');
  });

  test('uses canonical 4P placement upgrades', () => {
    expect(calculateUpgrade('4', [1, 2], DEFAULT_MODE_RULES).upgrade).toBe(3);
    expect(calculateUpgrade('4', [1, 3], DEFAULT_MODE_RULES).upgrade).toBe(2);
    expect(calculateUpgrade('4', [1, 4], DEFAULT_MODE_RULES).upgrade).toBe(1);
  });

  test('keeps scorer point thresholds for 6P and active 8P defaults', () => {
    expect(calculateUpgrade('6', [1, 2, 3], DEFAULT_MODE_RULES).upgrade).toBe(3);
    expect(calculateUpgrade('6', [2, 3, 4], DEFAULT_MODE_RULES).upgrade).toBe(0);
    expect(calculateUpgrade('6', [2, 3, 4], DEFAULT_MODE_RULES, false).upgrade).toBe(2);
    expect(calculateUpgrade('8', [1, 2, 3, 4], DEFAULT_MODE_RULES).upgrade).toBe(4);
    expect(calculateUpgrade('8', [1, 5, 6, 8], DEFAULT_MODE_RULES).details).toMatchObject({
      thresholds: { g3: 11, g2: 5, g1: 0 },
    });
  });

  test('uses pair-team upgrade tiers for 6P/8P teams-of-2 rooms', () => {
    expect(calculateUpgrade('6', [1, 2], DEFAULT_MODE_RULES, true, 2).upgrade).toBe(3);
    expect(calculateUpgrade('6', [1, 3], DEFAULT_MODE_RULES, true, 2).upgrade).toBe(2);
    expect(calculateUpgrade('6', [1, 4], DEFAULT_MODE_RULES, true, 2).upgrade).toBe(1);
    expect(calculateUpgrade('8', [1, 2], DEFAULT_MODE_RULES, true, 2).upgrade).toBe(3);
    expect(calculateUpgrade('8', [1, 4], DEFAULT_MODE_RULES, true, 2).upgrade).toBe(2);
    expect(calculateUpgrade('8', [1, 8], DEFAULT_MODE_RULES, true, 2).upgrade).toBe(1);
    expect(calculateUpgrade('8', [2, 3], DEFAULT_MODE_RULES, true, 2).upgrade).toBe(0);
  });

  test('reports invalid team-rank lengths and mode metadata', () => {
    expect(calculateUpgrade('4', [1], DEFAULT_MODE_RULES)).toMatchObject({
      upgrade: 0,
      details: { error: 'invalid_ranks_length', expected: 2, received: 1 },
    });
    expect(expectedTeamRankCount('4')).toBe(2);
    expect(expectedTeamRankCount('8')).toBe(4);
    expect(maxRankForMode('4')).toBe(4);
    expect(maxRankForMode('6')).toBe(6);
    expect(maxRankForMode('8')).toBe(8);
  });
});
