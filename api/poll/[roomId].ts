import { universalHandler, roomIdParams } from '../_node.js';
import { defaultRealtimePersistence } from '../../lib/realtime/defaults.js';
import type { EventLog, LoggedEvent } from '../../lib/realtime/eventLog.js';
import { defaultRoomStore } from '../../lib/room/defaultStore.js';
import { markRoomPlayerSeen } from '../../lib/room/dcDetection.js';
import type { RoomStore } from '../../lib/room/lifecycle.js';
import { authorizeRoomPlayer } from '../../lib/room/playerAuth.js';

export interface PollRouteParams {
  roomId: string;
}

export interface PollHandlerDeps {
  eventLog: EventLog;
  roomStore?: RoomStore;
  nowIso?: () => string;
  nowMs?: () => number;
  sleep?: (ms: number) => Promise<void>;
  maxDurationMs?: number;
  pollMs?: number;
}

export interface PollResponse {
  ok: true;
  events: Array<{ id: string; payload: LoggedEvent['payload'] }>;
  cursor?: string;
}

export function createPollHandler(deps: PollHandlerDeps): (request: Request, params: PollRouteParams) => Promise<Response> {
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const nowMs = deps.nowMs ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const maxDurationMs = deps.maxDurationMs ?? 25_000;
  const pollMs = deps.pollMs ?? 250;

  return async function handlePoll(request: Request, params: PollRouteParams): Promise<Response> {
    if (request.method !== 'GET') return json({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' }, 405);

    const url = new URL(request.url);
    const playerId = url.searchParams.get('playerId');
    if (!playerId) return json({ ok: false, error: 'ERR_MISSING_PLAYER_ID' }, 400);

    if (deps.roomStore) {
      const auth = await authorizeRoomPlayer(deps.roomStore, params.roomId, playerId, url.searchParams.get('token'));
      if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
      await markRoomPlayerSeen(deps.roomStore, params.roomId, playerId, nowIso);
    }

    let cursor = url.searchParams.get('lastEventId') ?? request.headers.get('last-event-id') ?? undefined;
    const deadline = nowMs() + maxDurationMs;
    let firstPoll = true;

    while (firstPoll || (maxDurationMs > 0 && nowMs() < deadline)) {
      firstPoll = false;
      const events = await deps.eventLog.replayAfter(params.roomId, playerId, cursor);
      if (events.length > 0) {
        cursor = events.at(-1)!.id;
        return json({
          ok: true,
          cursor,
          events: events.map((event) => ({ id: event.id, payload: event.payload })),
        } satisfies PollResponse, 200);
      }
      if (maxDurationMs <= 0) break;
      await sleep(pollMs);
    }

    return json({ ok: true, events: [] } satisfies PollResponse, 200);
  };
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const defaultHandler = createPollHandler({
  eventLog: defaultRealtimePersistence.eventLog,
  roomStore: defaultRoomStore,
});

export default universalHandler(defaultHandler, roomIdParams('roomId'));
