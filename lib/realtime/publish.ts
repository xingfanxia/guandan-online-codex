import type { GameState, PlayerId } from '../game/state.js';
import type { EventLog, LoggedEvent } from './eventLog.js';
import type { ServerEvent } from './messages.js';
import { buildClientPayload } from './payload.js';
import { playerChannel, type RealtimePublisher } from './upstash.js';

export interface PublishDeps {
  eventLog: EventLog;
  publisher: RealtimePublisher;
}

export interface PublishedPlayerEvent {
  playerId: PlayerId;
  event: LoggedEvent;
  type: ServerEvent['type'];
}

export async function publishEventsToPlayers(
  deps: PublishDeps,
  roomId: string,
  state: GameState,
  events: readonly ServerEvent[],
): Promise<PublishedPlayerEvent[]> {
  const logged: PublishedPlayerEvent[] = [];
  for (const event of events) {
    for (const player of state.players) {
      const payload = buildClientPayload(player.id, event, state);
      const loggedEvent = await deps.eventLog.append(roomId, player.id, payload);
      logged.push({ playerId: player.id, event: loggedEvent, type: event.type });
      await deps.publisher.publish(playerChannel(roomId, player.id), JSON.stringify(payload));
    }
  }
  return logged;
}
