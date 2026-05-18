import { universalHandler } from '../_node.js';
import { defaultModerationStore } from '../../lib/security/defaultModerationStore.js';
import { setHandleBan, type ModerationStore } from '../../lib/security/reports.js';
import { enforceAdminToken } from './_auth.js';

export interface AdminBanDeps {
  store: ModerationStore;
  adminToken?: string | undefined;
  nowIso?: () => string;
}

export function createAdminBanHandler(deps: AdminBanDeps): (request: Request) => Promise<Response> {
  return async function handleAdminBan(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' }, 405);
    const forbidden = enforceAdminToken(request, deps.adminToken);
    if (forbidden) return forbidden;

    let body: { handle?: unknown; banned?: unknown; reason?: unknown };
    try {
      body = await request.json() as { handle?: unknown; banned?: unknown; reason?: unknown };
    } catch {
      return json({ ok: false, error: 'ERR_INVALID_JSON' }, 400);
    }

    const result = await setHandleBan(deps.store, {
      handle: body.handle,
      banned: body.banned !== false,
      reason: body.reason,
      ...(deps.nowIso ? { nowIso: deps.nowIso } : {}),
    });
    if (!result.ok) return json(result, 400);
    return json(result, 200);
  };
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const defaultHandler = createAdminBanHandler({
  store: defaultModerationStore,
  adminToken: process.env.ADMIN_TOKEN,
});

export default universalHandler(defaultHandler);
