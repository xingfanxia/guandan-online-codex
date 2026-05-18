import { describe, expect, test, vi } from 'vitest';
import {
  createRoom,
  getRoomStatus,
  joinRoom,
  kickPlayer,
  leaveRoom,
  listRooms,
  reclaimPlayer,
  startRoom,
} from '../../src/lib/api/rooms';

describe('room API client', () => {
  test('creates rooms through the measured POST helper', async () => {
    const fetcher = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
      if (url === '/api/room/create') {
        return Response.json({ ok: true, room: { code: 'K7M2P9' }, hostToken: 'host', joinToken: 'join' });
      }
      return Response.json({ ok: true });
    });

    await expect(createRoom({
      hostHandle: '@Fufu',
      rules: { cardExchange: true },
      fetcher,
      nowMs: () => 1_000,
    })).resolves.toMatchObject({ ok: true, room: { code: 'K7M2P9' } });
    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/room/create', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ hostHandle: '@Fufu', mode: '4', rules: { cardExchange: true }, visibility: 'public' }),
    }));
  });

  test('joins, leaves, and starts rooms with code-specific endpoints', async () => {
    const fetcher = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
      if (url === '/api/room/K7M2P9/join') {
        return Response.json({ ok: true, player: { handle: 'momo' } });
      }
      if (url === '/api/room/K7M2P9/leave') {
        return Response.json({ ok: true });
      }
      if (url === '/api/room/K7M2P9/kick') {
        return Response.json({ ok: true, room: { code: 'K7M2P9' } });
      }
      if (url === '/api/room/K7M2P9/reclaim') {
        return Response.json({ ok: true, reclaimed: true, room: { code: 'K7M2P9' }, phase: 'playing', version: 2 });
      }
      if (url === '/api/room/K7M2P9/status') {
        return Response.json({ ok: true, room: { code: 'K7M2P9' } });
      }
      if (url === '/api/room/K7M2P9/start') {
        return Response.json({ ok: true, phase: 'playing' });
      }
      return Response.json({ ok: true });
    });

    await expect(joinRoom({ code: 'K7M2P9', handle: '@Momo', token: 'join', fetcher })).resolves.toMatchObject({ ok: true });
    await expect(leaveRoom({ code: 'K7M2P9', handle: '@Momo', token: 'player-token', fetcher })).resolves.toEqual({ ok: true });
    await expect(kickPlayer({ code: 'K7M2P9', hostToken: 'host', playerId: 'p2', fetcher })).resolves.toMatchObject({ ok: true });
    await expect(reclaimPlayer({ code: 'K7M2P9', playerId: 'p1', token: 'player-token', fetcher })).resolves.toMatchObject({ ok: true, reclaimed: true });
    await expect(getRoomStatus({ code: 'K7M2P9', playerId: 'p1', token: 'player-token', fetcher })).resolves.toMatchObject({ ok: true, room: { code: 'K7M2P9' } });
    await expect(startRoom({ code: 'K7M2P9', hostToken: 'host', fillBots: true, botDifficulty: 'medium', fetcher })).resolves.toMatchObject({ ok: true });

    expect(fetcher).toHaveBeenCalledWith('/api/room/K7M2P9/join', expect.objectContaining({ method: 'POST' }));
    expect(fetcher).toHaveBeenCalledWith('/api/room/K7M2P9/leave', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ handle: '@Momo', token: 'player-token' }),
    }));
    expect(fetcher).toHaveBeenCalledWith('/api/room/K7M2P9/kick', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ hostToken: 'host', playerId: 'p2' }),
    }));
    expect(fetcher).toHaveBeenCalledWith('/api/room/K7M2P9/reclaim', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ playerId: 'p1', token: 'player-token' }),
    }));
    expect(fetcher).toHaveBeenCalledWith('/api/room/K7M2P9/status', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ playerId: 'p1', token: 'player-token' }),
    }));
    expect(fetcher).toHaveBeenCalledWith('/api/room/K7M2P9/start', expect.objectContaining({ method: 'POST' }));
  });

  test('can join public rooms without a token', async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true, player: { handle: 'momo' } }));

    await expect(joinRoom({ code: 'K7M2P9', handle: '@Momo', fetcher })).resolves.toMatchObject({ ok: true });
    expect(fetcher).toHaveBeenCalledWith('/api/room/K7M2P9/join', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ handle: '@Momo' }),
    }));
  });

  test('lists public rooms via GET', async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true, rooms: [{ code: 'K7M2P9' }] }));

    await expect(listRooms({ fetcher })).resolves.toEqual({ ok: true, rooms: [{ code: 'K7M2P9' }] });
    expect(fetcher).toHaveBeenCalledWith('/api/room/list');
  });
});
