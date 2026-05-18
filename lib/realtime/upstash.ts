import type { GameState, PlayerId } from '../game/state.js';
import type { ServerEvent } from './messages.js';
import { buildClientPayload } from './payload.js';

export interface RealtimePublisher {
  publish(channel: string, payload: string): Promise<void>;
}

export function playerChannel(roomId: string, playerId: PlayerId): string {
  return `game:${roomId}:player:${playerId}`;
}

export async function publishToPlayer(
  publisher: RealtimePublisher,
  roomId: string,
  playerId: PlayerId,
  event: ServerEvent,
  fullState: GameState,
): Promise<void> {
  const payload = buildClientPayload(playerId, event, fullState);
  await publisher.publish(playerChannel(roomId, playerId), JSON.stringify(payload));
}
