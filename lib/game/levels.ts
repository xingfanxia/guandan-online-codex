import { maxRankForMode, type GameMode, type TeamKey } from './mode.js';
import type { LevelRank } from './cards.js';
import type { TeamFailCounts, TeamLevels } from './state.js';

export interface ALevelInput {
  mode: GameMode;
  winnerTeam: TeamKey;
  winnerRanks: readonly number[];
  levels: TeamLevels;
  aFails: TeamFailCounts;
  roundOwner: TeamKey | null;
  roundLevel: LevelRank;
  strictA: boolean;
}

export interface ALevelResult {
  finalWin: boolean;
  aTeam: TeamKey | undefined;
  winnerNewLevel: LevelRank | undefined;
  loserNewLevel: LevelRank | undefined;
  aFails: TeamFailCounts;
  note: string;
}

function otherTeam(team: TeamKey): TeamKey {
  return team === 't1' ? 't2' : 't1';
}

function tracksAFail(mode: GameMode): boolean {
  return mode === '4';
}

export function evaluateALevel(input: ALevelInput): ALevelResult {
  const aFails = { ...input.aFails };
  const winnerLevel = input.levels[input.winnerTeam] ?? input.roundLevel;
  const loserTeam = input.mode === '4' ? otherTeam(input.winnerTeam) : undefined;
  const loserLevel = loserTeam ? input.levels[loserTeam] : undefined;
  let aTeam: TeamKey | undefined;
  let winnerNewLevel: LevelRank | undefined;
  let loserNewLevel: LevelRank | undefined;
  let note = '';

  const aTeams = (Object.keys(input.levels) as TeamKey[]).filter((team) => input.levels[team] === 'A');
  if (input.mode === '4' && input.levels.t1 === 'A' && input.levels.t2 === 'A') {
    aTeam = input.winnerTeam;
  } else if (input.levels[input.winnerTeam] === 'A') {
    aTeam = input.winnerTeam;
  } else if (input.mode === '4') {
    aTeam = aTeams[0];
  }

  if (!aTeam) {
    return { finalWin: false, aTeam, winnerNewLevel, loserNewLevel, aFails, note };
  }

  function recordAFail(team: TeamKey): { count: number; demoted: boolean } | null {
    if (!tracksAFail(input.mode)) return null;
    const count = (aFails[team] ?? 0) + 1;
    if (count >= 3) {
      aFails[team] = 0;
      return { count, demoted: true };
    }
    aFails[team] = count;
    return { count, demoted: false };
  }

  const aTeamWon = aTeam === input.winnerTeam;
  const winnerHasLast = input.winnerRanks.includes(maxRankForMode(input.mode));

  if (aTeamWon) {
    if (winnerHasLast) {
      winnerNewLevel = winnerLevel;
      if (input.roundOwner === aTeam) {
        const fail = recordAFail(aTeam);
        if (fail?.demoted) winnerNewLevel = '2';
        note = fail ? `A-fail ${fail.count}` : 'A-team won with last place';
      } else {
        note = 'A-team won off-round with last place';
      }
      return { finalWin: false, aTeam, winnerNewLevel, loserNewLevel, aFails, note };
    }

    if (input.strictA && (input.roundLevel !== 'A' || input.roundOwner !== aTeam)) {
      winnerNewLevel = winnerLevel;
      note = 'A-team clean win outside own A round';
      return { finalWin: false, aTeam, winnerNewLevel, loserNewLevel, aFails, note };
    }

    note = 'A-team passed A';
    return { finalWin: true, aTeam, winnerNewLevel, loserNewLevel, aFails, note };
  }

  if (input.roundOwner === aTeam) {
    const fail = recordAFail(aTeam);
    if (fail?.demoted) loserNewLevel = '2';
    note = fail ? `A-fail ${fail.count}` : 'A-team lost own A round';
  } else {
    note = 'A-team lost off-round';
  }

  if (loserLevel !== 'A') loserNewLevel = undefined;
  return { finalWin: false, aTeam, winnerNewLevel, loserNewLevel, aFails, note };
}
