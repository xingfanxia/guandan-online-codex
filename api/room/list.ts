import { defaultRoomStore } from '../../lib/room/defaultStore';
import { listPublicRooms, type RoomStore } from '../../lib/room/lifecycle';
import { createDefaultRateLimiter, enforceRateLimit, type RequestRateLimiter } from '../../lib/security/rateLimit';

export interface ListRoomDeps {
  store: RoomStore;
  rateLimiter?: RequestRateLimiter;
}

export function createListRoomHandler({ store, rateLimiter }: ListRoomDeps): (request: Request) => Promise<Response> {
  return async function handleListRooms(request: Request): Promise<Response> {
    if (request.method !== 'GET') return json({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' }, 405);
    const rateLimited = await enforceRateLimit(request, rateLimiter, Date.now());
    if (rateLimited) return rateLimited;

    const rooms = await listPublicRooms(store);
    return json({ ok: true, rooms }, 200);
  };
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default createListRoomHandler({
  store: defaultRoomStore,
  rateLimiter: createDefaultRateLimiter({ scope: 'room-list', limit: 60, windowMs: 60_000 }),
});
