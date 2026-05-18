import type { Card } from './cards.js';
import type { GameMode } from './mode.js';
import type { Player, PlayerId } from './state.js';

export interface DealResult {
  hands: Record<PlayerId, Card[]>;
  undealt: Card[];
}

export function handSizeForMode(mode: GameMode): number {
  if (mode === '4' || mode === '6' || mode === '8') return 27;
  return assertNever(mode);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled game mode: ${value}`);
}

function assertCard(card: Card | undefined): Card {
  if (!card) throw new Error('ERR_NOT_ENOUGH_CARDS');
  return card;
}

export function dealCards(mode: GameMode, players: readonly Player[], deck: readonly Card[]): DealResult {
  const handSize = handSizeForMode(mode);
  const hands: Record<PlayerId, Card[]> = Object.fromEntries(players.map((player) => [player.id, []]));
  const dealCount = handSize * players.length;
  if (deck.length < dealCount) throw new Error('ERR_NOT_ENOUGH_CARDS');

  for (let i = 0; i < dealCount; i++) {
    const player = players[i % players.length]!;
    hands[player.id]!.push({ ...assertCard(deck[i]) });
  }

  return {
    hands,
    undealt: deck.slice(dealCount).map((card) => ({ ...card })),
  };
}
