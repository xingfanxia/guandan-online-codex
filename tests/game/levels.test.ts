import { describe, expect, test } from 'vitest';
import { evaluateALevel } from '../../lib/game/levels';

describe('A-level state machine', () => {
  test('is a no-op when neither team is at A', () => {
    expect(
      evaluateALevel({
        mode: '4',
        winnerTeam: 't1',
        winnerRanks: [1, 2],
        levels: { t1: '8', t2: '9' },
        aFails: { t1: 1, t2: 2 },
        roundOwner: 't1',
        roundLevel: '8',
        strictA: true,
      }),
    ).toMatchObject({ finalWin: false, aTeam: undefined, aFails: { t1: 1, t2: 2 } });
  });

  test('passes A only on a clean own-A win in strict mode', () => {
    expect(
      evaluateALevel({
        mode: '4',
        winnerTeam: 't1',
        winnerRanks: [1, 3],
        levels: { t1: 'A', t2: '9' },
        aFails: { t1: 0, t2: 0 },
        roundOwner: 't1',
        roundLevel: 'A',
        strictA: true,
      }),
    ).toMatchObject({ finalWin: true, aTeam: 't1' });

    expect(
      evaluateALevel({
        mode: '4',
        winnerTeam: 't1',
        winnerRanks: [1, 3],
        levels: { t1: 'A', t2: '9' },
        aFails: { t1: 0, t2: 0 },
        roundOwner: 't2',
        roundLevel: '9',
        strictA: true,
      }),
    ).toMatchObject({ finalWin: false, winnerNewLevel: 'A', aFails: { t1: 0, t2: 0 } });
  });

  test('records only 4P own-A failures and demotes on the third failure', () => {
    expect(
      evaluateALevel({
        mode: '4',
        winnerTeam: 't1',
        winnerRanks: [1, 4],
        levels: { t1: 'A', t2: '9' },
        aFails: { t1: 0, t2: 0 },
        roundOwner: 't1',
        roundLevel: 'A',
        strictA: true,
      }),
    ).toMatchObject({
      finalWin: false,
      winnerNewLevel: 'A',
      aFails: { t1: 1, t2: 0 },
    });

    expect(
      evaluateALevel({
        mode: '4',
        winnerTeam: 't2',
        winnerRanks: [1, 3],
        levels: { t1: 'A', t2: '9' },
        aFails: { t1: 2, t2: 0 },
        roundOwner: 't1',
        roundLevel: 'A',
        strictA: true,
      }),
    ).toMatchObject({
      finalWin: false,
      loserNewLevel: '2',
      aFails: { t1: 0, t2: 0 },
    });
  });

  test('does not demote A-level teams in 6P or 8P modes', () => {
    expect(
      evaluateALevel({
        mode: '6',
        winnerTeam: 't2',
        winnerRanks: [1, 2, 4],
        levels: { t1: 'A', t2: '9' },
        aFails: { t1: 2, t2: 0 },
        roundOwner: 't1',
        roundLevel: 'A',
        strictA: true,
      }),
    ).toMatchObject({
      finalWin: false,
      loserNewLevel: undefined,
      aFails: { t1: 2, t2: 0 },
    });
  });

  test('evaluates both teams at A against the winner and supports lenient clean wins', () => {
    expect(
      evaluateALevel({
        mode: '4',
        winnerTeam: 't2',
        winnerRanks: [1, 3],
        levels: { t1: 'A', t2: 'A' },
        aFails: { t1: 0, t2: 0 },
        roundOwner: 't1',
        roundLevel: 'A',
        strictA: true,
      }),
    ).toMatchObject({ finalWin: false, aTeam: 't2', winnerNewLevel: 'A' });

    expect(
      evaluateALevel({
        mode: '4',
        winnerTeam: 't2',
        winnerRanks: [1, 3],
        levels: { t1: 'A', t2: 'A' },
        aFails: { t1: 0, t2: 0 },
        roundOwner: 't1',
        roundLevel: 'A',
        strictA: false,
      }),
    ).toMatchObject({ finalWin: true, aTeam: 't2' });
  });
});
