import { describe, expect, test } from 'vitest';
import { createRoom, joinRoom, MemoryRoomStore } from '../../lib/room/lifecycle';
import { sameRoomIpWarning } from '../../lib/room/ipWarning';

describe('room IP warning', () => {
  test('detects when a joining player shares an IP with existing room players', async () => {
    const store = new MemoryRoomStore();
    const created = await createRoom(store, {
      hostHandle: 'host1',
      random: () => 0,
      clientIp: '203.0.113.9',
    });

    const result = await joinRoom(store, created.room.code, {
      handle: 'guest1',
      token: created.joinToken,
      clientIp: '203.0.113.9',
    });

    expect(result).toMatchObject({
      ok: true,
      warnings: [{ type: 'same_ip', ip: '203.0.113.9', matchingHandles: ['host1'] }],
    });
    expect(store.get(created.room.code)?.players).toMatchObject([
      { handle: 'host1', clientIp: '203.0.113.9' },
      { handle: 'guest1', clientIp: '203.0.113.9' },
    ]);
  });

  test('does not warn for unknown or distinct IPs', async () => {
    const store = new MemoryRoomStore();
    const created = await createRoom(store, {
      hostHandle: 'host1',
      random: () => 0,
      clientIp: '203.0.113.9',
    });

    const room = await store.get(created.room.code);
    expect(room ? sameRoomIpWarning(room, 'unknown') : undefined).toBeUndefined();
    expect(room ? sameRoomIpWarning(room, '198.51.100.7') : undefined).toBeUndefined();
  });
});
