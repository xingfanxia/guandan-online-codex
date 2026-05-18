import { describe, expect, test } from 'vitest';
import { createAdminLatencyHandler } from '../../api/admin/latency';
import { MemoryLatencyStore } from '../../lib/telemetry/latency';

describe('api/admin/latency handler', () => {
  test('returns latency aggregates behind the admin token', async () => {
    const store = new MemoryLatencyStore();
    await store.save({ route: '/api/move', region: 'US', durationMs: 100, createdAt: '2026-05-18T00:00:00.000Z' });
    await store.save({ route: '/api/move', region: 'US', durationMs: 260, createdAt: '2026-05-18T00:00:01.000Z' });
    await store.save({ route: '/api/move', region: 'CN', durationMs: 410, createdAt: '2026-05-18T00:00:02.000Z' });
    const handler = createAdminLatencyHandler({ store, adminToken: 'secret' });

    const denied = await handler(new Request('https://gdo.ax0x.ai/api/admin/latency'));
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ ok: false, error: 'ERR_ADMIN_FORBIDDEN' });

    const allowed = await handler(new Request('https://gdo.ax0x.ai/api/admin/latency?limit=10', {
      headers: { 'x-admin-token': 'secret' },
    }));
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({
      ok: true,
      aggregates: [
        { route: '/api/move', region: 'CN', count: 1, p50: 410, p95: 410, p99: 410 },
        { route: '/api/move', region: 'US', count: 2, p50: 100, p95: 260, p99: 260 },
      ],
    });
  });

  test('rejects unsupported methods', async () => {
    const handler = createAdminLatencyHandler({
      store: new MemoryLatencyStore(),
      adminToken: 'secret',
    });

    const response = await handler(new Request('https://gdo.ax0x.ai/api/admin/latency', {
      method: 'POST',
      headers: { 'x-admin-token': 'secret' },
    }));

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' });
  });
});
