import { describe, expect, test } from 'vitest';
import { runBotBenchmark } from '../../lib/ai/benchmark';

describe('bot benchmark runner', () => {
  test('runs deterministic self-play rounds and summarizes winners', () => {
    const first = runBotBenchmark({ rounds: 2, seed: 7, botDifficulty: 'easy', maxMovesPerRound: 300 });
    const second = runBotBenchmark({ rounds: 2, seed: 7, botDifficulty: 'easy', maxMovesPerRound: 300 });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      rounds: 2,
      mode: '4',
      completed: 2,
      failed: 0,
      botDifficulty: 'easy',
    });
    expect(first.averageMoves).toBeGreaterThan(0);
    expect(first.winnerTeams.t1 + first.winnerTeams.t2).toBe(2);
    expect(first.failures).toEqual([]);
  });

  test('runs mode-sized self-play rounds for 8P benchmarks', () => {
    const result = runBotBenchmark({ rounds: 1, mode: '8', seed: 7, botDifficulty: 'easy', maxMovesPerRound: 300 });

    expect(result).toMatchObject({
      rounds: 1,
      mode: '8',
      completed: 1,
      failed: 0,
    });
    expect(Object.values(result.winnerTeams).reduce((sum, count) => sum + count, 0)).toBe(1);
  });

  test('records failed rounds when the move budget is too small', () => {
    const result = runBotBenchmark({ rounds: 1, seed: 7, botDifficulty: 'easy', maxMovesPerRound: 1 });

    expect(result).toMatchObject({
      rounds: 1,
      completed: 0,
      failed: 1,
      failures: [{ round: 1, error: 'ERR_SELF_PLAY_MAX_MOVES' }],
    });
  });
});
