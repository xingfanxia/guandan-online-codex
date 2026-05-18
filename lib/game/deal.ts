import type { Card } from './cards';
import type { GameMode } from './mode';
import type { Player, PlayerId } from './state';

export interface DealResult {
  hands: Record<PlayerId, Card[]>;
  undealt: Card[];
}

export function handSizeForMode(mode: GameMode): number {
  if (mode === '4') return 27;
  if (mode === '6') return 18;
  return 13;
}

export function dealCards(mode: GameMode, players: readonly Player[], deck: readonly Card[]): DealResult {
  const handSize = handSizeForMode(mode);
  const hands: Record<PlayerId, Card[]> = Object.fromEntries(players.map((player) => [player.id, []]));
  const dealCount = handSize * players.length;

  for (let i = 0; i < dealCount; i++) {
    const player = players[i % players.length]!;
    hands[player.id]!.push({ ...deck[i]! });
  }

  return {
    hands,
    undealt: deck.slice(dealCount).map((card) => ({ ...card })),
  };
}
