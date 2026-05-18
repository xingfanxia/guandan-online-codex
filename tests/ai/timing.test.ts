import { describe, expect, test } from 'vitest';
import { botMoveDelayMs, createDeterministicRandom } from '../../lib/ai/timing';

describe('bot timing', () => {
  test('keeps bot move delays inside the configured human-like range', () => {
    const random = createDeterministicRandom(7);
    const samples = Array.from({ length: 100 }, () => botMoveDelayMs({ random }));

    expect(Math.min(...samples)).toBeGreaterThanOrEqual(800);
    expect(Math.max(...samples)).toBeLessThanOrEqual(5_500);
    expect(new Set(samples).size).toBeGreaterThan(50);
  });

  test('is deterministic when a seeded random function is supplied', () => {
    const randomA = createDeterministicRandom(42);
    const randomB = createDeterministicRandom(42);

    expect([
      botMoveDelayMs({ random: randomA }),
      botMoveDelayMs({ random: randomA }),
      botMoveDelayMs({ random: randomA }),
    ]).toEqual([
      botMoveDelayMs({ random: randomB }),
      botMoveDelayMs({ random: randomB }),
      botMoveDelayMs({ random: randomB }),
    ]);
  });
});
