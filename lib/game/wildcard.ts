import { isHeartLevelWildcard, type Card, type LevelRank } from './cards.js';

export function countWildcards(cards: readonly Card[], levelRank: LevelRank): number {
  return cards.filter((card) => isHeartLevelWildcard(card, levelRank)).length;
}
