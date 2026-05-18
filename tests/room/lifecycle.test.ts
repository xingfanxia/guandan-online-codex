import { describe, expect, test } from 'vitest';
import { createRoom, joinRoom, leaveRoom, listPublicRooms, MemoryRoomStore } from '../../lib/room/lifecycle';

describe('room lifecycle', () => {
  test('creates, joins, and leaves a room', async () => {
    const store = new MemoryRoomStore();
    const created = await createRoom(store, {
      hostHandle: '@Fufu',
      random: () => 0,
      nowIso: () => '2026-05-18T00:00:00.000Z',
    });

    expect(created.room.code).toBe('A2A2A2');
    expect(created.room.players).toMatchObject([{ id: 'p1', handle: 'fufu', role: 'host' }]);
    expect(created.hostToken).toMatch(/^host_/);
    expect(created.playerToken).toMatch(/^player_/);
    expect(created.room.players[0]?.playerToken).toBe(created.playerToken);

    const joined = await joinRoom(store, created.room.code, { handle: '@Momo', token: created.joinToken });
    expect(joined).toMatchObject({ ok: true, player: { id: 'p2', handle: 'momo', role: 'player' } });
    expect(joined.ok ? joined.playerToken : undefined).toMatch(/^player_/);

    const left = await leaveRoom(store, created.room.code, { handle: 'momo' });
    expect(left).toEqual({ ok: true });
    expect(store.get(created.room.code)?.players.map((player) => player.handle)).toEqual(['fufu']);
  });

  test('uses crypto-backed room tokens when deterministic random is not injected', async () => {
    const store = new MemoryRoomStore();
    const created = await createRoom(store, { hostHandle: 'fufu' });

    expect(created.hostToken).toMatch(new RegExp(`^host_${created.room.code}_[A-Za-z0-9_-]{20,}$`));
    expect(created.joinToken).toMatch(new RegExp(`^join_${created.room.code}_[A-Za-z0-9_-]{20,}$`));
    expect(created.playerToken).toMatch(new RegExp(`^player_${created.room.code}_[A-Za-z0-9_-]{20,}$`));
    expect(created.hostToken).not.toBe(created.joinToken);
  });

  test('keeps deterministic tokens when random is injected for tests', async () => {
    const store = new MemoryRoomStore();
    const created = await createRoom(store, { hostHandle: 'fufu', random: () => 0 });

    expect(created.hostToken).toBe('host_A2A2A2_0000');
    expect(created.joinToken).toBe('join_A2A2A2_0000');
    expect(created.playerToken).toBe('player_A2A2A2_0000');
  });

  test('creates rooms with selected 6P/8P capacity and rejects invalid modes', async () => {
    const store = new MemoryRoomStore();
    const created = await createRoom(store, { hostHandle: 'fufu', random: () => 0, mode: '8' });

    expect(created.room).toMatchObject({ mode: '8', maxPlayers: 8 });

    for (const handle of ['a11', 'a22', 'a33', 'a44', 'a55', 'a66', 'a77']) {
      expect((await joinRoom(store, created.room.code, { handle })).ok).toBe(true);
    }
    await expect(joinRoom(store, created.room.code, { handle: 'a88' })).resolves.toEqual({
      ok: false,
      error: 'ERR_ROOM_FULL',
    });

    await expect(createRoom(new MemoryRoomStore(), { hostHandle: 'fufu', mode: '5' })).rejects.toThrow('ERR_INVALID_ROOM_MODE');
  });

  test('rejects invalid join tokens and full rooms', async () => {
    const store = new MemoryRoomStore();
    const created = await createRoom(store, { hostHandle: 'host', random: () => 0.1, visibility: 'invite-only' });

    await expect(joinRoom(store, created.room.code, { handle: 'bad', token: 'wrong' })).resolves.toEqual({
      ok: false,
      error: 'ERR_INVALID_JOIN_TOKEN',
    });

    for (const handle of ['a11', 'a22', 'a33']) {
      expect((await joinRoom(store, created.room.code, { handle, token: created.joinToken })).ok).toBe(true);
    }
    await expect(joinRoom(store, created.room.code, { handle: 'a44', token: created.joinToken })).resolves.toEqual({
      ok: false,
      error: 'ERR_ROOM_FULL',
    });
  });

  test('lets public rooms accept tokenless joins while protected rooms still require tokens', async () => {
    const store = new MemoryRoomStore();
    const publicCreated = await createRoom(store, { hostHandle: 'public1', random: () => 0 });
    const protectedCreated = await createRoom(store, {
      hostHandle: 'hidden1',
      random: () => 0.1,
      visibility: 'unlisted',
    });

    await expect(joinRoom(store, publicCreated.room.code, { handle: 'momo' })).resolves.toMatchObject({
      ok: true,
      player: { handle: 'momo' },
    });
    await expect(joinRoom(store, protectedCreated.room.code, { handle: 'momo' })).resolves.toEqual({
      ok: false,
      error: 'ERR_INVALID_JOIN_TOKEN',
    });
    await expect(joinRoom(store, publicCreated.room.code, { handle: 'doudou', token: 'wrong' })).resolves.toEqual({
      ok: false,
      error: 'ERR_INVALID_JOIN_TOKEN',
    });
  });

  test('lists public rooms without leaking room tokens', async () => {
    const store = new MemoryRoomStore();
    const publicRoom = await createRoom(store, {
      hostHandle: 'public1',
      random: () => 0,
      nowIso: () => '2026-05-18T00:00:00.000Z',
    });
    await createRoom(store, {
      hostHandle: 'hidden1',
      random: () => 0.1,
      nowIso: () => '2026-05-18T00:00:01.000Z',
      visibility: 'unlisted',
    });

    const rooms = await listPublicRooms(store);

    expect(rooms).toHaveLength(1);
    expect(rooms[0]).toMatchObject({ code: publicRoom.room.code, visibility: 'public' });
    expect(rooms[0]).not.toHaveProperty('hostToken');
    expect(rooms[0]).not.toHaveProperty('joinToken');
    expect(JSON.stringify(rooms[0])).not.toContain('playerToken');
  });
});
