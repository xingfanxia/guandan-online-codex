import { defaultLatencyStore } from '../../lib/telemetry/defaultLatencyStore.js';
import { recordLatencySample, type LatencyStore } from '../../lib/telemetry/latency.js';
import { createDefaultRateLimiter, enforceRateLimit, type RequestRateLimiter } from '../../lib/security/rateLimit.js';

export interface LatencyTelemetryDeps {
  store: LatencyStore;
  nowIso?: () => string;
  rateLimiter?: RequestRateLimiter;
}

export function createLatencyTelemetryHandler(deps: LatencyTelemetryDeps): (request: Request) => Promise<Response> {
  return async function handleLatencyTelemetry(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' }, 405);

    const rateLimited = await enforceRateLimit(request, deps.rateLimiter, Date.now());
    if (rateLimited) return rateLimited;

    let body: { route?: unknown; durationMs?: unknown; region?: unknown };
    try {
      body = await request.json() as { route?: unknown; durationMs?: unknown; region?: unknown };
    } catch {
      return json({ ok: false, error: 'ERR_INVALID_JSON' }, 400);
    }

    const region = request.headers.get('x-vercel-ip-country') ?? body.region;
    const result = await recordLatencySample(deps.store, {
      route: body.route,
      durationMs: body.durationMs,
      region,
    }, {
      ...(deps.nowIso ? { nowIso: deps.nowIso } : {}),
    });
    if (!result.ok) return json(result, 400);
    return json({ ok: true }, 200);
  };
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default createLatencyTelemetryHandler({
  store: defaultLatencyStore,
  rateLimiter: createDefaultRateLimiter({ scope: 'telemetry-latency', limit: 120, windowMs: 60_000 }),
});
