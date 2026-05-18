import {
  NATURAL_RANKS,
  SUITS,
  cardKey,
  isHeartLevelWildcard,
  rankValue,
  type Card,
  type LevelRank,
  type NaturalRank,
  type Rank,
} from '../game/cards';
import type { TeamKey } from '../game/mode';
import { canBeat, analyzeHand, type Pattern } from '../game/patterns';
import type { PlayedCards, Player, PlayerId, PlayingState } from '../game/state';

export type LegalMove =
  | { type: 'pass' }
  | { type: 'play'; cards: Card[]; pattern: Pattern };

export interface PlayerView {
  playerId: PlayerId;
  team: TeamKey;
  levelRank: LevelRank;
  players: Player[];
  hand: Card[];
  handCounts: Record<PlayerId, number>;
  teamByPlayer: Record<PlayerId, TeamKey>;
  currentTurn: PlayerId;
  currentPlay?: PlayedCards;
}

const BOMB_SIZES = [4, 5, 6, 7, 8] as const;
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
const THREE_PAIR_WINDOWS: NaturalRank[][] = [
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
const TWO_TRIPLE_WINDOWS: NaturalRank[][] = [
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

export function buildPlayerView(state: PlayingState, playerId: PlayerId): PlayerView {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error('ERR_UNKNOWN_PLAYER');

  return {
    playerId,
    team: player.team,
    levelRank: state.levelRank,
    players: state.players.map((candidate) => ({ ...candidate })),
    hand: (state.hands[playerId] ?? []).map(cloneCard),
    handCounts: Object.fromEntries(state.players.map((candidate) => [candidate.id, state.hands[candidate.id]?.length ?? 0])),
    teamByPlayer: Object.fromEntries(state.players.map((candidate) => [candidate.id, candidate.team])),
    currentTurn: state.currentTurn,
    ...(state.currentTrick.currentPlay
      ? {
          currentPlay: {
            playerId: state.currentTrick.currentPlay.playerId,
            cards: state.currentTrick.currentPlay.cards.map(cloneCard),
            pattern: { ...state.currentTrick.currentPlay.pattern },
          },
        }
      : {}),
  };
}

export function enumerateLegalMoves(view: PlayerView): LegalMove[] {
  const target = view.currentPlay?.pattern;
  const moves: LegalMove[] = target ? [{ type: 'pass' }] : [];
  const seen = new Set<string>();

  for (const cards of candidateCardSets(view.hand, view.levelRank, target)) {
    const pattern = analyzeHand(cards, view.levelRank);
    if (!pattern) continue;
    if (target && !canBeat(pattern, target, view.levelRank)) continue;
    const key = cards.map(cardKey).sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    moves.push({ type: 'play', cards: cards.map(cloneCard), pattern });
  }

  return [moves[0]!, ...moves.slice(1).sort((a, b) => compareLegalMoves(a, b, view.levelRank))].filter(Boolean);
}

export function moveSortValue(move: LegalMove, levelRank: LevelRank): number {
  if (move.type === 'pass') return -1;
  return rankValue(move.pattern.primaryRank, levelRank) + move.cards.length * 0.01 + patternPriority(move.pattern);
}

export function removeCardsFromHand(hand: readonly Card[], cards: readonly Card[]): Card[] {
  const remaining = hand.map(cloneCard);
  for (const card of cards) {
    const index = remaining.findIndex((candidate) => cardKey(candidate) === cardKey(card));
    if (index < 0) throw new Error('ERR_CARD_NOT_IN_HAND');
    remaining.splice(index, 1);
  }
  return remaining;
}

function candidateCardSets(hand: readonly Card[], levelRank: LevelRank, target?: Pattern): Card[][] {
  const candidates: Card[][] = [];
  const kinds = target ? new Set([target.kind, 'bomb', 'straightFlush', 'jokerBomb']) : null;

  if (!kinds || kinds.has('single')) candidates.push(...hand.map((card) => [cloneCard(card)]));
  if (!kinds || kinds.has('pair')) candidates.push(...sameRankSets(hand, levelRank, 2, target?.length));
  if (!kinds || kinds.has('triple')) candidates.push(...sameRankSets(hand, levelRank, 3, target?.length));
  if (!kinds || kinds.has('bomb')) {
    for (const size of BOMB_SIZES) candidates.push(...sameRankSets(hand, levelRank, size));
  }
  if (!kinds || kinds.has('jokerBomb')) candidates.push(...jokerBombs(hand));
  if (!kinds || kinds.has('fullHouse')) candidates.push(...fullHouses(hand, levelRank));
  if (!kinds || kinds.has('straight')) candidates.push(...sequences(hand, levelRank, 1, SEQUENCE_WINDOWS));
  if (!kinds || kinds.has('straightFlush')) candidates.push(...straightFlushes(hand, levelRank));
  if (!kinds || kinds.has('threePairRun')) candidates.push(...sequences(hand, levelRank, 2, THREE_PAIR_WINDOWS));
  if (!kinds || kinds.has('twoTripleRun')) candidates.push(...sequences(hand, levelRank, 3, TWO_TRIPLE_WINDOWS));

  return candidates;
}

function combinations(cards: readonly Card[], size: number): Card[][] {
  if (size <= 0 || size > cards.length) return [];
  const result: Card[][] = [];
  const path: Card[] = [];

  function visit(start: number): void {
    if (path.length === size) {
      result.push(path.map(cloneCard));
      return;
    }
    const remainingSlots = size - path.length;
    for (let index = start; index <= cards.length - remainingSlots; index++) {
      path.push(cards[index]!);
      visit(index + 1);
      path.pop();
    }
  }

  visit(0);
  return result;
}

function sameRankSets(hand: readonly Card[], levelRank: LevelRank, size: number, requiredLength = size): Card[][] {
  if (size !== requiredLength) return [];
  const wildcards = hand.filter((card) => isHeartLevelWildcard(card, levelRank));
  const nonWildcards = hand.filter((card) => !wildcards.some((wildcard) => cardKey(wildcard) === cardKey(card)));
  const candidates: Card[][] = [];
  for (const rank of [...NATURAL_RANKS, 'BJ', 'RJ'] as Rank[]) {
    const rankCards = nonWildcards.filter((card) => card.rank === rank);
    const availableWildcards = rank === 'BJ' || rank === 'RJ' ? [] : wildcards;
    if (rankCards.length + availableWildcards.length < size) continue;
    const naturalTake = Math.min(rankCards.length, size);
    const cards = [...rankCards.slice(0, naturalTake), ...availableWildcards.slice(0, size - naturalTake)];
    if (cards.length === size) candidates.push(cards.map(cloneCard));
    if (rankCards.length >= size) {
      for (const combo of combinations(rankCards, size).slice(1)) candidates.push(combo);
    }
  }
  return candidates;
}

function jokerBombs(hand: readonly Card[]): Card[][] {
  const black = hand.filter((card) => card.rank === 'BJ');
  const red = hand.filter((card) => card.rank === 'RJ');
  if (black.length < 2 || red.length < 2) return [];
  return [[black[0]!, black[1]!, red[0]!, red[1]!].map(cloneCard)];
}

function fullHouses(hand: readonly Card[], levelRank: LevelRank): Card[][] {
  const candidates: Card[][] = [];
  const triples = sameRankSets(hand, levelRank, 3);
  const pairs = sameRankSets(hand, levelRank, 2);
  for (const triple of triples) {
    for (const pair of pairs) {
      const cards = [...triple, ...pair];
      if (new Set(cards.map(cardKey)).size !== 5) continue;
      candidates.push(cards.map(cloneCard));
    }
  }
  return candidates;
}

function sequences(hand: readonly Card[], levelRank: LevelRank, groupSize: 1 | 2 | 3, windows: readonly NaturalRank[][]): Card[][] {
  return windows.flatMap((window) => {
    const candidate = sequenceCandidate(hand, levelRank, window, groupSize);
    return candidate ? [candidate] : [];
  });
}

function straightFlushes(hand: readonly Card[], levelRank: LevelRank): Card[][] {
  return SUITS.flatMap((suit) => (
    SEQUENCE_WINDOWS.flatMap((window) => {
      const candidate = sequenceCandidate(hand, levelRank, window, 1, suit);
      return candidate ? [candidate] : [];
    })
  ));
}

function sequenceCandidate(
  hand: readonly Card[],
  levelRank: LevelRank,
  window: readonly NaturalRank[],
  groupSize: 1 | 2 | 3,
  suit?: Card['suit'],
): Card[] | null {
  const wildcards = hand.filter((card) => isHeartLevelWildcard(card, levelRank));
  const usedWildcards: Card[] = [];
  const cards: Card[] = [];

  for (const rank of window) {
    const rankCards = hand.filter((card) => (
      card.rank === rank
      && !isHeartLevelWildcard(card, levelRank)
      && (!suit || card.suit === suit)
    ));
    cards.push(...rankCards.slice(0, groupSize).map(cloneCard));
    const missing = groupSize - Math.min(rankCards.length, groupSize);
    if (missing > 0) {
      const available = wildcards.filter((card) => !usedWildcards.some((used) => cardKey(used) === cardKey(card)));
      if (available.length < missing) return null;
      usedWildcards.push(...available.slice(0, missing));
      cards.push(...available.slice(0, missing).map(cloneCard));
    }
  }

  return cards.length === window.length * groupSize ? cards : null;
}

function compareLegalMoves(a: LegalMove, b: LegalMove, levelRank: LevelRank): number {
  return moveSortValue(a, levelRank) - moveSortValue(b, levelRank);
}

function patternPriority(pattern: Pattern): number {
  switch (pattern.kind) {
    case 'single':
      return 0;
    case 'pair':
      return 10;
    case 'triple':
      return 20;
    case 'fullHouse':
      return 30;
    case 'straight':
      return 40;
    case 'threePairRun':
      return 50;
    case 'twoTripleRun':
      return 60;
    case 'straightFlush':
      return 100;
    case 'bomb':
      return 200 + pattern.length;
    case 'jokerBomb':
      return 400;
  }
}

function cloneCard(card: Card): Card {
  return { ...card };
}
