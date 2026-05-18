import { describe, expect, test } from 'vitest';
import { applyRoundProgression } from '../../lib/game/gameEnd';

describe('game-end and level progression', () => {
  test('advances non-A winners and transfers round ownership', () => {
    expect(
      applyRoundProgression({
        mode: '4',
        winnerTeam: 't1',
        winnerRanks: [1, 3],
        levels: { t1: '7', t2: '5' },
        aFails: { t1: 0, t2: 0 },
        roundOwner: 't2',
        roundLevel: '5',
        strictA: true,
      }),
    ).toMatchObject({
      finalWin: false,
      levels: { t1: '9', t2: '5' },
      roundOwner: 't1',
      roundLevel: '9',
    });
  });

  test('strict A requires clean own-A win', () => {
    expect(
      applyRoundProgression({
        mode: '4',
        winnerTeam: 't1',
        winnerRanks: [1, 3],
        levels: { t1: 'A', t2: 'K' },
        aFails: { t1: 0, t2: 0 },
        roundOwner: 't2',
        roundLevel: 'K',
        strictA: true,
      }),
    ).toMatchObject({
      finalWin: false,
      levels: { t1: 'A', t2: 'K' },
      roundOwner: 't1',
      roundLevel: 'A',
    });

    expect(
      applyRoundProgression({
        mode: '4',
        winnerTeam: 't1',
        winnerRanks: [1, 3],
        levels: { t1: 'A', t2: 'K' },
        aFails: { t1: 0, t2: 0 },
        roundOwner: 't1',
        roundLevel: 'A',
        strictA: true,
      }),
    ).toMatchObject({
      finalWin: true,
      winnerTeam: 't1',
    });
  });

  test('applies third A failure demotion only to the failing 4P A team', () => {
    expect(
      applyRoundProgression({
        mode: '4',
        winnerTeam: 't2',
        winnerRanks: [1, 3],
        levels: { t1: 'A', t2: '6' },
        aFails: { t1: 2, t2: 0 },
        roundOwner: 't1',
        roundLevel: 'A',
        strictA: true,
      }),
    ).toMatchObject({
      finalWin: false,
      levels: { t1: '2', t2: '8' },
      aFails: { t1: 0, t2: 0 },
      roundOwner: 't2',
      roundLevel: '8',
    });
  });
});
