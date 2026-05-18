import { DEFAULT_MODE_RULES, type GameMode, type TeamKey } from './mode.js';
import type { Placement } from './state.js';
import { calculateUpgrade } from './upgrade.js';

export interface RoundEndResult {
  winnerTeam: TeamKey;
  winnerRanks: number[];
  upgrade: number;
}

export function computeRoundEnd(mode: GameMode, placements: readonly Placement[], teamRankCount?: number): RoundEndResult {
  const first = placements.find((placement) => placement.position === 1);
  if (!first) {
    throw new Error('computeRoundEnd requires a first-place placement');
  }

  const winnerRanks = placements
    .filter((placement) => placement.team === first.team)
    .map((placement) => placement.position)
    .sort((a, b) => a - b);
  const { upgrade } = calculateUpgrade(mode, winnerRanks, DEFAULT_MODE_RULES, DEFAULT_MODE_RULES.must1, teamRankCount);

  return {
    winnerTeam: first.team,
    winnerRanks,
    upgrade,
  };
}
