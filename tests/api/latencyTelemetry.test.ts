import { describe, expect, test } from 'vitest';
import { createLatencyTelemetryHandler } from '../../api/telemetry/latency';
import { MemoryLatencyStore } from '../../lib/telemetry/latency';

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://gdo.ax0x.ai/api/telemetry/latency', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('api/telemetry/latency', () => {
  test('records a latency beacon using Vercel country header', async () => {
    const store = new MemoryLatencyStore();
    const handler = createLatencyTelemetryHandler({
      store,
      nowIso: () => '2026-05-18T00:00:00.000Z',
    });

    const response = await handler(post({ route: '/api/move', durationMs: 211.8 }, {
      'x-vercel-ip-country': 'US',
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    await expect(store.listRecent()).resolves.toEqual([{
      route: '/api/move',
      durationMs: 212,
      region: 'US',
      createdAt: '2026-05-18T00:00:00.000Z',
    }]);
  });

  test('returns named errors for malformed input and honors injected rate limiter', async () => {
    const store = new MemoryLatencyStore();
    const handler = createLatencyTelemetryHandler({ store });
    const limited = createLatencyTelemetryHandler({
      store,
      rateLimiter: {
        async check() {
          return { allowed: false, remaining: 0, resetAt: 7_000 };
        },
      },
    });

    expect((await handler(new Request('https://gdo.ax0x.ai/api/telemetry/latency'))).status).toBe(405);

    const invalid = await handler(post({ route: 'move', durationMs: 100 }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ ok: false, error: 'ERR_INVALID_ROUTE' });

    const rateLimited = await limited(post({ route: '/api/move', durationMs: 100 }));
    expect(rateLimited.status).toBe(429);
    expect(await rateLimited.json()).toEqual({ ok: false, error: 'ERR_RATE_LIMITED' });
  });
});
