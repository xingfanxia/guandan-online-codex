import type { LevelRank } from './cards.js';
import { evaluateALevel } from './levels.js';
import type { GameMode, TeamKey } from './mode.js';
import { computeRoundEnd } from './roundEnd.js';
import type { Placement } from './state.js';
import { nextLevel } from './upgrade.js';

export interface RoundProgressionInput {
  mode: GameMode;
  winnerTeam: TeamKey;
  winnerRanks: number[];
  levels: Record<TeamKey, LevelRank>;
  aFails: Record<TeamKey, number>;
  roundOwner: TeamKey | null;
  roundLevel: LevelRank;
  strictA: boolean;
}

export interface RoundProgressionResult {
  finalWin: boolean;
  winnerTeam: TeamKey;
  levels: Record<TeamKey, LevelRank>;
  aFails: Record<TeamKey, number>;
  roundOwner: TeamKey;
  roundLevel: LevelRank;
  upgrade: number;
}

export function applyRoundProgression(input: RoundProgressionInput): RoundProgressionResult {
  const placements = syntheticPlacements(input.winnerTeam, input.winnerRanks, input.mode);
  const roundEnd = computeRoundEnd(input.mode, placements);
  const loserTeam = input.winnerTeam === 't1' ? 't2' : 't1';
  const levels = { ...input.levels };
  const aLevel = evaluateALevel({
    mode: input.mode,
    winnerTeam: input.winnerTeam,
    winnerRanks: input.winnerRanks,
    levels,
    aFails: input.aFails,
    roundOwner: input.roundOwner,
    roundLevel: input.roundLevel,
    strictA: input.strictA,
  });

  if (aLevel.finalWin) {
    return {
      finalWin: true,
      winnerTeam: input.winnerTeam,
      levels,
      aFails: aLevel.aFails,
      roundOwner: input.winnerTeam,
      roundLevel: levels[input.winnerTeam],
      upgrade: roundEnd.upgrade,
    };
  }

  levels[input.winnerTeam] = aLevel.winnerNewLevel ?? nextLevel(levels[input.winnerTeam], roundEnd.upgrade);
  levels[loserTeam] = aLevel.loserNewLevel ?? levels[loserTeam];

  return {
    finalWin: false,
    winnerTeam: input.winnerTeam,
    levels,
    aFails: aLevel.aFails,
    roundOwner: input.winnerTeam,
    roundLevel: levels[input.winnerTeam],
    upgrade: roundEnd.upgrade,
  };
}

function syntheticPlacements(winnerTeam: TeamKey, winnerRanks: readonly number[], mode: GameMode): Placement[] {
  const maxRank = mode === '4' ? 4 : mode === '6' ? 6 : 8;
  const loserTeam = winnerTeam === 't1' ? 't2' : 't1';
  const winnerRankSet = new Set(winnerRanks);
  return Array.from({ length: maxRank }, (_, index) => {
    const position = index + 1;
    const team = winnerRankSet.has(position) ? winnerTeam : loserTeam;
    return {
      playerId: `synthetic-${position}`,
      position,
      team,
    };
  });
}
