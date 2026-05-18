import { universalHandler, roomCodeParams } from '../../_node.js';
import { MessageType, type ServerEvent } from '../../../lib/realtime/messages.js';
import { buildClientPayload } from '../../../lib/realtime/payload.js';
import { publishEventsToPlayers } from '../../../lib/realtime/publish.js';
import type { EventLog } from '../../../lib/realtime/eventLog.js';
import { defaultRealtimePersistence } from '../../../lib/realtime/defaults.js';
import type { GameStateStore } from '../../../lib/realtime/stateStore.js';
import type { RealtimePublisher } from '../../../lib/realtime/upstash.js';
import { reclaimBotTakeover } from '../../../lib/room/botTakeover.js';
import { defaultRoomStore } from '../../../lib/room/defaultStore.js';
import { publicRoom, type RoomStore } from '../../../lib/room/lifecycle.js';
import { authorizeRoomPlayer } from '../../../lib/room/playerAuth.js';
import { createDefaultRateLimiter, enforceRateLimit, type RequestRateLimiter } from '../../../lib/security/rateLimit.js';
import type { RoomCodeParams } from './join.js';

export interface ReclaimRoomDeps {
  roomStore: RoomStore;
  stateStore: GameStateStore;
  eventLog: EventLog;
  publisher: RealtimePublisher;
  nowIso?: () => string;
  rateLimiter?: RequestRateLimiter;
}

export function createReclaimRoomHandler(deps: ReclaimRoomDeps): (request: Request, params: RoomCodeParams) => Promise<Response> {
  return async function handleReclaimRoom(request: Request, params: RoomCodeParams): Promise<Response> {
    if (request.method !== 'POST') return json({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' }, 405);
    const rateLimited = await enforceRateLimit(request, deps.rateLimiter, Date.now());
    if (rateLimited) return rateLimited;

    let body: { playerId?: string; token?: string };
    try {
      body = await request.json() as { playerId?: string; token?: string };
    } catch {
      return json({ ok: false, error: 'ERR_INVALID_JSON' }, 400);
    }
    if (!body.playerId) return json({ ok: false, error: 'ERR_INVALID_REQUEST' }, 400);

    const auth = await authorizeRoomPlayer(deps.roomStore, params.code, body.playerId, body.token);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

    const room = await deps.roomStore.get(params.code);
    if (!room) return json({ ok: false, error: 'ERR_ROOM_NOT_FOUND' }, 404);
    const state = await deps.stateStore.get(params.code);
    if (!state) return json({ ok: false, error: 'ERR_ROOM_STATE_NOT_FOUND' }, 404);

    const result = reclaimBotTakeover(room, state, body.playerId, {
      ...(deps.nowIso ? { nowIso: deps.nowIso } : {}),
    });
    if (result.changed) {
      await deps.roomStore.set(params.code, result.room);
      await deps.stateStore.set(params.code, result.state);
    }

    const events: ServerEvent[] = result.changed
      ? result.events
      : [{ type: MessageType.StateResync, reason: 'room-reclaim' }];
    const logged = result.changed
      ? await publishEventsToPlayers(deps, params.code, result.state, events)
      : [];
    const eventIds = Object.fromEntries(
      result.state.players.map((player) => [
        player.id,
        logged.filter((entry) => entry.playerId === player.id).map((entry) => entry.event.id),
      ]),
    );

    return json({
      ok: true,
      reclaimed: result.changed,
      room: publicRoom(result.room),
      phase: result.state.phase,
      version: result.state.version,
      view: buildClientPayload(body.playerId, events[0]!, result.state).view,
      events: events.map((event) => event.type),
      eventIds,
    }, 200);
  };
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const defaultHandler = createReclaimRoomHandler({
  roomStore: defaultRoomStore,
  stateStore: defaultRealtimePersistence.stateStore,
  eventLog: defaultRealtimePersistence.eventLog,
  publisher: defaultRealtimePersistence.publisher,
  rateLimiter: createDefaultRateLimiter({ scope: 'room-reclaim', limit: 30, windowMs: 60_000 }),
});

export default universalHandler(defaultHandler, roomCodeParams('code'));
