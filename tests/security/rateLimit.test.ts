import { describe, expect, test } from 'vitest';
import {
  createDefaultRateLimiter,
  createMemoryRateLimiter,
  createUpstashRateLimiter,
  rateLimitKey,
  rateLimitResponse,
} from '../../lib/security/rateLimit';

describe('rate limiting', () => {
  test('uses forwarded IP plus scope as the limiter key', () => {
    const request = new Request('https://gdo.ax0x.ai/api/move', {
      headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' },
    });

    expect(rateLimitKey(request, 'move')).toBe('move:203.0.113.1');
  });

  test('allows requests inside the window and rejects once the limit is exceeded', async () => {
    let now = 1_000;
    const limiter = createMemoryRateLimiter({ scope: 'move', limit: 2, windowMs: 5_000, nowMs: () => now });
    const request = new Request('https://gdo.ax0x.ai/api/move', {
      headers: { 'x-forwarded-for': '203.0.113.2' },
    });

    expect(await limiter.check(request)).toMatchObject({ allowed: true, remaining: 1 });
    expect(await limiter.check(request)).toMatchObject({ allowed: true, remaining: 0 });
    expect(await limiter.check(request)).toMatchObject({ allowed: false, remaining: 0 });

    now = 6_001;
    expect(await limiter.check(request)).toMatchObject({ allowed: true, remaining: 1 });
  });

  test('uses Upstash fixed-window keys for distributed limiting', async () => {
    const commands: unknown[] = [];
    const limiter = createUpstashRateLimiter({
      scope: 'move',
      limit: 2,
      windowMs: 5_000,
      nowMs: () => 12_000,
      redis: {
        async command<T>(command: readonly (string | number)[]): Promise<T> {
          commands.push(command);
          return (command[0] === 'INCR' ? 1 : 'OK') as T;
        },
      },
    });
    const result = await limiter.check(new Request('https://gdo.ax0x.ai/api/move', {
      headers: { 'x-forwarded-for': '203.0.113.3' },
    }));

    expect(result).toEqual({ allowed: true, remaining: 1, resetAt: 15_000 });
    expect(commands).toEqual([
      ['INCR', 'rate:move:203.0.113.3:2'],
      ['PEXPIRE', 'rate:move:203.0.113.3:2', 5000],
    ]);
  });

  test('creates Upstash default limiter when Redis env exists', async () => {
    const limiter = createDefaultRateLimiter({
      scope: 'move',
      limit: 1,
      windowMs: 5_000,
      env: {
        UPSTASH_REDIS_REST_URL: 'https://redis.example',
        UPSTASH_REDIS_REST_TOKEN: 'token',
      },
      fetcher: async () => new Response(JSON.stringify({ result: 1 })),
    });

    expect(await limiter.check(new Request('https://gdo.ax0x.ai/api/move'))).toMatchObject({
      allowed: true,
      remaining: 0,
    });
  });

  test('creates Upstash default limiter from Vercel Marketplace KV env', async () => {
    const limiter = createDefaultRateLimiter({
      scope: 'move',
      limit: 1,
      windowMs: 5_000,
      env: {
        KV_REST_API_URL: 'https://redis.example',
        KV_REST_API_TOKEN: 'token',
      },
      fetcher: async () => new Response(JSON.stringify({ result: 1 })),
    });

    expect(await limiter.check(new Request('https://gdo.ax0x.ai/api/move'))).toMatchObject({
      allowed: true,
      remaining: 0,
    });
  });

  test('formats retry-after response from reset timestamp', async () => {
    const response = rateLimitResponse(7_000, 1_000);

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('6');
    expect(await response.json()).toEqual({ ok: false, error: 'ERR_RATE_LIMITED' });
  });
});
