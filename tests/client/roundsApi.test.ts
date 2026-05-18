import { describe, expect, test, vi } from 'vitest';
import { advanceRound } from '../../src/lib/api/rounds';

describe('round API client', () => {
  test('advances round-end through the measured POST helper with the player token', async () => {
    const fetcher = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
      if (url === '/api/round/next') return Response.json({ ok: true, phase: 'tribute-pending', version: 10 });
      return Response.json({ ok: true });
    });

    await expect(advanceRound({
      roomId: 'K7M2P9',
      playerId: 'p1',
      token: 'player-token',
      transitionId: 'round-9',
      fetcher,
      nowMs: () => 1_000,
    })).resolves.toMatchObject({ ok: true, phase: 'tribute-pending' });

    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/round/next', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        roomId: 'K7M2P9',
        playerId: 'p1',
        token: 'player-token',
        transitionId: 'round-9',
      }),
    }));
  });
});
