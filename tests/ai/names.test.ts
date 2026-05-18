import { describe, expect, test } from 'vitest';
import { botIdentityForSeat } from '../../lib/ai/names';

describe('bot names', () => {
  test('returns stable Chinese-friendly display names with ASCII handles', () => {
    expect(botIdentityForSeat(1, 'easy')).toEqual({
      handle: 'bot_doudou_2',
      displayName: '@豆豆',
      botDifficulty: 'easy',
    });
    expect(botIdentityForSeat(6, 'medium')).toEqual({
      handle: 'bot_anqi_7',
      displayName: '@安琪',
      botDifficulty: 'medium',
    });
  });
});
