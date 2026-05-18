import type { AntiTributeCondition, ReturnCardCap } from '../game/tribute.js';
import type { ExchangeVoteThreshold } from '../game/exchange.js';

export type TributeSelection = 'auto_pick' | 'player_picks';
export type ReturnSelection = 'player_picks' | 'auto_pick_lowest';
export type SameRankTiebreak = 'auto_left_right' | 'winner_picks_suit';
export type Mode8TributeDepth = 'full' | 'top_only' | 'single';

export interface RoomRules {
  tributeEnabled: boolean;
  antiTributeCondition: AntiTributeCondition;
  returnCardCap: ReturnCardCap;
  tributeSelection: TributeSelection;
  returnSelection: ReturnSelection;
  returnTimeLimitSeconds: 10 | 15 | 30;
  sameRankTiebreak: SameRankTiebreak;
  mode8TributeDepth: Mode8TributeDepth;
  cardExchange: boolean;
  exchangeVoteThreshold: ExchangeVoteThreshold;
  exchangeVoteDurationSeconds: 10 | 15 | 20;
  exchangeCardCount: 2 | 3 | 4;
}

export type RoomRulesInput = Partial<Record<keyof RoomRules, unknown>>;

export const DEFAULT_ROOM_RULES: RoomRules = {
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
};

export function normalizeRoomRules(input: unknown = {}): RoomRules {
  if (!plainObject(input)) throw new Error('ERR_INVALID_ROOM_RULES');
  const overrides = input as RoomRulesInput;
  const rules = { ...DEFAULT_ROOM_RULES };

  if ('tributeEnabled' in overrides) rules.tributeEnabled = boolean(overrides.tributeEnabled);
  if ('antiTributeCondition' in overrides) {
    rules.antiTributeCondition = oneOf(overrides.antiTributeCondition, ['dual_big_joker', 'any_dual_joker', 'disabled']);
  }
  if ('returnCardCap' in overrides) rules.returnCardCap = oneOf(overrides.returnCardCap, ['rank_10', 'rank_jack', 'none']);
  if ('tributeSelection' in overrides) rules.tributeSelection = oneOf(overrides.tributeSelection, ['auto_pick', 'player_picks']);
  if ('returnSelection' in overrides) rules.returnSelection = oneOf(overrides.returnSelection, ['player_picks', 'auto_pick_lowest']);
  if ('returnTimeLimitSeconds' in overrides) rules.returnTimeLimitSeconds = oneOf(overrides.returnTimeLimitSeconds, [10, 15, 30]);
  if ('sameRankTiebreak' in overrides) rules.sameRankTiebreak = oneOf(overrides.sameRankTiebreak, ['auto_left_right', 'winner_picks_suit']);
  if ('mode8TributeDepth' in overrides) rules.mode8TributeDepth = oneOf(overrides.mode8TributeDepth, ['full', 'top_only', 'single']);
  if ('cardExchange' in overrides) rules.cardExchange = boolean(overrides.cardExchange);
  if ('exchangeVoteThreshold' in overrides) rules.exchangeVoteThreshold = oneOf(overrides.exchangeVoteThreshold, ['majority', 'unanimous']);
  if ('exchangeVoteDurationSeconds' in overrides) rules.exchangeVoteDurationSeconds = oneOf(overrides.exchangeVoteDurationSeconds, [10, 15, 20]);
  if ('exchangeCardCount' in overrides) rules.exchangeCardCount = oneOf(overrides.exchangeCardCount, [2, 3, 4]);

  return rules;
}

function plainObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('ERR_INVALID_ROOM_RULES');
  return value;
}

function oneOf<const T extends readonly (string | number)[]>(value: unknown, options: T): T[number] {
  if (!options.includes(value as T[number])) throw new Error('ERR_INVALID_ROOM_RULES');
  return value as T[number];
}
