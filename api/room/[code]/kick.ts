import { defaultRoomStore } from '../../../lib/room/defaultStore.js';
import { kickRoomPlayer, publicRoom, type RoomStore } from '../../../lib/room/lifecycle.js';
import { createDefaultRateLimiter, enforceRateLimit, type RequestRateLimiter } from '../../../lib/security/rateLimit.js';
import type { RoomCodeParams } from './join.js';

export function createKickRoomHandler({ store, rateLimiter }: { store: RoomStore; rateLimiter?: RequestRateLimiter }): (request: Request, params: RoomCodeParams) => Promise<Response> {
  return async function handleKickRoom(request: Request, params: RoomCodeParams): Promise<Response> {
    if (request.method !== 'POST') return json({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' }, 405);
    const rateLimited = await enforceRateLimit(request, rateLimiter, Date.now());
    if (rateLimited) return rateLimited;

    let body: { hostToken?: string; playerId?: string };
    try {
      body = await request.json() as { hostToken?: string; playerId?: string };
    } catch {
      return json({ ok: false, error: 'ERR_INVALID_JSON' }, 400);
    }
    if (!body.hostToken || !body.playerId) return json({ ok: false, error: 'ERR_INVALID_REQUEST' }, 400);

    const result = await kickRoomPlayer(store, params.code, {
      hostToken: body.hostToken,
      playerId: body.playerId,
    });
    if (!result.ok) return json(result, statusForError(result.error));
    return json({ ok: true, room: publicRoom(result.room) }, 200);
  };
}

function statusForError(error: string): number {
  switch (error) {
    case 'ERR_ROOM_NOT_FOUND':
      return 404;
    case 'ERR_INVALID_HOST_TOKEN':
      return 403;
    case 'ERR_CANNOT_KICK_HOST':
      return 409;
    default:
      return 400;
  }
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default createKickRoomHandler({
  store: defaultRoomStore,
  rateLimiter: createDefaultRateLimiter({ scope: 'room-kick', limit: 30, windowMs: 60_000 }),
});
