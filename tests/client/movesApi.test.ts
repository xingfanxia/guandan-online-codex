import { describe, expect, test, vi } from 'vitest';
import type { Card } from '../../lib/game/cards';
import { submitMove } from '../../src/lib/api/moves';

const card: Card = { rank: '3', suit: 'spades', deck: 1 };

describe('move API client', () => {
  test('submits play commands through the measured POST helper', async () => {
    const fetcher = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
      if (url === '/api/move') return Response.json({ ok: true, version: 2, events: ['move_played'] });
      return Response.json({ ok: true });
    });

    await expect(submitMove({
      roomId: 'K7M2P9',
      playerId: 'p1',
      token: 'player-token',
      moveId: 'move-1',
      command: { type: 'play', cards: [card] },
      fetcher,
      nowMs: () => 1_000,
    })).resolves.toMatchObject({ ok: true, version: 2 });

    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/move', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        roomId: 'K7M2P9',
        playerId: 'p1',
        token: 'player-token',
        moveId: 'move-1',
        command: { type: 'play', cards: [card] },
      }),
    }));
  });

  test('submits pass commands', async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true, version: 3 }));

    await expect(submitMove({
      roomId: 'K7M2P9',
      playerId: 'p1',
      moveId: 'move-pass',
      command: { type: 'pass' },
      fetcher,
    })).resolves.toMatchObject({ ok: true, version: 3 });

    expect(fetcher).toHaveBeenCalledWith('/api/move', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        roomId: 'K7M2P9',
        playerId: 'p1',
        moveId: 'move-pass',
        command: { type: 'pass' },
      }),
    }));
  });
});
