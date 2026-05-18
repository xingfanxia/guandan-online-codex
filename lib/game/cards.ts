export const NATURAL_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
export const SUITS = ['spades', 'hearts', 'clubs', 'diamonds'] as const;

export type NaturalRank = (typeof NATURAL_RANKS)[number];
export type JokerRank = 'BJ' | 'RJ';
export type Rank = NaturalRank | JokerRank;
export type Suit = (typeof SUITS)[number] | 'joker';
export type LevelRank = NaturalRank;

export interface Card {
  rank: Rank;
  suit: Suit;
  deck: number;
}

const BASE_RANK_VALUE: Record<NaturalRank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

export function isNaturalRank(rank: Rank): rank is NaturalRank {
  return rank !== 'BJ' && rank !== 'RJ';
}

export function generateDecks(deckCount: number): Card[] {
  if (!Number.isInteger(deckCount) || deckCount < 1) throw new Error('ERR_INVALID_DECK_COUNT');
  const deck: Card[] = [];
  for (let deckNo = 1; deckNo <= deckCount; deckNo++) {
    for (const suit of SUITS) {
      for (const rank of NATURAL_RANKS) {
        deck.push({ rank, suit, deck: deckNo });
      }
    }
    deck.push({ rank: 'BJ', suit: 'joker', deck: deckNo });
    deck.push({ rank: 'RJ', suit: 'joker', deck: deckNo });
  }
  return deck;
}

export function generateDoubleDeck(): Card[] {
  return generateDecks(2);
}

export function deckCountForMode(mode: import('./mode.js').GameMode): number {
  return Number(mode) / 2;
}

export function generateDeckForMode(mode: import('./mode.js').GameMode): Card[] {
  return generateDecks(deckCountForMode(mode));
}

export function cardKey(card: Card): string {
  return `${card.deck}:${card.suit}:${card.rank}`;
}

export function isHeartLevelWildcard(card: Card, levelRank: LevelRank): boolean {
  return card.suit === 'hearts' && card.rank === levelRank;
}

export function rankValue(rank: Rank, levelRank: LevelRank): number {
  if (rank === 'RJ') return 100;
  if (rank === 'BJ') return 99;
  if (rank === levelRank) return 90;
  return BASE_RANK_VALUE[rank];
}

export function naturalRankValue(rank: NaturalRank): number {
  return BASE_RANK_VALUE[rank];
}

export function compareCardRanks(a: Rank, b: Rank, levelRank: LevelRank): number {
  return rankValue(a, levelRank) - rankValue(b, levelRank);
}

export function shuffleDeck(deck: readonly Card[], random: () => number = Math.random): Card[] {
  const shuffled = deck.map((card) => ({ ...card }));
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const current = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = current;
  }
  return shuffled;
}
