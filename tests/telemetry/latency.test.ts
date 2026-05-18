import { describe, expect, test } from 'vitest';
import {
  MemoryLatencyStore,
  aggregateLatency,
  recordLatencySample,
} from '../../lib/telemetry/latency';

describe('latency telemetry', () => {
  test('validates and stores latency samples', async () => {
    const store = new MemoryLatencyStore();
    const result = await recordLatencySample(store, {
      route: '/api/move',
      durationMs: 123.4,
      region: 'US',
    }, { nowIso: () => '2026-05-18T00:00:00.000Z' });

    expect(result).toEqual({
      ok: true,
      sample: {
        route: '/api/move',
        durationMs: 123,
        region: 'US',
        createdAt: '2026-05-18T00:00:00.000Z',
      },
    });
    if (!result.ok) throw new Error(result.error);
    await expect(store.listRecent()).resolves.toEqual([result.sample]);
  });

  test('rejects invalid route, duration, and region', async () => {
    const store = new MemoryLatencyStore();

    await expect(recordLatencySample(store, {
      route: 'move',
      durationMs: 100,
    })).resolves.toEqual({ ok: false, error: 'ERR_INVALID_ROUTE' });

    await expect(recordLatencySample(store, {
      route: '/api/move',
      durationMs: 100_000,
    })).resolves.toEqual({ ok: false, error: 'ERR_INVALID_DURATION' });

    await expect(recordLatencySample(store, {
      route: '/api/move',
      durationMs: 100,
      region: 'United States',
    })).resolves.toEqual({ ok: false, error: 'ERR_INVALID_REGION' });
  });

  test('aggregates p50 p95 and p99 by route and region', () => {
    const samples = [
      { route: '/api/move', region: 'US', durationMs: 100, createdAt: '2026-05-18T00:00:00.000Z' },
      { route: '/api/move', region: 'US', durationMs: 150, createdAt: '2026-05-18T00:00:01.000Z' },
      { route: '/api/move', region: 'US', durationMs: 300, createdAt: '2026-05-18T00:00:02.000Z' },
      { route: '/api/move', region: 'CN', durationMs: 500, createdAt: '2026-05-18T00:00:03.000Z' },
      { route: '/api/room/create', region: 'US', durationMs: 80, createdAt: '2026-05-18T00:00:04.000Z' },
    ];

    expect(aggregateLatency(samples)).toEqual([
      { route: '/api/move', region: 'CN', count: 1, p50: 500, p95: 500, p99: 500 },
      { route: '/api/move', region: 'US', count: 3, p50: 150, p95: 300, p99: 300 },
      { route: '/api/room/create', region: 'US', count: 1, p50: 80, p95: 80, p99: 80 },
    ]);
  });
});
