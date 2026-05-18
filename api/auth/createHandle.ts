import { defaultPlayerProfileStore } from '../../lib/auth/defaultPlayerProfileStore.js';
import { normalizeHandle, validateHandle } from '../../lib/auth/handle.js';
import type { PlayerProfileStore } from '../../lib/auth/playerProfile.js';
import { defaultIpThrottleStore } from '../../lib/security/defaultIpThrottleStore.js';
import {
  checkIpThrottle,
  ipThrottleResponse,
  type IpThrottleStore,
} from '../../lib/security/ipThrottle.js';
import { clientIpFromRequest } from '../../lib/security/requestIp.js';

export interface CreateHandleDeps {
  profiles: PlayerProfileStore;
  throttleStore: IpThrottleStore;
  nowIso?: () => string;
  nowMs?: () => number;
}

export function createCreateHandleHandler(deps: CreateHandleDeps): (request: Request) => Promise<Response> {
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const nowMs = deps.nowMs ?? Date.now;

  return async function handleCreateHandle(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' }, 405);

    const throttle = await checkIpThrottle(deps.throttleStore, request, {
      scope: 'acct-create',
      limit: 5,
      windowMs: 86_400_000,
    });
    if (!throttle.allowed) return ipThrottleResponse(throttle, nowMs());

    let body: { handle?: unknown };
    try {
      body = await request.json() as { handle?: unknown };
    } catch {
      return json({ ok: false, error: 'ERR_INVALID_JSON' }, 400);
    }
    if (typeof body.handle !== 'string') return json({ ok: false, error: 'ERR_INVALID_HANDLE' }, 400);

    const handle = normalizeHandle(body.handle);
    if (!validateHandle(handle)) return json({ ok: false, error: 'ERR_INVALID_HANDLE' }, 400);

    const profile = {
      handle,
      createdAt: nowIso(),
      createIp: clientIpFromRequest(request),
    };
    const created = await deps.profiles.create(profile);
    if (!created) return json({ ok: false, error: 'ERR_HANDLE_TAKEN' }, 409);

    return json({ ok: true, profile }, 200);
  };
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default createCreateHandleHandler({
  profiles: defaultPlayerProfileStore,
  throttleStore: defaultIpThrottleStore,
});
