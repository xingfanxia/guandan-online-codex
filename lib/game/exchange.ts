import { cardKey, naturalRankValue, type Card, type Rank } from './cards.js';
import type { PlayerId } from './state.js';

export type ExchangeVoteChoice = 'yes' | 'no';
export type ExchangeVoteThreshold = 'majority' | 'unanimous';
export type ExchangeDirection = 'clockwise' | 'counterclockwise';

export interface ExchangeVoteResult {
  passed: boolean;
  yes: number;
  no: number;
  required: number;
}

export interface ApplyCardExchangeInput {
  playerOrder: PlayerId[];
  hands: Record<PlayerId, Card[]>;
  selections: Record<PlayerId, Card[]>;
  direction: ExchangeDirection;
  cardCount: number;
}

export interface ApplyCardExchangeResult {
  hands: Record<PlayerId, Card[]>;
  received: Record<PlayerId, Card[]>;
}

export function resolveExchangeVote({
  eligibleVoters,
  votes,
  threshold,
}: {
  eligibleVoters: readonly PlayerId[];
  votes: Partial<Record<PlayerId, ExchangeVoteChoice>>;
  threshold: ExchangeVoteThreshold;
}): ExchangeVoteResult {
  const yes = eligibleVoters.filter((playerId) => votes[playerId] === 'yes').length;
  const no = eligibleVoters.filter((playerId) => votes[playerId] === 'no').length;
  const required = threshold === 'unanimous'
    ? eligibleVoters.length
    : Math.floor(eligibleVoters.length / 2) + 1;
  return {
    passed: yes >= required,
    yes,
    no,
    required,
  };
}

export function pickExchangeDirection(random: () => number = Math.random): ExchangeDirection {
  return random() < 0.5 ? 'clockwise' : 'counterclockwise';
}

export function autoPickExchangeCards(hand: readonly Card[], cardCount: number): Card[] {
  if (hand.length < cardCount) throw new Error('ERR_NOT_ENOUGH_CARDS');
  return hand.slice().sort(compareExchangeCards).slice(0, cardCount).map(cloneCard);
}

export function validateExchangeSelection(selection: readonly Card[], hand: readonly Card[], cardCount: number): boolean {
  if (selection.length !== cardCount) return false;
  const seen = new Set<string>();
  for (const card of selection) {
    const key = cardKey(card);
    if (seen.has(key) || !hand.some((held) => cardKey(held) === key)) return false;
    seen.add(key);
  }
  return true;
}

export function applyCardExchange({
  playerOrder,
  hands,
  selections,
  direction,
  cardCount,
}: ApplyCardExchangeInput): ApplyCardExchangeResult {
  const received: Record<PlayerId, Card[]> = Object.fromEntries(playerOrder.map((playerId) => [playerId, []]));
  const nextHands: Record<PlayerId, Card[]> = Object.fromEntries(
    playerOrder.map((playerId) => {
      const hand = hands[playerId];
      const selection = selections[playerId];
      if (!hand || !selection) throw new Error('ERR_MISSING_EXCHANGE_SELECTION');
      if (!validateExchangeSelection(selection, hand, cardCount)) throw new Error('ERR_INVALID_EXCHANGE_SELECTION');
      return [playerId, removeCards(hand, selection)];
    }),
  );

  for (const [index, playerId] of playerOrder.entries()) {
    const target = playerOrder[targetIndex(index, playerOrder.length, direction)]!;
    const sent = selections[playerId]!.map(cloneCard);
    received[target] = sent;
    nextHands[target] = [...nextHands[target]!, ...sent];
  }

  return { hands: nextHands, received };
}

function targetIndex(index: number, length: number, direction: ExchangeDirection): number {
  return direction === 'clockwise'
    ? (index + 1) % length
    : (index - 1 + length) % length;
}

function compareExchangeCards(a: Card, b: Card): number {
  const rank = exchangeRankValue(a.rank) - exchangeRankValue(b.rank);
  if (rank !== 0) return rank;
  return suitOrder(a) - suitOrder(b);
}

function exchangeRankValue(rank: Rank): number {
  if (rank === 'BJ') return 99;
  if (rank === 'RJ') return 100;
  return naturalRankValue(rank);
}

function suitOrder(card: Card): number {
  switch (card.suit) {
    case 'hearts':
      return 1;
    case 'diamonds':
      return 2;
    case 'clubs':
      return 3;
    case 'spades':
      return 4;
    case 'joker':
      return card.rank === 'BJ' ? 5 : 6;
  }
}

function removeCards(hand: readonly Card[], cards: readonly Card[]): Card[] {
  const remaining = hand.map(cloneCard);
  for (const card of cards) {
    const index = remaining.findIndex((held) => cardKey(held) === cardKey(card));
    if (index < 0) throw new Error('ERR_CARD_NOT_IN_HAND');
    remaining.splice(index, 1);
  }
  return remaining;
}

function cloneCard(card: Card): Card {
  return { ...card };
}
