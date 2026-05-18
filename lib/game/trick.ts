import type { PlayerId, PlayingState } from './state';
import { nextActivePlayer, partnerOf } from './turn';

export function activePlayerIds(state: PlayingState): Set<PlayerId> {
  return new Set(
    state.players
      .filter((player) => (state.hands[player.id]?.length ?? 0) > 0)
      .map((player) => player.id),
  );
}

export function trickIsComplete(state: PlayingState): boolean {
  const currentPlay = state.currentTrick.currentPlay;
  if (!currentPlay) return false;

  const active = activePlayerIds(state);
  const requiredPassers = [...active].filter((playerId) => playerId !== currentPlay.playerId);
  return requiredPassers.every((playerId) => state.currentTrick.passes.includes(playerId));
}

export function nextLeaderAfterCompletedTrick(state: PlayingState): PlayerId {
  const currentPlay = state.currentTrick.currentPlay;
  if (!currentPlay) return state.currentTrick.leader;

  const active = activePlayerIds(state);
  if (active.has(currentPlay.playerId)) return currentPlay.playerId;

  const partner = partnerOf(state.players, currentPlay.playerId);
  if (partner && active.has(partner)) return partner;

  return nextActivePlayer(state.players, currentPlay.playerId, active);
}
