import { isHeartLevelWildcard, type Card, type LevelRank } from './cards';

export function countWildcards(cards: readonly Card[], levelRank: LevelRank): number {
  return cards.filter((card) => isHeartLevelWildcard(card, levelRank)).length;
}
