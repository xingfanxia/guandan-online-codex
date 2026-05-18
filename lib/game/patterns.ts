import {
  NATURAL_RANKS,
  isHeartLevelWildcard,
  isNaturalRank,
  naturalRankValue,
  rankValue,
  type Card,
  type LevelRank,
  type NaturalRank,
  type Rank,
} from './cards';
import { bombPower, isBombKind } from './bomb';

export type PatternKind =
  | 'single'
  | 'pair'
  | 'triple'
  | 'fullHouse'
  | 'threePairRun'
  | 'twoTripleRun'
  | 'straight'
  | 'straightFlush'
  | 'bomb'
  | 'jokerBomb';

export interface Pattern {
  kind: PatternKind;
  length: number;
  primaryRank: Rank;
  wildcardsUsed: number;
}

type RankCounts = Map<Rank, number>;

const SEQUENCE_WINDOWS: NaturalRank[][] = [
  ['A', '2', '3', '4', '5'],
  ['2', '3', '4', '5', '6'],
  ['3', '4', '5', '6', '7'],
  ['4', '5', '6', '7', '8'],
  ['5', '6', '7', '8', '9'],
  ['6', '7', '8', '9', '10'],
  ['7', '8', '9', '10', 'J'],
  ['8', '9', '10', 'J', 'Q'],
  ['9', '10', 'J', 'Q', 'K'],
  ['10', 'J', 'Q', 'K', 'A'],
];

const THREE_GROUP_WINDOWS: NaturalRank[][] = [
  ['A', '2', '3'],
  ['2', '3', '4'],
  ['3', '4', '5'],
  ['4', '5', '6'],
  ['5', '6', '7'],
  ['6', '7', '8'],
  ['7', '8', '9'],
  ['8', '9', '10'],
  ['9', '10', 'J'],
  ['10', 'J', 'Q'],
  ['J', 'Q', 'K'],
  ['Q', 'K', 'A'],
];

const TWO_GROUP_WINDOWS: NaturalRank[][] = [
  ['A', '2'],
  ['2', '3'],
  ['3', '4'],
  ['4', '5'],
  ['5', '6'],
  ['6', '7'],
  ['7', '8'],
  ['8', '9'],
  ['9', '10'],
  ['10', 'J'],
  ['J', 'Q'],
  ['Q', 'K'],
  ['K', 'A'],
];

export function analyzeHand(cards: readonly Card[], levelRank: LevelRank): Pattern | null {
  if (cards.length === 0) return null;

  const wildcards = cards.filter((card) => isHeartLevelWildcard(card, levelRank));
  const nonWildcards = cards.filter((card) => !isHeartLevelWildcard(card, levelRank));
  const wildcardCount = wildcards.length;
  const counts = countRanks(nonWildcards);

  if (cards.length === 1) {
    return { kind: 'single', length: 1, primaryRank: cards[0]!.rank, wildcardsUsed: 0 };
  }

  const jokerBomb = analyzeJokerBomb(cards);
  if (jokerBomb) return jokerBomb;

  const bomb = analyzeSameRankBomb(cards.length, counts, wildcardCount);
  if (bomb) return bomb;

  const straightFlush = analyzeStraightFlush(nonWildcards, wildcardCount, cards.length);
  if (straightFlush) return straightFlush;

  if (cards.length === 2) {
    return analyzeSameRank('pair', counts, wildcardCount, 2, levelRank);
  }
  if (cards.length === 3) {
    return analyzeSameRank('triple', counts, wildcardCount, 3, levelRank);
  }
  if (cards.length === 5) {
    return analyzeFullHouse(counts, wildcardCount) ?? analyzeStraight(counts, wildcardCount);
  }
  if (cards.length === 6) {
    return analyzeGroupedRun('threePairRun', counts, wildcardCount, THREE_GROUP_WINDOWS, 2)
      ?? analyzeGroupedRun('twoTripleRun', counts, wildcardCount, TWO_GROUP_WINDOWS, 3);
  }

  return null;
}

export function canBeat(challenger: Pattern, target: Pattern, levelRank: LevelRank): boolean {
  const challengerIsBomb = isBombKind(challenger);
  const targetIsBomb = isBombKind(target);

  if (challengerIsBomb) {
    if (!targetIsBomb) return true;
    const powerDiff = bombPower(challenger) - bombPower(target);
    if (powerDiff !== 0) return powerDiff > 0;
    return comparisonValue(challenger, levelRank) > comparisonValue(target, levelRank);
  }

  if (targetIsBomb) return false;
  if (challenger.kind !== target.kind || challenger.length !== target.length) return false;
  return comparisonValue(challenger, levelRank) > comparisonValue(target, levelRank);
}

function countRanks(cards: readonly Card[]): RankCounts {
  const counts: RankCounts = new Map();
  for (const card of cards) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }
  return counts;
}

function analyzeJokerBomb(cards: readonly Card[]): Pattern | null {
  if (cards.length !== 4) return null;
  const counts = countRanks(cards);
  if ((counts.get('BJ') ?? 0) === 2 && (counts.get('RJ') ?? 0) === 2) {
    return { kind: 'jokerBomb', length: 4, primaryRank: 'RJ', wildcardsUsed: 0 };
  }
  return null;
}

function analyzeSameRankBomb(length: number, counts: RankCounts, wildcardCount: number): Pattern | null {
  if (length < 4 || length > 8) return null;
  const naturalRanks = [...counts.keys()].filter(isNaturalRank);
  const jokerCount = (counts.get('BJ') ?? 0) + (counts.get('RJ') ?? 0);
  if (jokerCount > 0 || naturalRanks.length !== 1) return null;
  const rank = naturalRanks[0]!;
  if ((counts.get(rank) ?? 0) + wildcardCount !== length) return null;
  return { kind: 'bomb', length, primaryRank: rank, wildcardsUsed: wildcardCount };
}

function analyzeSameRank(
  kind: 'pair' | 'triple',
  counts: RankCounts,
  wildcardCount: number,
  length: number,
  levelRank: LevelRank,
): Pattern | null {
  if (hasMixedJokers(counts)) return null;
  if (counts.size === 0 && wildcardCount === length) {
    return { kind, length, primaryRank: levelRank, wildcardsUsed: 0 };
  }

  for (const rank of [...counts.keys()].sort(rankSortDesc)) {
    const count = counts.get(rank) ?? 0;
    if (!isNaturalRank(rank) && wildcardCount > 0) continue;
    if (count + wildcardCount === length) {
      return { kind, length, primaryRank: rank, wildcardsUsed: wildcardCount };
    }
  }

  return null;
}

function analyzeFullHouse(counts: RankCounts, wildcardCount: number): Pattern | null {
  if ([...counts.keys()].some((rank) => !isNaturalRank(rank))) return null;

  let best: Pattern | null = null;
  for (const tripleRank of NATURAL_RANKS) {
    for (const pairRank of NATURAL_RANKS) {
      if (pairRank === tripleRank) continue;
      const tripleNeed = Math.max(0, 3 - (counts.get(tripleRank) ?? 0));
      const pairNeed = Math.max(0, 2 - (counts.get(pairRank) ?? 0));
      const usedCards = Math.min(3, counts.get(tripleRank) ?? 0) + Math.min(2, counts.get(pairRank) ?? 0);
      if (tripleNeed + pairNeed === wildcardCount && usedCards + wildcardCount === 5) {
        const candidate: Pattern = { kind: 'fullHouse', length: 5, primaryRank: tripleRank, wildcardsUsed: wildcardCount };
        if (!best || naturalRankValue(candidate.primaryRank as NaturalRank) > naturalRankValue(best.primaryRank as NaturalRank)) {
          best = candidate;
        }
      }
    }
  }
  return best;
}

function analyzeStraight(counts: RankCounts, wildcardCount: number): Pattern | null {
  if ([...counts.keys()].some((rank) => !isNaturalRank(rank))) return null;
  return bestSequence(SEQUENCE_WINDOWS, counts, wildcardCount, 1, 'straight');
}

function analyzeStraightFlush(nonWildcards: readonly Card[], wildcardCount: number, length: number): Pattern | null {
  if (length !== 5) return null;
  if (nonWildcards.some((card) => !isNaturalRank(card.rank))) return null;

  const suits = new Set(nonWildcards.map((card) => card.suit));
  if (suits.size > 1) return null;
  const counts = countRanks(nonWildcards);
  return bestSequence(SEQUENCE_WINDOWS, counts, wildcardCount, 1, 'straightFlush');
}

function analyzeGroupedRun(
  kind: 'threePairRun' | 'twoTripleRun',
  counts: RankCounts,
  wildcardCount: number,
  windows: NaturalRank[][],
  groupSize: number,
): Pattern | null {
  if ([...counts.keys()].some((rank) => !isNaturalRank(rank))) return null;
  return bestSequence(windows, counts, wildcardCount, groupSize, kind);
}

function bestSequence(
  windows: NaturalRank[][],
  counts: RankCounts,
  wildcardCount: number,
  groupSize: number,
  kind: 'straight' | 'straightFlush' | 'threePairRun' | 'twoTripleRun',
): Pattern | null {
  let best: Pattern | null = null;

  for (const window of windows) {
    const allowed = new Set<NaturalRank>(window);
    let wildcardsNeeded = 0;
    let cardsUsed = 0;
    let invalid = false;

    for (const [rank, count] of counts.entries()) {
      if (!isNaturalRank(rank) || !allowed.has(rank) || count > groupSize) {
        invalid = true;
        break;
      }
      cardsUsed += count;
    }
    if (invalid) continue;

    for (const rank of window) {
      wildcardsNeeded += Math.max(0, groupSize - (counts.get(rank) ?? 0));
    }

    if (wildcardsNeeded !== wildcardCount) continue;
    if (cardsUsed + wildcardCount !== window.length * groupSize) continue;

    const primaryRank = window[window.length - 1]!;
    const candidate: Pattern = {
      kind,
      length: window.length * groupSize,
      primaryRank,
      wildcardsUsed: wildcardCount,
    };
    if (!best || sequenceRankValue(candidate.primaryRank as NaturalRank) > sequenceRankValue(best.primaryRank as NaturalRank)) {
      best = candidate;
    }
  }

  return best;
}

function hasMixedJokers(counts: RankCounts): boolean {
  return (counts.get('BJ') ?? 0) > 0 && (counts.get('RJ') ?? 0) > 0;
}

function rankSortDesc(a: Rank, b: Rank): number {
  return rawRankValue(b) - rawRankValue(a);
}

function rawRankValue(rank: Rank): number {
  if (rank === 'RJ') return 100;
  if (rank === 'BJ') return 99;
  return naturalRankValue(rank);
}

function sequenceRankValue(rank: NaturalRank): number {
  return rank === 'A' ? 14 : naturalRankValue(rank);
}

function comparisonValue(pattern: Pattern, levelRank: LevelRank): number {
  if (pattern.kind === 'straight' || pattern.kind === 'threePairRun' || pattern.kind === 'twoTripleRun') {
    return sequenceRankValue(pattern.primaryRank as NaturalRank);
  }
  if (pattern.kind === 'straightFlush') {
    return sequenceRankValue(pattern.primaryRank as NaturalRank);
  }
  return rankValue(pattern.primaryRank, levelRank);
}
