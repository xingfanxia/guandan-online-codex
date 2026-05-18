import { describe, expect, test } from 'vitest';
import { createStartRoomHandler } from '../../api/room/[code]/start';
import { generateDeckForMode, generateDoubleDeck } from '../../lib/game/cards';
import { MemoryEventLog } from '../../lib/realtime/eventLog';
import { MemoryGameStateStore } from '../../lib/realtime/stateStore';
import type { RealtimePublisher } from '../../lib/realtime/upstash';
import { createRoom, MemoryRoomStore } from '../../lib/room/lifecycle';

function request(body: unknown, method = 'POST'): Request {
  const init: RequestInit = { method, headers: { 'content-type': 'application/json' } };
  if (method === 'POST') init.body = JSON.stringify(body);
  return new Request('https://gdo.ax0x.ai/api/room/A2A2A2/start', init);
}

describe('room start API handler', () => {
  test('starts a room, stores game state, and publishes filtered resync events', async () => {
    const roomStore = new MemoryRoomStore();
    const created = await createRoom(roomStore, {
      hostHandle: '@Fufu',
      random: () => 0,
      nowIso: () => '2026-05-18T00:00:00.000Z',
    });
    const stateStore = new MemoryGameStateStore();
    const eventLog = new MemoryEventLog();
    const published: Array<{ channel: string; payload: string }> = [];
    const publisher: RealtimePublisher = {
      async publish(channel, payload) {
        published.push({ channel, payload });
      },
    };
    const handler = createStartRoomHandler({
      roomStore,
      stateStore,
      eventLog,
      publisher,
      deckForRoom: () => generateDoubleDeck(),
    });

    const response = await handler(request({
      hostToken: created.hostToken,
      fillBots: true,
      botDifficulty: 'easy',
    }), { code: created.room.code });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      phase: 'playing',
      version: 1,
      events: ['state_resync'],
    });
    expect(body.players).toMatchObject([
      { id: 'p1', kind: 'human', handle: 'fufu', displayName: '@fufu' },
      { id: 'p2', kind: 'bot', botDifficulty: 'easy', handle: 'bot_doudou_2', displayName: '@豆豆' },
      { id: 'p3', kind: 'bot', botDifficulty: 'easy', handle: 'bot_maomao_3', displayName: '@毛毛' },
      { id: 'p4', kind: 'bot', botDifficulty: 'easy', handle: 'bot_xiaoyu_4', displayName: '@小雨' },
    ]);
    expect(body.view).toMatchObject({
      phase: 'playing',
      mode: '4',
      self: { playerId: 'p1' },
      handCounts: { p1: 27, p2: 27, p3: 27, p4: 27 },
    });
    expect(body.view.self.hand).toHaveLength(27);
    expect(await stateStore.get(created.room.code)).toMatchObject({ phase: 'playing', currentTurn: 'p1' });
    expect(await roomStore.get(created.room.code)).toMatchObject({ status: 'playing' });
    expect(published).toHaveLength(4);
    expect(eventLog.replayAfter(created.room.code, 'p2').map((entry) => entry.payload.type)).toEqual(['state_resync']);
    expect(JSON.stringify(body)).not.toContain('hands');
  });

  test('started rooms reject late joins through the lifecycle store', async () => {
    const roomStore = new MemoryRoomStore();
    const created = await createRoom(roomStore, { hostHandle: '@Fufu', random: () => 0 });
    const handler = createStartRoomHandler({
      roomStore,
      stateStore: new MemoryGameStateStore(),
      eventLog: new MemoryEventLog(),
      publisher: { async publish() {} },
      deckForRoom: () => generateDoubleDeck(),
    });

    expect((await handler(request({ hostToken: created.hostToken, fillBots: true }), { code: created.room.code })).status).toBe(200);
    expect(await roomStore.get(created.room.code)).toMatchObject({ status: 'playing' });
  });

  test('starts selected 8P room mode and publishes to all seats', async () => {
    const roomStore = new MemoryRoomStore();
    const created = await createRoom(roomStore, {
      hostHandle: '@Fufu',
      random: () => 0,
      mode: '8',
    });
    const stateStore = new MemoryGameStateStore();
    const eventLog = new MemoryEventLog();
    const published: Array<{ channel: string; payload: string }> = [];
    const handler = createStartRoomHandler({
      roomStore,
      stateStore,
      eventLog,
      publisher: {
        async publish(channel, payload) {
          published.push({ channel, payload });
        },
      },
      deckForRoom: () => generateDeckForMode('8'),
    });

    const response = await handler(request({
      hostToken: created.hostToken,
      fillBots: true,
      botDifficulty: 'easy',
    }), { code: created.room.code });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, phase: 'playing', mode: '8', version: 1 });
    expect(body.view).toMatchObject({
      phase: 'playing',
      mode: '8',
      self: { playerId: 'p1' },
      handCounts: { p1: 27, p2: 27, p3: 27, p4: 27, p5: 27, p6: 27, p7: 27, p8: 27 },
    });
    expect(body.view.self.hand).toHaveLength(27);
    expect(body.players).toHaveLength(8);
    expect(await stateStore.get(created.room.code)).toMatchObject({ phase: 'playing', mode: '8' });
    expect(published).toHaveLength(8);
  });

  test('uses a mode-sized deck by default for 8P starts', async () => {
    const roomStore = new MemoryRoomStore();
    const created = await createRoom(roomStore, {
      hostHandle: '@Fufu',
      random: () => 0,
      mode: '8',
    });
    const handler = createStartRoomHandler({
      roomStore,
      stateStore: new MemoryGameStateStore(),
      eventLog: new MemoryEventLog(),
      publisher: { async publish() {} },
    });

    const response = await handler(request({
      hostToken: created.hostToken,
      fillBots: true,
      botDifficulty: 'easy',
    }), { code: created.room.code });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.view).toMatchObject({
      mode: '8',
      handCounts: { p1: 27, p2: 27, p3: 27, p4: 27, p5: 27, p6: 27, p7: 27, p8: 27 },
    });
  });

  test('rejects bad host token and malformed requests', async () => {
    const roomStore = new MemoryRoomStore();
    const created = await createRoom(roomStore, { hostHandle: '@Fufu', random: () => 0 });
    const handler = createStartRoomHandler({
      roomStore,
      stateStore: new MemoryGameStateStore(),
      eventLog: new MemoryEventLog(),
      publisher: { async publish() {} },
      deckForRoom: () => generateDoubleDeck(),
    });

    expect(await (await handler(request({}, 'GET'), { code: created.room.code })).json()).toEqual({
      ok: false,
      error: 'ERR_METHOD_NOT_ALLOWED',
    });
    expect(await (await handler(request({ hostToken: 'wrong', fillBots: true }), { code: created.room.code })).json()).toEqual({
      ok: false,
      error: 'ERR_INVALID_HOST_TOKEN',
    });
  });
});
