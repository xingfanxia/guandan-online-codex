import { describe, expect, test } from 'vitest';
import {
  MemoryModerationStore,
  isHandleBanned,
  resetPlayerStats,
  setHandleBan,
  submitReport,
} from '../../lib/security/reports';

describe('moderation reports', () => {
  test('normalizes handles and deduplicates one report per reporter target game', async () => {
    const store = new MemoryModerationStore();
    const first = await submitReport(store, {
      reporterHandle: '@Fufu',
      targetHandle: '@Momo',
      gameId: 'ROOM-A2A2A2',
      reason: 'cheat',
      description: 'impossible move timing',
    }, { nowIso: () => '2026-05-18T00:00:00.000Z' });
    const duplicate = await submitReport(store, {
      reporterHandle: 'fufu',
      targetHandle: 'momo',
      gameId: 'ROOM-A2A2A2',
      reason: 'collusion',
    }, { nowIso: () => '2026-05-18T00:01:00.000Z' });

    expect(first).toMatchObject({
      ok: true,
      duplicate: false,
      report: {
        id: 'report:fufu:momo:ROOM-A2A2A2',
        reporterHandle: 'fufu',
        targetHandle: 'momo',
        reason: 'cheat',
        status: 'open',
      },
    });
    expect(duplicate).toMatchObject({ ok: true, duplicate: true, report: { reason: 'cheat' } });
    expect(store.listReports()).toHaveLength(1);
  });

  test('rejects invalid report input with named errors', async () => {
    const store = new MemoryModerationStore();

    await expect(submitReport(store, {
      reporterHandle: 'bad handle',
      targetHandle: 'momo',
      gameId: 'ROOM-A2A2A2',
      reason: 'cheat',
    })).resolves.toEqual({ ok: false, error: 'ERR_INVALID_REPORTER' });

    await expect(submitReport(store, {
      reporterHandle: 'fufu',
      targetHandle: 'fufu',
      gameId: 'ROOM-A2A2A2',
      reason: 'cheat',
    })).resolves.toEqual({ ok: false, error: 'ERR_REPORT_SELF' });

    await expect(submitReport(store, {
      reporterHandle: 'fufu',
      targetHandle: 'momo',
      gameId: 'bad room',
      reason: 'cheat',
    })).resolves.toEqual({ ok: false, error: 'ERR_INVALID_GAME_ID' });

    await expect(submitReport(store, {
      reporterHandle: 'fufu',
      targetHandle: 'momo',
      gameId: 'ROOM-A2A2A2',
      reason: 'spam',
    })).resolves.toEqual({ ok: false, error: 'ERR_INVALID_REASON' });
  });

  test('stores bans and stat reset markers for admin actions', async () => {
    const store = new MemoryModerationStore();

    await setHandleBan(store, {
      handle: '@Momo',
      banned: true,
      reason: 'confirmed scripted client',
      nowIso: () => '2026-05-18T00:00:00.000Z',
    });
    expect(await isHandleBanned(store, 'momo')).toBe(true);

    const reset = await resetPlayerStats(store, {
      handle: 'momo',
      nowIso: () => '2026-05-18T00:05:00.000Z',
    });
    expect(reset).toMatchObject({ ok: true, player: { handle: 'momo', statsResetAt: '2026-05-18T00:05:00.000Z' } });

    await setHandleBan(store, {
      handle: 'momo',
      banned: false,
      nowIso: () => '2026-05-18T00:10:00.000Z',
    });
    expect(await isHandleBanned(store, 'momo')).toBe(false);
  });
});
