import { describe, expect, test, vi } from 'vitest';
import { createHandle } from '../../src/lib/api/profile';

describe('profile API client', () => {
  test('creates handles through the measured POST helper', async () => {
    const fetcher = vi.fn(async () => Response.json({
      ok: true,
      profile: { handle: 'momo', createdAt: '2026-05-18T00:00:00.000Z' },
    }));

    await expect(createHandle({
      handle: '@Momo',
      fetcher,
      nowMs: () => 1_000,
    })).resolves.toMatchObject({ ok: true, profile: { handle: 'momo' } });

    expect(fetcher).toHaveBeenCalledWith('/api/auth/createHandle', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ handle: '@Momo' }),
    }));
  });
});
