import { describe, expect, test, vi } from 'vitest';
import { postWithLatencyBeacon, sendLatencyBeacon } from '../../src/lib/telemetry/beacon';

describe('latency beacon client helper', () => {
  test('sends a latency beacon without throwing on network failure', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'));

    await expect(sendLatencyBeacon({
      route: '/api/move',
      durationMs: 123,
      fetcher,
    })).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenCalledWith('/api/telemetry/latency', expect.objectContaining({
      method: 'POST',
      keepalive: true,
      body: JSON.stringify({ route: '/api/move', durationMs: 123 }),
    }));
  });

  test('measures POST duration and sends a rounded beacon', async () => {
    let now = 1_000;
    const fetcher = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
      if (url === '/api/move') {
        now = 1_211.6;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const response = await postWithLatencyBeacon('/api/move', {
      body: { roomId: 'K7M2P9' },
      fetcher,
      nowMs: () => now,
    });

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/move', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ roomId: 'K7M2P9' }),
    }));
    expect(fetcher).toHaveBeenNthCalledWith(2, '/api/telemetry/latency', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ route: '/api/move', durationMs: 212 }),
    }));
  });
});
