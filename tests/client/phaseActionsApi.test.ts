import { describe, expect, test, vi } from 'vitest';
import {
  submitExchangeSelection,
  submitExchangeVote,
  submitTributeSelection,
} from '../../src/lib/api/phaseActions';
import type { Card } from '../../lib/game/cards';

const card: Card = { rank: 'A', suit: 'spades', deck: 1 };

describe('phase action API client', () => {
  test('submits tribute and return selections through the measured POST helper', async () => {
    const fetcher = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
      if (url === '/api/tribute/select') return Response.json({ ok: true, phase: 'return-pending', version: 2 });
      return Response.json({ ok: true });
    });

    await expect(submitTributeSelection({
      roomId: 'K7M2P9',
      playerId: 'p8',
      token: 'player-token',
      card,
      fetcher,
      nowMs: () => 1_000,
    })).resolves.toMatchObject({ ok: true, phase: 'return-pending' });

    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/tribute/select', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ roomId: 'K7M2P9', playerId: 'p8', token: 'player-token', card }),
    }));
  });

  test('submits exchange votes', async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true, phase: 'exchange-select-pending', version: 3 }));

    await expect(submitExchangeVote({
      roomId: 'K7M2P9',
      playerId: 'p8',
      choice: 'yes',
      fetcher,
    })).resolves.toMatchObject({ ok: true });

    expect(fetcher).toHaveBeenCalledWith('/api/exchange/vote', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ roomId: 'K7M2P9', playerId: 'p8', choice: 'yes' }),
    }));
  });

  test('submits exchange card selections', async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true, completed: false }));

    await expect(submitExchangeSelection({
      roomId: 'K7M2P9',
      playerId: 'p8',
      cards: [card],
      fetcher,
    })).resolves.toMatchObject({ ok: true, completed: false });

    expect(fetcher).toHaveBeenCalledWith('/api/exchange/select', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ roomId: 'K7M2P9', playerId: 'p8', cards: [card] }),
    }));
  });
});
