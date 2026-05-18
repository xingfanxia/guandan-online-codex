import { defaultLatencyStore } from '../../lib/telemetry/defaultLatencyStore';
import { aggregateLatency, type LatencyStore } from '../../lib/telemetry/latency';
import { enforceAdminToken } from './_auth';

export interface AdminLatencyDeps {
  store: LatencyStore;
  adminToken?: string | undefined;
}

export function createAdminLatencyHandler(deps: AdminLatencyDeps): (request: Request) => Promise<Response> {
  return async function handleAdminLatency(request: Request): Promise<Response> {
    if (request.method !== 'GET') return json({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' }, 405);
    const forbidden = enforceAdminToken(request, deps.adminToken);
    if (forbidden) return forbidden;

    const url = new URL(request.url);
    const samples = await deps.store.listRecent(normalizeLimit(url.searchParams.get('limit')));
    return json({ ok: true, aggregates: aggregateLatency(samples) }, 200);
  };
}

function normalizeLimit(limit: string | null): number | undefined {
  if (!limit) return undefined;
  const parsed = Number.parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.min(parsed, 5_000);
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default createAdminLatencyHandler({
  store: defaultLatencyStore,
  adminToken: process.env.ADMIN_TOKEN,
});
