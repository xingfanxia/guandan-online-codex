import { describe, expect, test } from 'vitest';
import defaultCreateRoomHandler, { createCreateRoomHandler } from '../../api/room/create';
import defaultJoinRoomHandler, { createJoinRoomHandler } from '../../api/room/[code]/join';
import { createKickRoomHandler } from '../../api/room/[code]/kick';
import { createLeaveRoomHandler } from '../../api/room/[code]/leave';
import { createRoomStatusHandler } from '../../api/room/[code]/status';
import { createListRoomHandler } from '../../api/room/list';
import { MemoryRoomStore } from '../../lib/room/lifecycle';

function request(body: unknown, method = 'POST'): Request {
  const init: RequestInit = { method, headers: { 'content-type': 'application/json' } };
  if (method === 'POST') init.body = JSON.stringify(body);
  return new Request('https://gdo.ax0x.ai/api/room', init);
}

function rawRequest(body: string, method = 'POST'): Request {
  return new Request('https://gdo.ax0x.ai/api/room', {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  });
}

describe('room API handlers', () => {
  test('creates, joins, and leaves through API handlers', async () => {
    const store = new MemoryRoomStore();
    const create = createCreateRoomHandler({ store, random: () => 0, nowIso: () => '2026-05-18T00:00:00.000Z' });
    const join = createJoinRoomHandler({ store });
    const leave = createLeaveRoomHandler({ store });

    const createdResponse = await create(request({
      hostHandle: '@Fufu',
      rules: { cardExchange: true, exchangeCardCount: 4 },
    }));
    const created = await createdResponse.json();
    expect(createdResponse.status).toBe(200);
    expect(created).toMatchObject({ ok: true, room: { code: 'A2A2A2', rules: { cardExchange: true, exchangeCardCount: 4 } } });
    expect(created.playerToken).toMatch(/^player_/);
    expect(created.room).not.toHaveProperty('hostToken');
    expect(created.room).not.toHaveProperty('joinToken');
    expect(JSON.stringify(created.room)).not.toContain('playerToken');

    const joinedResponse = await join(request({ handle: '@Momo', token: created.joinToken }), { code: created.room.code });
    const joined = await joinedResponse.json();
    expect(joinedResponse.status).toBe(200);
    expect(joined).toMatchObject({ ok: true, player: { handle: 'momo' } });
    expect(joined.playerToken).toMatch(/^player_/);
    expect(joined.room).not.toHaveProperty('hostToken');
    expect(joined.room).not.toHaveProperty('joinToken');
    expect(JSON.stringify(joined.room)).not.toContain('playerToken');
    expect(JSON.stringify(joined.player)).not.toContain('playerToken');

    const leftResponse = await leave(request({ handle: 'momo', token: joined.playerToken }), { code: created.room.code });
    expect(leftResponse.status).toBe(200);
    expect(await leftResponse.json()).toEqual({ ok: true });
  });

  test('creates rooms with selected mode through API handlers', async () => {
    const store = new MemoryRoomStore();
    const create = createCreateRoomHandler({ store, random: () => 0, nowIso: () => '2026-05-18T00:00:00.000Z' });

    const createdResponse = await create(request({ hostHandle: '@Fufu', mode: '8' }));
    const created = await createdResponse.json();

    expect(createdResponse.status).toBe(200);
    expect(created).toMatchObject({ ok: true, room: { mode: '8', maxPlayers: 8 } });

    const rejected = await create(request({ hostHandle: '@Momo', mode: '5' }));
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({ ok: false, error: 'ERR_INVALID_ROOM_MODE' });
  });

  test('allows public-room joins without exposing join tokens', async () => {
    const store = new MemoryRoomStore();
    const create = createCreateRoomHandler({ store, random: () => 0, nowIso: () => '2026-05-18T00:00:00.000Z' });
    const join = createJoinRoomHandler({ store });

    const created = await (await create(request({ hostHandle: '@Fufu' }))).json();
    const joinedResponse = await join(request({ handle: '@Momo' }), { code: created.room.code });
    const joined = await joinedResponse.json();

    expect(joinedResponse.status).toBe(200);
    expect(joined).toMatchObject({ ok: true, player: { handle: 'momo' } });
    expect(joined.playerToken).toMatch(/^player_/);
    expect(JSON.stringify(joined)).not.toContain('joinToken');
  });

  test('requires a valid player token before leaving a room', async () => {
    const store = new MemoryRoomStore();
    const create = createCreateRoomHandler({ store, random: () => 0, nowIso: () => '2026-05-18T00:00:00.000Z' });
    const join = createJoinRoomHandler({ store });
    const leave = createLeaveRoomHandler({ store });

    const created = await (await create(request({ hostHandle: '@Fufu' }))).json();
    const joined = await (await join(request({ handle: '@Momo' }), { code: created.room.code })).json();

    const denied = await leave(request({ handle: '@Momo', token: 'wrong' }), { code: created.room.code });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ ok: false, error: 'ERR_INVALID_PLAYER_TOKEN' });

    const allowed = await leave(request({ handle: '@Momo', token: joined.playerToken }), { code: created.room.code });
    expect(allowed.status).toBe(200);
  });

  test('returns current waiting-room status without exposing room tokens', async () => {
    const store = new MemoryRoomStore();
    const create = createCreateRoomHandler({ store, random: () => 0, nowIso: () => '2026-05-18T00:00:00.000Z' });
    const join = createJoinRoomHandler({ store });
    const status = createRoomStatusHandler({ store });

    const created = await (await create(request({ hostHandle: '@Fufu' }))).json();
    const joined = await (await join(request({ handle: '@Momo' }), { code: created.room.code })).json();
    const response = await status(request({ playerId: joined.player.id, token: joined.playerToken }), { code: created.room.code });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      room: {
        code: created.room.code,
        players: [
          { id: 'p1', handle: 'fufu' },
          { id: 'p2', handle: 'momo' },
        ],
      },
    });
    expect(JSON.stringify(body)).not.toContain('joinToken');
    expect(JSON.stringify(body)).not.toContain('hostToken');
    expect(JSON.stringify(body)).not.toContain('playerToken');
  });

  test('requires membership to read non-public room status', async () => {
    const store = new MemoryRoomStore();
    const create = createCreateRoomHandler({ store, random: () => 0, nowIso: () => '2026-05-18T00:00:00.000Z' });
    const status = createRoomStatusHandler({ store });

    const created = await (await create(request({ hostHandle: '@Fufu', visibility: 'invite-only' }))).json();
    const denied = await status(request({}), { code: created.room.code });
    const allowed = await status(request({ playerId: 'p1', token: created.playerToken }), { code: created.room.code });

    expect(denied.status).toBe(400);
    expect(await denied.json()).toEqual({ ok: false, error: 'ERR_INVALID_REQUEST' });
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({ ok: true, room: { visibility: 'invite-only' } });
  });

  test('lets the host kick a non-host waiting-room player', async () => {
    const store = new MemoryRoomStore();
    const create = createCreateRoomHandler({ store, random: () => 0, nowIso: () => '2026-05-18T00:00:00.000Z' });
    const join = createJoinRoomHandler({ store });
    const kick = createKickRoomHandler({ store });

    const created = await (await create(request({ hostHandle: '@Fufu' }))).json();
    const joined = await (await join(request({ handle: '@Momo' }), { code: created.room.code })).json();

    const denied = await kick(request({ hostToken: 'wrong', playerId: joined.player.id }), { code: created.room.code });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ ok: false, error: 'ERR_INVALID_HOST_TOKEN' });

    const allowed = await kick(request({ hostToken: created.hostToken, playerId: joined.player.id }), { code: created.room.code });
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({
      ok: true,
      room: { players: [{ id: 'p1', handle: 'fufu' }] },
    });

    const hostDenied = await kick(request({ hostToken: created.hostToken, playerId: 'p1' }), { code: created.room.code });
    expect(hostDenied.status).toBe(409);
    expect(await hostDenied.json()).toEqual({ ok: false, error: 'ERR_CANNOT_KICK_HOST' });
  });

  test('default handlers use the same process-local room store', async () => {
    const createdResponse = await defaultCreateRoomHandler(request({ hostHandle: 'host1' }));
    const created = await createdResponse.json();

    const joinedResponse = await defaultJoinRoomHandler(request({ handle: 'guest1', token: created.joinToken }), {
      code: created.room.code,
    });

    expect(joinedResponse.status).toBe(200);
    expect(await joinedResponse.json()).toMatchObject({ ok: true, player: { handle: 'guest1' } });
  });

  test('returns named errors for malformed JSON', async () => {
    const store = new MemoryRoomStore();
    const create = createCreateRoomHandler({ store });
    const join = createJoinRoomHandler({ store });
    const leave = createLeaveRoomHandler({ store });

    expect(await (await create(rawRequest('{'))).json()).toEqual({ ok: false, error: 'ERR_INVALID_JSON' });
    expect(await (await join(rawRequest('{'), { code: 'A2A2A2' })).json()).toEqual({ ok: false, error: 'ERR_INVALID_JSON' });
    expect(await (await leave(rawRequest('{'), { code: 'A2A2A2' })).json()).toEqual({ ok: false, error: 'ERR_INVALID_JSON' });
  });

  test('lists only public rooms through API handler', async () => {
    const store = new MemoryRoomStore();
    let random = 0;
    const create = createCreateRoomHandler({
      store,
      random: () => {
        const value = random;
        random += 0.1;
        return value;
      },
      nowIso: () => '2026-05-18T00:00:00.000Z',
    });
    const list = createListRoomHandler({ store });

    const publicCreated = await (await create(request({ hostHandle: '@Fufu' }))).json();
    await create(request({ hostHandle: '@Momo', visibility: 'invite-only' }));

    const response = await list(new Request('https://gdo.ax0x.ai/api/room/list'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, rooms: [{ code: publicCreated.room.code, visibility: 'public' }] });
    expect(JSON.stringify(body)).not.toContain('joinToken');
    expect(JSON.stringify(body)).not.toContain('hostToken');
    expect(JSON.stringify(body)).not.toContain('playerToken');
  });

  test('does not expose stored client IPs in public room payloads', async () => {
    const store = new MemoryRoomStore();
    const create = createCreateRoomHandler({
      store,
      random: () => 0,
      nowIso: () => '2026-05-18T00:00:00.000Z',
    });
    const join = createJoinRoomHandler({ store });
    const list = createListRoomHandler({ store });

    const createdResponse = await create(new Request('https://gdo.ax0x.ai/api/room', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
      body: JSON.stringify({ hostHandle: '@Fufu' }),
    }));
    const created = await createdResponse.json();
    expect(JSON.stringify(created.room)).not.toContain('203.0.113.9');

    const joinedResponse = await join(new Request('https://gdo.ax0x.ai/api/room', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.7' },
      body: JSON.stringify({ handle: '@Momo', token: created.joinToken }),
    }), { code: created.room.code });
    const joined = await joinedResponse.json();
    expect(JSON.stringify(joined.room)).not.toContain('203.0.113.9');
    expect(JSON.stringify(joined.room)).not.toContain('198.51.100.7');
    expect(JSON.stringify(joined.player)).not.toContain('198.51.100.7');

    const listed = await (await list(new Request('https://gdo.ax0x.ai/api/room/list'))).json();
    expect(JSON.stringify(listed)).not.toContain('203.0.113.9');
    expect(JSON.stringify(listed)).not.toContain('198.51.100.7');
  });

  test('honors injected rate limiter on room mutation routes', async () => {
    const store = new MemoryRoomStore();
    const rateLimiter = {
      async check() {
        return { allowed: false, remaining: 0, resetAt: 7_000 };
      },
    };
    const create = createCreateRoomHandler({ store, rateLimiter, nowIso: () => '2026-05-18T00:00:00.000Z' });
    const join = createJoinRoomHandler({ store, rateLimiter });
    const leave = createLeaveRoomHandler({ store, rateLimiter });

    for (const response of [
      await create(request({ hostHandle: '@Fufu' })),
      await join(request({ handle: '@Momo', token: 'join-token' }), { code: 'A2A2A2' }),
      await leave(request({ handle: '@Momo' }), { code: 'A2A2A2' }),
    ]) {
      expect(response.status).toBe(429);
      expect(await response.json()).toEqual({ ok: false, error: 'ERR_RATE_LIMITED' });
    }
  });
});
