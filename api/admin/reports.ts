import { defaultModerationStore } from '../../lib/security/defaultModerationStore.js';
import type { ModerationStore, ReportStatus } from '../../lib/security/reports.js';
import { enforceAdminToken } from './_auth.js';

export interface AdminReportsDeps {
  store: ModerationStore;
  adminToken?: string | undefined;
}

export function createAdminReportsHandler(deps: AdminReportsDeps): (request: Request) => Promise<Response> {
  return async function handleAdminReports(request: Request): Promise<Response> {
    if (request.method !== 'GET') return json({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' }, 405);
    const forbidden = enforceAdminToken(request, deps.adminToken);
    if (forbidden) return forbidden;

    const url = new URL(request.url);
    const status = normalizeStatus(url.searchParams.get('status'));
    const limit = normalizeLimit(url.searchParams.get('limit'));
    const reports = await deps.store.listReports({
      ...(status ? { status } : {}),
      ...(url.searchParams.get('target') ? { targetHandle: url.searchParams.get('target')! } : {}),
      ...(limit ? { limit } : {}),
    });
    return json({ ok: true, reports }, 200);
  };
}

function normalizeStatus(status: string | null): ReportStatus | undefined {
  return status === 'open' || status === 'dismissed' || status === 'escalated' ? status : undefined;
}

function normalizeLimit(limit: string | null): number | undefined {
  if (!limit) return undefined;
  const parsed = Number.parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.min(parsed, 500);
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default createAdminReportsHandler({
  store: defaultModerationStore,
  adminToken: process.env.ADMIN_TOKEN,
});
