import { buildEventSourceUrl, buildPollUrl, RealtimeCursor } from '../../../lib/client/realtime';
import type { ClientPayload } from '../../../lib/realtime/payload';

export interface GameEventSource {
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onerror: ((event: Event) => void) | null;
  close(): void;
}

export type GameEventSourceCtor = new (url: string) => GameEventSource;

export type GameStreamError =
  | { type: 'parse'; error: unknown }
  | { type: 'connection' };

export interface ConnectGameStreamInput {
  baseUrl: string;
  roomId: string;
  playerId: string;
  token?: string;
  lastEventId?: string;
  EventSourceCtor?: GameEventSourceCtor;
  onPayload: (payload: ClientPayload) => void;
  onError?: (error: GameStreamError) => void;
}

export interface GameStreamConnection {
  close(): void;
  lastEventId(): string | undefined;
}

export interface PollGameEventsInput {
  baseUrl: string;
  roomId: string;
  playerId: string;
  token?: string;
  lastEventId?: string;
  fetcher?: typeof fetch;
}

export type PollGameEventsResult =
  | { ok: true; payloads: ClientPayload[]; cursor?: string }
  | { ok: false; error: string };

export function connectGameStream({
  baseUrl,
  roomId,
  playerId,
  token,
  lastEventId,
  EventSourceCtor = globalThis.EventSource,
  onPayload,
  onError,
}: ConnectGameStreamInput): GameStreamConnection {
  if (!EventSourceCtor) throw new Error('ERR_EVENT_SOURCE_UNAVAILABLE');
  const cursor = new RealtimeCursor();
  if (lastEventId) cursor.record({ lastEventId });
  const source = new EventSourceCtor(buildEventSourceUrl({
    baseUrl,
    roomId,
    playerId,
    ...(token ? { token } : {}),
    ...(lastEventId ? { lastEventId } : {}),
  }));

  source.onmessage = (event) => {
    cursor.record({ lastEventId: event.lastEventId });
    try {
      onPayload(JSON.parse(event.data) as ClientPayload);
    } catch (error) {
      onError?.({ type: 'parse', error });
    }
  };
  source.onerror = () => {
    onError?.({ type: 'connection' });
  };

  return {
    close() {
      source.close();
    },
    lastEventId() {
      return cursor.lastEventId;
    },
  };
}

export async function pollGameEvents({
  baseUrl,
  roomId,
  playerId,
  token,
  lastEventId,
  fetcher = fetch,
}: PollGameEventsInput): Promise<PollGameEventsResult> {
  const response = await fetcher(buildPollUrl({
    baseUrl,
    roomId,
    playerId,
    ...(token ? { token } : {}),
    ...(lastEventId ? { lastEventId } : {}),
  }));
  const body = await response.json() as
    | { ok: true; cursor?: string; events: Array<{ id: string; payload: ClientPayload }> }
    | { ok: false; error: string };
  if (!body.ok) return body;
  return {
    ok: true,
    ...(body.cursor ? { cursor: body.cursor } : {}),
    payloads: body.events.map((event) => event.payload),
  };
}
