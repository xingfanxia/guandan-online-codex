import { defaultModerationStore } from '../../lib/security/defaultModerationStore';
import { resetPlayerStats, type ModerationStore } from '../../lib/security/reports';
import { enforceAdminToken } from './_auth';

export interface AdminResetStatsDeps {
  store: ModerationStore;
  adminToken?: string | undefined;
  nowIso?: () => string;
}

export function createAdminResetStatsHandler(deps: AdminResetStatsDeps): (request: Request) => Promise<Response> {
  return async function handleAdminResetStats(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' }, 405);
    const forbidden = enforceAdminToken(request, deps.adminToken);
    if (forbidden) return forbidden;

    let body: { handle?: unknown };
    try {
      body = await request.json() as { handle?: unknown };
    } catch {
      return json({ ok: false, error: 'ERR_INVALID_JSON' }, 400);
    }

    const result = await resetPlayerStats(deps.store, {
      handle: body.handle,
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

export default createAdminResetStatsHandler({
  store: defaultModerationStore,
  adminToken: process.env.ADMIN_TOKEN,
});
