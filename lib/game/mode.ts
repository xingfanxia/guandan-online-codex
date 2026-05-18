export type GameMode = '4' | '6' | '8';
export type TeamKey = 't1' | 't2';

export interface ModeRules {
  c4: Record<'1,2' | '1,3' | '1,4', number>;
  t6: { g3: number; g2: number; g1: number };
  p6: Record<1 | 2 | 3 | 4 | 5 | 6, number>;
  t8: { g3: number; g2: number; g1: number };
  p8: Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, number>;
  must1: boolean;
  strictA: boolean;
}

export const DEFAULT_MODE_RULES: ModeRules = {
  c4: {
    '1,2': 3,
    '1,3': 2,
    '1,4': 1,
  },
  t6: {
    g3: 7,
    g2: 4,
    g1: 1,
  },
  p6: {
    1: 5,
    2: 4,
    3: 3,
    4: 3,
    5: 1,
    6: 0,
  },
  t8: {
    g3: 11,
    g2: 5,
    g1: 0,
  },
  p8: {
    1: 7,
    2: 6,
    3: 5,
    4: 4,
    5: 3,
    6: 2,
    7: 1,
    8: 0,
  },
  must1: true,
  strictA: true,
};

export function expectedTeamRankCount(mode: GameMode): number {
  if (mode === '4') return 2;
  if (mode === '6') return 3;
  return 4;
}

export function maxRankForMode(mode: GameMode): number {
  if (mode === '4') return 4;
  if (mode === '6') return 6;
  return 8;
}
