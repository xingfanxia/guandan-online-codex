import { describe, expect, test } from 'vitest';
import { createAdminBanHandler } from '../../api/admin/ban';
import { createAdminReportsHandler } from '../../api/admin/reports';
import { createAdminResetStatsHandler } from '../../api/admin/reset-stats';
import { createReportHandler } from '../../api/report';
import { createJoinRoomHandler } from '../../api/room/[code]/join';
import { createRoom, MemoryRoomStore } from '../../lib/room/lifecycle';
import { MemoryModerationStore, setHandleBan } from '../../lib/security/reports';

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://gdo.ax0x.ai/api/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function get(headers: Record<string, string> = {}): Request {
  return new Request('https://gdo.ax0x.ai/api/test', { method: 'GET', headers });
}

describe('moderation API handlers', () => {
  test('submits and deduplicates reports', async () => {
    const store = new MemoryModerationStore();
    const handler = createReportHandler({ store, nowIso: () => '2026-05-18T00:00:00.000Z' });

    const firstResponse = await handler(post({
      reporterHandle: '@Fufu',
      targetHandle: '@Momo',
      gameId: 'ROOM-A2A2A2',
      reason: 'cheat',
      description: 'same move timing every turn',
    }));
    const duplicateResponse = await handler(post({
      reporterHandle: 'fufu',
      targetHandle: 'momo',
      gameId: 'ROOM-A2A2A2',
      reason: 'abuse',
    }));

    expect(firstResponse.status).toBe(200);
    expect(await firstResponse.json()).toMatchObject({ ok: true, duplicate: false, report: { reporterHandle: 'fufu' } });
    expect(duplicateResponse.status).toBe(200);
    expect(await duplicateResponse.json()).toMatchObject({ ok: true, duplicate: true, report: { reason: 'cheat' } });
  });

  test('validates report requests and honors injected rate limiter', async () => {
    const store = new MemoryModerationStore();
    const limited = createReportHandler({
      store,
      rateLimiter: {
        async check() {
          return { allowed: false, remaining: 0, resetAt: 7_000 };
        },
      },
    });
    const handler = createReportHandler({ store });

    const invalid = await handler(post({
      reporterHandle: 'fufu',
      targetHandle: 'momo',
      gameId: 'bad room',
      reason: 'cheat',
    }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ ok: false, error: 'ERR_INVALID_GAME_ID' });

    const limitedResponse = await limited(post({
      reporterHandle: 'fufu',
      targetHandle: 'momo',
      gameId: 'ROOM-A2A2A2',
      reason: 'cheat',
    }));
    expect(limitedResponse.status).toBe(429);
    expect(await limitedResponse.json()).toEqual({ ok: false, error: 'ERR_RATE_LIMITED' });
  });

  test('gates admin report listing by token', async () => {
    const store = new MemoryModerationStore();
    await createReportHandler({ store, nowIso: () => '2026-05-18T00:00:00.000Z' })(post({
      reporterHandle: 'fufu',
      targetHandle: 'momo',
      gameId: 'ROOM-A2A2A2',
      reason: 'collusion',
    }));
    const handler = createAdminReportsHandler({ store, adminToken: 'secret' });

    expect((await handler(get())).status).toBe(403);

    const response = await handler(get({ authorization: 'Bearer secret' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, reports: [{ targetHandle: 'momo', reason: 'collusion' }] });
  });

  test('admin can ban, unban, and mark stat resets', async () => {
    const store = new MemoryModerationStore();
    const ban = createAdminBanHandler({ store, adminToken: 'secret', nowIso: () => '2026-05-18T00:00:00.000Z' });
    const resetStats = createAdminResetStatsHandler({ store, adminToken: 'secret', nowIso: () => '2026-05-18T00:05:00.000Z' });

    const banResponse = await ban(post({ handle: '@Momo', banned: true, reason: 'confirmed abuse' }, { 'x-admin-token': 'secret' }));
    expect(banResponse.status).toBe(200);
    expect(await banResponse.json()).toMatchObject({ ok: true, player: { handle: 'momo', banned: true } });

    const resetResponse = await resetStats(post({ handle: 'momo' }, { 'x-admin-token': 'secret' }));
    expect(resetResponse.status).toBe(200);
    expect(await resetResponse.json()).toMatchObject({ ok: true, player: { statsResetAt: '2026-05-18T00:05:00.000Z' } });

    const unbanResponse = await ban(post({ handle: 'momo', banned: false }, { 'x-admin-token': 'secret' }));
    expect(unbanResponse.status).toBe(200);
    expect(await unbanResponse.json()).toMatchObject({ ok: true, player: { handle: 'momo', banned: false } });
  });

  test('banned handles cannot join rooms', async () => {
    const roomStore = new MemoryRoomStore();
    const moderationStore = new MemoryModerationStore();
    const created = await createRoom(roomStore, { hostHandle: 'host1', random: () => 0 });
    await setHandleBan(moderationStore, {
      handle: 'momo',
      banned: true,
      nowIso: () => '2026-05-18T00:00:00.000Z',
    });

    const join = createJoinRoomHandler({ store: roomStore, moderationStore });
    const response = await join(post({ handle: '@Momo', token: created.joinToken }), { code: created.room.code });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: 'ERR_ACCOUNT_SUSPENDED' });
  });
});
