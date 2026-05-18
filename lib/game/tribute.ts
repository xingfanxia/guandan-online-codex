import {
  cardKey,
  compareCardRanks,
  isHeartLevelWildcard,
  naturalRankValue,
  type Card,
  type LevelRank,
  type NaturalRank,
  type Rank,
  type Suit,
} from './cards';
import { expectedTeamRankCount, maxRankForMode, type GameMode } from './mode';
import type { Placement, PlayerId } from './state';

export type TeamStructure = '2-teams-of-n' | 'teams-of-2';
export type TributeKind = 'none' | 'single' | 'double' | 'sweep';
export type AntiTributeCondition = 'dual_big_joker' | 'any_dual_joker' | 'disabled';
export type ReturnCardCap = 'rank_10' | 'rank_jack' | 'none';

export interface TributeObligation {
  from: PlayerId;
  to: PlayerId;
  fromPosition: number;
  toPosition: number;
}

export interface TributePlan {
  kind: TributeKind;
  firstPlacePlayerId: PlayerId;
  winnerTeam: Placement['team'];
  obligations: TributeObligation[];
}

export interface ReturnCardConfig {
  returnCardCap: ReturnCardCap;
}

export interface TributeExchange {
  from: PlayerId;
  to: PlayerId;
  tributeCard: Card;
  returnCard: Card;
}

export function computeTributePlan({
  mode,
  teamStructure,
  placements,
  tributeEnabled = true,
}: {
  mode: GameMode;
  teamStructure: TeamStructure;
  placements: readonly Placement[];
  tributeEnabled?: boolean;
}): TributePlan {
  const ordered = placements.slice().sort((a, b) => a.position - b.position);
  const first = ordered[0];
  if (!first) throw new Error('ERR_NO_PLACEMENTS');

  if (!tributeEnabled) {
    return { kind: 'none', firstPlacePlayerId: first.playerId, winnerTeam: first.team, obligations: [] };
  }

  const maxPosition = maxRankForMode(mode);
  const teamSize = expectedTeamRankCount(mode);
  const topGroup = ordered.slice(0, teamSize);
  const sweep = teamStructure === '2-teams-of-n'
    && mode !== '4'
    && topGroup.length === teamSize
    && topGroup.every((placement) => placement.team === first.team);

  if (sweep) {
    return {
      kind: 'sweep',
      firstPlacePlayerId: first.playerId,
      winnerTeam: first.team,
      obligations: Array.from({ length: teamSize }, (_, index) => {
        const fromPosition = teamSize + index + 1;
        const toPosition = teamSize - index;
        return obligation(ordered, fromPosition, toPosition);
      }),
    };
  }

  if (mode === '4') {
    const second = ordered[1];
    const doubleTribute = second?.team === first.team;
    if (doubleTribute) {
      return {
        kind: 'double',
        firstPlacePlayerId: first.playerId,
        winnerTeam: first.team,
        obligations: [obligation(ordered, 3, 2), obligation(ordered, 4, 1)],
      };
    }
  }

  return {
    kind: 'single',
    firstPlacePlayerId: first.playerId,
    winnerTeam: first.team,
    obligations: [obligation(ordered, maxPosition, 1)],
  };
}

export function checkAntiTribute(
  losingHands: readonly (readonly Card[])[],
  condition: AntiTributeCondition = 'dual_big_joker',
): { triggered: boolean; declaredByIndexes: number[] } {
  if (condition === 'disabled') return { triggered: false, declaredByIndexes: [] };
  const counts = losingHands.map((hand) => hand.filter((card) => antiTributeJoker(card, condition)).length);
  const declaredByIndexes = counts.flatMap((count, index) => (count > 0 ? [index] : []));
  return {
    triggered: counts.reduce((sum, count) => sum + count, 0) >= 2,
    declaredByIndexes,
  };
}

export function autoPickTributeCard(hand: readonly Card[], levelRank: LevelRank): Card {
  const candidates = hand.filter((card) => !isHeartLevelWildcard(card, levelRank));
  if (candidates.length === 0) throw new Error('ERR_NO_TRIBUTE_CARD');
  return candidates.slice().sort((a, b) => compareTributeCards(b, a, levelRank))[0]!;
}

export function validatePlayerTributeCard(selected: Card, hand: readonly Card[], levelRank: LevelRank): boolean {
  if (!containsCard(hand, selected) || isHeartLevelWildcard(selected, levelRank)) return false;
  const highest = autoPickTributeCard(hand, levelRank);
  return compareCardRanks(selected.rank, highest.rank, levelRank) === 0;
}

export function autoPickReturnCard(hand: readonly Card[], config: ReturnCardConfig): Card {
  if (hand.length === 0) throw new Error('ERR_NO_RETURN_CARD');
  const eligible = hand.filter((card) => canReturnCard(card, config));
  const source = eligible.length > 0 ? eligible : hand;
  return source.slice().sort(compareLowCards)[0]!;
}

export function validatePlayerReturnCard(selected: Card, hand: readonly Card[], config: ReturnCardConfig): boolean {
  if (!containsCard(hand, selected)) return false;
  const hasEligible = hand.some((card) => canReturnCard(card, config));
  return hasEligible ? canReturnCard(selected, config) : true;
}

export function applyTributeExchange(
  hands: Record<PlayerId, Card[]>,
  exchange: TributeExchange,
): Record<PlayerId, Card[]> {
  const fromHand = hands[exchange.from];
  const toHand = hands[exchange.to];
  if (!fromHand || !toHand) throw new Error('ERR_UNKNOWN_PLAYER');
  if (!containsCard(fromHand, exchange.tributeCard)) throw new Error('ERR_TRIBUTE_CARD_NOT_IN_HAND');
  if (!containsCard(toHand, exchange.returnCard)) throw new Error('ERR_RETURN_CARD_NOT_IN_HAND');

  return {
    ...cloneHands(hands),
    [exchange.from]: [...removeCard(fromHand, exchange.tributeCard), cloneCard(exchange.returnCard)],
    [exchange.to]: [...removeCard(toHand, exchange.returnCard), cloneCard(exchange.tributeCard)],
  };
}

function obligation(placements: readonly Placement[], fromPosition: number, toPosition: number): TributeObligation {
  const from = placements.find((placement) => placement.position === fromPosition);
  const to = placements.find((placement) => placement.position === toPosition);
  if (!from || !to) throw new Error('ERR_INVALID_TRIBUTE_POSITIONS');
  return {
    from: from.playerId,
    to: to.playerId,
    fromPosition,
    toPosition,
  };
}

function antiTributeJoker(card: Card, condition: AntiTributeCondition): boolean {
  if (condition === 'dual_big_joker') return card.rank === 'RJ';
  if (condition === 'any_dual_joker') return card.rank === 'RJ' || card.rank === 'BJ';
  return false;
}

function compareTributeCards(a: Card, b: Card, levelRank: LevelRank): number {
  const rank = compareCardRanks(a.rank, b.rank, levelRank);
  if (rank !== 0) return rank;
  return suitPriority(a.suit) - suitPriority(b.suit);
}

function compareLowCards(a: Card, b: Card): number {
  const rank = lowRankValue(a.rank) - lowRankValue(b.rank);
  if (rank !== 0) return rank;
  return lowSuitPriority(a.suit) - lowSuitPriority(b.suit);
}

function canReturnCard(card: Card, { returnCardCap }: ReturnCardConfig): boolean {
  if (returnCardCap === 'none') return true;
  if (card.rank === 'BJ' || card.rank === 'RJ') return false;
  const cap = returnCardCap === 'rank_jack' ? 11 : 10;
  return naturalRankValue(card.rank) <= cap;
}

function lowRankValue(rank: Rank): number {
  if (rank === 'BJ') return 99;
  if (rank === 'RJ') return 100;
  return naturalRankValue(rank);
}

function suitPriority(suit: Suit): number {
  switch (suit) {
    case 'spades':
      return 4;
    case 'clubs':
      return 3;
    case 'diamonds':
      return 2;
    case 'hearts':
      return 1;
    case 'joker':
      return 5;
  }
}

function lowSuitPriority(suit: Suit): number {
  switch (suit) {
    case 'hearts':
      return 1;
    case 'diamonds':
      return 2;
    case 'clubs':
      return 3;
    case 'spades':
      return 4;
    case 'joker':
      return 5;
  }
}

function containsCard(hand: readonly Card[], card: Card): boolean {
  return hand.some((held) => cardKey(held) === cardKey(card));
}

function removeCard(hand: readonly Card[], card: Card): Card[] {
  let removed = false;
  return hand.flatMap((held) => {
    if (!removed && cardKey(held) === cardKey(card)) {
      removed = true;
      return [];
    }
    return [cloneCard(held)];
  });
}

function cloneHands(hands: Record<PlayerId, Card[]>): Record<PlayerId, Card[]> {
  return Object.fromEntries(Object.entries(hands).map(([playerId, hand]) => [playerId, hand.map(cloneCard)]));
}

function cloneCard(card: Card): Card {
  return { ...card };
}
