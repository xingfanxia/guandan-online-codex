import type { PlayerId } from '../game/state';
import type { ClientPayload } from './payload';

type MaybePromise<T> = T | Promise<T>;

export interface LoggedEvent {
  id: string;
  payload: ClientPayload;
}

export interface EventLog {
  append(roomId: string, playerId: PlayerId, payload: ClientPayload): MaybePromise<LoggedEvent>;
  replayAfter(roomId: string, playerId: PlayerId, lastEventId?: string): MaybePromise<LoggedEvent[]>;
}

export function playerEventStream(roomId: string, playerId: PlayerId): string {
  return `game:${roomId}:events:${playerId}`;
}

export class MemoryEventLog implements EventLog {
  private readonly streams = new Map<string, LoggedEvent[]>();
  private sequence = 0;
  private readonly maxLength: number;

  constructor({ maxLength = 1_000 }: { maxLength?: number } = {}) {
    this.maxLength = maxLength;
  }

  append(roomId: string, playerId: PlayerId, payload: ClientPayload): LoggedEvent {
    const stream = playerEventStream(roomId, playerId);
    const events = this.streams.get(stream) ?? [];
    const logged = {
      id: `${++this.sequence}-0`,
      payload: clonePayload(payload),
    };
    events.push(logged);
    this.streams.set(stream, events.slice(-this.maxLength));
    return logged;
  }

  replayAfter(roomId: string, playerId: PlayerId, lastEventId?: string): LoggedEvent[] {
    const stream = playerEventStream(roomId, playerId);
    const events = this.streams.get(stream) ?? [];
    if (!lastEventId) return events.map(cloneLoggedEvent);
    return events.filter((event) => compareEventIds(event.id, lastEventId) > 0).map(cloneLoggedEvent);
  }
}

function compareEventIds(a: string, b: string): number {
  return eventSequence(a) - eventSequence(b);
}

function eventSequence(id: string): number {
  return Number(id.split('-')[0] ?? 0);
}

function cloneLoggedEvent(event: LoggedEvent): LoggedEvent {
  return {
    id: event.id,
    payload: clonePayload(event.payload),
  };
}

function clonePayload(payload: ClientPayload): ClientPayload {
  return JSON.parse(JSON.stringify(payload)) as ClientPayload;
}
