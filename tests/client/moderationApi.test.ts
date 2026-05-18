import { describe, expect, test, vi } from 'vitest';
import {
  banHandle,
  listLatency,
  listReports,
  resetStats,
  submitReport,
} from '../../src/lib/api/moderation';

describe('moderation API client', () => {
  test('submits player reports', async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true, duplicate: false }));

    await expect(submitReport({
      reporterHandle: 'fufu',
      targetHandle: 'momo',
      gameId: 'K7M2P9',
      reason: 'cheat',
      fetcher,
    })).resolves.toEqual({ ok: true, duplicate: false });

    expect(fetcher).toHaveBeenCalledWith('/api/report', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        reporterHandle: 'fufu',
        targetHandle: 'momo',
        gameId: 'K7M2P9',
        reason: 'cheat',
      }),
    }));
  });

  test('uses admin token headers for report listing and actions', async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true }));

    await listReports({ adminToken: 'secret', fetcher });
    await listLatency({ adminToken: 'secret', fetcher });
    await banHandle({ adminToken: 'secret', handle: 'momo', banned: true, reason: 'confirmed', fetcher });
    await resetStats({ adminToken: 'secret', handle: 'momo', fetcher });

    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/admin/reports', {
      headers: { 'x-admin-token': 'secret' },
    });
    expect(fetcher).toHaveBeenNthCalledWith(2, '/api/admin/latency', {
      headers: { 'x-admin-token': 'secret' },
    });
    expect(fetcher).toHaveBeenNthCalledWith(3, '/api/admin/ban', expect.objectContaining({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-token': 'secret' },
    }));
    expect(fetcher).toHaveBeenNthCalledWith(4, '/api/admin/reset-stats', expect.objectContaining({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-token': 'secret' },
    }));
  });
});
