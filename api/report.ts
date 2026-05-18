import { defaultModerationStore } from '../lib/security/defaultModerationStore';
import { enforceBotId } from '../lib/security/botId';
import { createDefaultRateLimiter, enforceRateLimit, type RequestRateLimiter } from '../lib/security/rateLimit';
import { submitReport, type ModerationStore, type SubmitReportInput } from '../lib/security/reports';

export interface ReportHandlerDeps {
  store: ModerationStore;
  nowIso?: () => string;
  rateLimiter?: RequestRateLimiter;
}

export function createReportHandler(deps: ReportHandlerDeps): (request: Request) => Promise<Response> {
  return async function handleReport(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' }, 405);
    const botBlocked = await enforceBotId(request);
    if (botBlocked) return botBlocked;

    const rateLimited = await enforceRateLimit(request, deps.rateLimiter, Date.now());
    if (rateLimited) return rateLimited;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'ERR_INVALID_JSON' }, 400);
    }

    const result = await submitReport(deps.store, body as SubmitReportInput, {
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

export default createReportHandler({
  store: defaultModerationStore,
  rateLimiter: createDefaultRateLimiter({ scope: 'report', limit: 3, windowMs: 86_400_000 }),
});
