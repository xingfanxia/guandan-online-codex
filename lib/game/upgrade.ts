import { DEFAULT_MODE_RULES, type GameMode, type ModeRules, expectedTeamRankCount } from './mode';
import type { LevelRank } from './cards';

export const LEVELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;

export interface UpgradeResult {
  upgrade: number;
  details: Record<string, unknown>;
}

export function nextLevel(currentLevel: LevelRank, increment: number): LevelRank {
  const currentIndex = Math.max(0, LEVELS.indexOf(currentLevel));
  const newIndex = Math.min(LEVELS.length - 1, currentIndex + increment);
  return LEVELS[newIndex]!;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function scoreSum(ranks: readonly number[], pointMap: Record<number, number>): number {
  return ranks.reduce((total, rank) => total + (pointMap[rank] ?? 0), 0);
}

function tier(diff: number, thresholds: { g3: number; g2: number; g1: number }): number {
  if (diff >= thresholds.g3) return 3;
  if (diff >= thresholds.g2) return 2;
  if (diff >= thresholds.g1) return 1;
  return 0;
}

export function calculateUpgrade(
  mode: GameMode,
  ranks: readonly number[],
  rules: ModeRules = DEFAULT_MODE_RULES,
  must1 = rules.must1,
): UpgradeResult {
  const expectedLength = expectedTeamRankCount(mode);
  if (ranks.length !== expectedLength) {
    return {
      upgrade: 0,
      details: { error: 'invalid_ranks_length', expected: expectedLength, received: ranks.length },
    };
  }

  if (mode === '4') {
    const key = `${ranks[0]},${ranks[1]}` as keyof typeof rules.c4;
    return {
      upgrade: rules.c4[key] ?? 0,
      details: { mode: '4-player', combination: key, upgradeTable: rules.c4 },
    };
  }

  if (mode === '6') {
    const ourScore = scoreSum(ranks, rules.p6);
    const totalScore = sum(Object.values(rules.p6));
    const oppScore = totalScore - ourScore;
    const difference = ourScore - oppScore;
    return {
      upgrade: must1 && !ranks.includes(1) ? 0 : tier(difference, rules.t6),
      details: {
        mode: '6-player',
        ourScore,
        oppScore,
        difference,
        hasFirstPlace: ranks.includes(1),
        thresholds: rules.t6,
      },
    };
  }

  if (ranks[0] === 1 && ranks[1] === 2 && ranks[2] === 3 && ranks[3] === 4) {
    return {
      upgrade: 4,
      details: { mode: '8-player', sweepBonus: true },
    };
  }

  const ourScore = scoreSum(ranks, rules.p8);
  const totalScore = sum(Object.values(rules.p8));
  const oppScore = totalScore - ourScore;
  const difference = ourScore - oppScore;
  return {
    upgrade: must1 && !ranks.includes(1) ? 0 : tier(difference, rules.t8),
    details: {
      mode: '8-player',
      ourScore,
      oppScore,
      difference,
      hasFirstPlace: ranks.includes(1),
      thresholds: rules.t8,
    },
  };
}
