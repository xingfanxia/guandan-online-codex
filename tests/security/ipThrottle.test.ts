import { describe, expect, test } from 'vitest';
import { clientIpFromRequest } from '../../lib/security/requestIp';
import {
  MemoryIpThrottleStore,
  checkIpThrottle,
} from '../../lib/security/ipThrottle';

function request(headers: Record<string, string> = {}): Request {
  return new Request('https://gdo.ax0x.ai/api/auth/createHandle', { headers });
}

describe('IP throttle', () => {
  test('extracts the first forwarded IP with x-real-ip fallback', () => {
    expect(clientIpFromRequest(request({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toBe('203.0.113.9');
    expect(clientIpFromRequest(request({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7');
    expect(clientIpFromRequest(request())).toBe('unknown');
  });

  test('allows the configured number of attempts then blocks until the window resets', async () => {
    let now = 1_000;
    const store = new MemoryIpThrottleStore(() => now);
    const options = { scope: 'acct-create', limit: 5, windowMs: 86_400_000 };
    const req = request({ 'x-forwarded-for': '203.0.113.9' });

    for (let index = 0; index < 5; index++) {
      const result = await checkIpThrottle(store, req, options);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4 - index);
    }

    const blocked = await checkIpThrottle(store, req, options);
    expect(blocked).toMatchObject({
      allowed: false,
      remaining: 0,
      resetAt: 86_401_000,
      key: 'ip:acct-create:203.0.113.9',
    });

    now = 86_401_000;
    await expect(checkIpThrottle(store, req, options)).resolves.toMatchObject({ allowed: true, remaining: 4 });
  });
});
