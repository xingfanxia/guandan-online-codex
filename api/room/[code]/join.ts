import { defaultRoomStore } from '../../../lib/room/defaultStore';
import { joinRoom, publicRoom, publicRoomPlayer, type RoomStore } from '../../../lib/room/lifecycle';
import { defaultModerationStore } from '../../../lib/security/defaultModerationStore';
import { createDefaultRateLimiter, enforceRateLimit, type RequestRateLimiter } from '../../../lib/security/rateLimit';
import { isHandleBanned, type ModerationStore } from '../../../lib/security/reports';
import { clientIpFromRequest } from '../../../lib/security/requestIp';

export interface RoomCodeParams {
  code: string;
}

export function createJoinRoomHandler({
  store,
  rateLimiter,
  moderationStore,
}: {
  store: RoomStore;
  rateLimiter?: RequestRateLimiter;
  moderationStore?: ModerationStore;
}): (request: Request, params: RoomCodeParams) => Promise<Response> {
  return async function handleJoinRoom(request: Request, params: RoomCodeParams): Promise<Response> {
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
    if (await isHandleBanned(moderationStore, body.handle)) {
      return json({ ok: false, error: 'ERR_ACCOUNT_SUSPENDED' }, 403);
    }

    const clientIp = clientIpFromRequest(request);
    const result = await joinRoom(store, params.code, {
      handle: body.handle,
      ...(body.token ? { token: body.token } : {}),
      ...(clientIp !== 'unknown' ? { clientIp } : {}),
    });
    if (!result.ok) return json(result, 400);

    return json({
      ...result,
      room: publicRoom(result.room),
      player: publicRoomPlayer(result.player),
    }, 200);
  };
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default createJoinRoomHandler({
  store: defaultRoomStore,
  moderationStore: defaultModerationStore,
  rateLimiter: createDefaultRateLimiter({ scope: 'room-join', limit: 30, windowMs: 60_000 }),
});
