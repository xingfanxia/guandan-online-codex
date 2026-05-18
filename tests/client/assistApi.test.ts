import { describe, expect, test, vi } from 'vitest';
import { suggestMove } from '../../src/lib/api/assist';

describe('assist API client', () => {
  test('requests a suggestion through the measured POST helper with player token', async () => {
    const fetcher = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
      if (url === '/api/assist/suggest') {
        return Response.json({ ok: true, move: { type: 'pass' }, description: '没有合适压牌' });
      }
      return Response.json({ ok: true });
    });

    await expect(suggestMove({
      roomId: 'K7M2P9',
      playerId: 'p1',
      token: 'player-token',
      fetcher,
      nowMs: () => 1_000,
    })).resolves.toMatchObject({ ok: true, move: { type: 'pass' } });

    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/assist/suggest', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ roomId: 'K7M2P9', playerId: 'p1', token: 'player-token' }),
    }));
  });
});
