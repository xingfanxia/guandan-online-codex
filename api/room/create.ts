import { createRoom, publicRoom, type RoomStore } from '../../lib/room/lifecycle';
import { defaultRoomStore } from '../../lib/room/defaultStore';
import { createDefaultRateLimiter, enforceRateLimit, type RequestRateLimiter } from '../../lib/security/rateLimit';
import { clientIpFromRequest } from '../../lib/security/requestIp';

export interface CreateRoomDeps {
  store: RoomStore;
  random?: () => number;
  nowIso?: () => string;
  rateLimiter?: RequestRateLimiter;
}

export function createCreateRoomHandler(deps: CreateRoomDeps): (request: Request) => Promise<Response> {
  return async function handleCreateRoom(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' }, 405);
    const rateLimited = await enforceRateLimit(request, deps.rateLimiter, Date.now());
    if (rateLimited) return rateLimited;

    let body: { hostHandle?: string; rules?: unknown; visibility?: unknown };
    try {
      body = await request.json() as { hostHandle?: string };
    } catch {
      return json({ ok: false, error: 'ERR_INVALID_JSON' }, 400);
    }
    if (!body.hostHandle) return json({ ok: false, error: 'ERR_INVALID_HANDLE' }, 400);

    try {
      const options: Parameters<typeof createRoom>[1] = { hostHandle: body.hostHandle };
      if (deps.random) options.random = deps.random;
      if (deps.nowIso) options.nowIso = deps.nowIso;
      if (body.rules) options.rules = body.rules;
      if (body.visibility) options.visibility = body.visibility;
      const clientIp = clientIpFromRequest(request);
      if (clientIp !== 'unknown') options.clientIp = clientIp;

      const result = await createRoom(deps.store, options);
      return json({
        ok: true,
        room: publicRoom(result.room),
        hostToken: result.hostToken,
        joinToken: result.joinToken,
        playerToken: result.playerToken,
      }, 200);
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : 'ERR_CREATE_ROOM_FAILED' }, 400);
    }
  };
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default createCreateRoomHandler({
  store: defaultRoomStore,
  rateLimiter: createDefaultRateLimiter({ scope: 'room-create', limit: 10, windowMs: 60_000 }),
});
