import { describe, expect, test } from 'vitest';
import { DEFAULT_ROOM_RULES, normalizeRoomRules } from '../../lib/room/rules';

describe('room rules', () => {
  test('defaults to tournament tribute and exchange disabled', () => {
    expect(DEFAULT_ROOM_RULES).toMatchObject({
      tributeEnabled: true,
      antiTributeCondition: 'dual_big_joker',
      returnCardCap: 'rank_10',
      tributeSelection: 'auto_pick',
      returnSelection: 'player_picks',
      returnTimeLimitSeconds: 15,
      sameRankTiebreak: 'auto_left_right',
      mode8TributeDepth: 'top_only',
      cardExchange: false,
      exchangeVoteThreshold: 'majority',
      exchangeVoteDurationSeconds: 15,
      exchangeCardCount: 3,
    });
  });

  test('normalizes valid overrides while preserving defaults', () => {
    expect(
      normalizeRoomRules({
        cardExchange: true,
        exchangeCardCount: 4,
        exchangeVoteThreshold: 'unanimous',
        mode8TributeDepth: 'full',
        tributeEnabled: false,
        returnCardCap: 'none',
        tributeSelection: 'player_picks',
        returnSelection: 'auto_pick_lowest',
        returnTimeLimitSeconds: 30,
        sameRankTiebreak: 'winner_picks_suit',
        exchangeVoteDurationSeconds: 20,
      }),
    ).toMatchObject({
      ...DEFAULT_ROOM_RULES,
      cardExchange: true,
      exchangeCardCount: 4,
      exchangeVoteThreshold: 'unanimous',
      mode8TributeDepth: 'full',
      tributeEnabled: false,
      returnCardCap: 'none',
      tributeSelection: 'player_picks',
      returnSelection: 'auto_pick_lowest',
      returnTimeLimitSeconds: 30,
      sameRankTiebreak: 'winner_picks_suit',
      exchangeVoteDurationSeconds: 20,
    });
  });

  test('rejects invalid rule values', () => {
    expect(() => normalizeRoomRules([])).toThrow('ERR_INVALID_ROOM_RULES');
    expect(() => normalizeRoomRules({ cardExchange: 'yes' })).toThrow('ERR_INVALID_ROOM_RULES');
    expect(() => normalizeRoomRules({ exchangeCardCount: 5 })).toThrow('ERR_INVALID_ROOM_RULES');
    expect(() => normalizeRoomRules({ returnTimeLimitSeconds: 20 })).toThrow('ERR_INVALID_ROOM_RULES');
    expect(() => normalizeRoomRules({ antiTributeCondition: 'red_joker' })).toThrow('ERR_INVALID_ROOM_RULES');
  });
});
