import { universalHandler, roomCodeParams } from '../../_node.js';
import { defaultRoomStore } from '../../../lib/room/defaultStore.js';
import { publicRoom, type RoomStore } from '../../../lib/room/lifecycle.js';
import { authorizeRoomPlayer } from '../../../lib/room/playerAuth.js';
import { createDefaultRateLimiter, enforceRateLimit, type RequestRateLimiter } from '../../../lib/security/rateLimit.js';
import type { RoomCodeParams } from './join.js';

export function createRoomStatusHandler({ store, rateLimiter }: { store: RoomStore; rateLimiter?: RequestRateLimiter }): (request: Request, params: RoomCodeParams) => Promise<Response> {
  return async function handleRoomStatus(request: Request, params: RoomCodeParams): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'POST') {
      return json({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' }, 405);
    }
    const rateLimited = await enforceRateLimit(request, rateLimiter, Date.now());
    if (rateLimited) return rateLimited;

    const room = await store.get(params.code);
    if (!room) return json({ ok: false, error: 'ERR_ROOM_NOT_FOUND' }, 404);

    const body = request.method === 'POST' ? await readBody(request) : {};
    const playerId = typeof body.playerId === 'string' ? body.playerId : undefined;
    const token = typeof body.token === 'string' ? body.token : undefined;
    if (playerId || token || room.visibility !== 'public') {
      if (!playerId) return json({ ok: false, error: 'ERR_INVALID_REQUEST' }, 400);
      const auth = await authorizeRoomPlayer(store, params.code, playerId, token);
      if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
    }

    return json({ ok: true, room: publicRoom(room) }, 200);
  };
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json() as unknown;
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const defaultHandler = createRoomStatusHandler({
  store: defaultRoomStore,
  rateLimiter: createDefaultRateLimiter({ scope: 'room-status', limit: 120, windowMs: 60_000 }),
});

export default universalHandler(defaultHandler, roomCodeParams('code'));
