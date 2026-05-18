import { describe, expect, test } from 'vitest';
import { createCreateHandleHandler } from '../../api/auth/createHandle';
import { MemoryPlayerProfileStore } from '../../lib/auth/playerProfile';
import { MemoryIpThrottleStore } from '../../lib/security/ipThrottle';

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://gdo.ax0x.ai/api/auth/createHandle', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('api/auth/createHandle', () => {
  test('creates a normalized online player profile', async () => {
    const profiles = new MemoryPlayerProfileStore();
    const handler = createCreateHandleHandler({
      profiles,
      throttleStore: new MemoryIpThrottleStore(() => 1_000),
      nowIso: () => '2026-05-18T00:00:00.000Z',
      nowMs: () => 1_000,
    });

    const response = await handler(post({ handle: '@Fufu' }, { 'x-forwarded-for': '203.0.113.9' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      profile: {
        handle: 'fufu',
        createdAt: '2026-05-18T00:00:00.000Z',
        createIp: '203.0.113.9',
      },
    });
    expect(profiles.get('fufu')).toMatchObject({ handle: 'fufu' });
  });

  test('rejects duplicate and invalid handles', async () => {
    const profiles = new MemoryPlayerProfileStore();
    const handler = createCreateHandleHandler({
      profiles,
      throttleStore: new MemoryIpThrottleStore(() => 1_000),
    });

    expect((await handler(post({ handle: 'bad handle' }))).status).toBe(400);

    const first = await handler(post({ handle: 'momo' }));
    const second = await handler(post({ handle: '@Momo' }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ ok: false, error: 'ERR_HANDLE_TAKEN' });
  });

  test('blocks the sixth handle creation from the same IP in a 24h window', async () => {
    const handler = createCreateHandleHandler({
      profiles: new MemoryPlayerProfileStore(),
      throttleStore: new MemoryIpThrottleStore(() => 1_000),
      nowIso: () => '2026-05-18T00:00:00.000Z',
      nowMs: () => 1_000,
    });

    for (const handle of ['aa1', 'aa2', 'aa3', 'aa4', 'aa5']) {
      expect((await handler(post({ handle }, { 'x-forwarded-for': '203.0.113.9' }))).status).toBe(200);
    }

    const blocked = await handler(post({ handle: 'aa6' }, { 'x-forwarded-for': '203.0.113.9' }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBe('86400');
    expect(await blocked.json()).toEqual({ ok: false, error: 'ERR_IP_THROTTLED' });
  });
});
