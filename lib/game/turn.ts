import type { Player, PlayerId } from './state';
import type { TeamKey } from './mode';

export function teamOf(players: readonly Player[], playerId: PlayerId): TeamKey | undefined {
  return players.find((player) => player.id === playerId)?.team;
}

export function partnerOf(players: readonly Player[], playerId: PlayerId): PlayerId | undefined {
  const player = players.find((candidate) => candidate.id === playerId);
  if (!player) return undefined;
  return players.find((candidate) => candidate.id !== playerId && candidate.team === player.team)?.id;
}

export function nextActivePlayer(
  players: readonly Player[],
  currentPlayerId: PlayerId,
  activePlayerIds: ReadonlySet<PlayerId>,
): PlayerId {
  if (activePlayerIds.size === 0) {
    throw new Error('nextActivePlayer requires at least one active player');
  }

  const currentIndex = Math.max(0, players.findIndex((player) => player.id === currentPlayerId));
  for (let offset = 1; offset <= players.length; offset++) {
    const candidate = players[(currentIndex + offset) % players.length]!;
    if (activePlayerIds.has(candidate.id)) return candidate.id;
  }

  throw new Error('No active player found');
}
