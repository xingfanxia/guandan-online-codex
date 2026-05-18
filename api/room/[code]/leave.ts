import { universalHandler, roomCodeParams } from '../../_node.js';
import { defaultRoomStore } from '../../../lib/room/defaultStore.js';
import { leaveRoom, type RoomStore } from '../../../lib/room/lifecycle.js';
import { authorizeRoomHandle } from '../../../lib/room/playerAuth.js';
import { createDefaultRateLimiter, enforceRateLimit, type RequestRateLimiter } from '../../../lib/security/rateLimit.js';
import type { RoomCodeParams } from './join.js';

export function createLeaveRoomHandler({ store, rateLimiter }: { store: RoomStore; rateLimiter?: RequestRateLimiter }): (request: Request, params: RoomCodeParams) => Promise<Response> {
  return async function handleLeaveRoom(request: Request, params: RoomCodeParams): Promise<Response> {
    if (request.method !== 'POST') return json({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' }, 405);
    const rateLimited = await enforceRateLimit(request, rateLimiter, Date.now());
    if (rateLimited) return rateLimited;

    let body: { handle?: string; token?: string };
    try {
      body = await request.json() as { handle?: string; token?: string };
    } catch {
      return json({ ok: false, error: 'ERR_INVALID_JSON' }, 400);
    }
    if (!body.handle) return json({ ok: false, error: 'ERR_INVALID_REQUEST' }, 400);
    const auth = await authorizeRoomHandle(store, params.code, body.handle, body.token);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

    const result = await leaveRoom(store, params.code, { handle: body.handle });
    return json(result, result.ok ? 200 : 400);
  };
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const defaultHandler = createLeaveRoomHandler({
  store: defaultRoomStore,
  rateLimiter: createDefaultRateLimiter({ scope: 'room-leave', limit: 30, windowMs: 60_000 }),
});

export default universalHandler(defaultHandler, roomCodeParams('code'));
