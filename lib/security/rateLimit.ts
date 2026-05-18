import { resolveUpstashRestConfig, type UpstashRestEnv } from '../realtime/upstashEnv.js';
import { UpstashRedis } from '../realtime/upstashRest.js';
import { clientIpFromRequest } from './requestIp.js';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export interface RequestRateLimiter {
  check(request: Request): Promise<RateLimitResult>;
}

export interface MemoryRateLimiterOptions {
  scope: string;
  limit: number;
  windowMs: number;
  nowMs?: () => number;
}

export interface RedisCommandClient {
  command<T>(command: readonly (string | number)[]): Promise<T>;
}

export interface UpstashRateLimiterOptions extends MemoryRateLimiterOptions {
  redis: RedisCommandClient;
}

export interface DefaultRateLimiterOptions extends MemoryRateLimiterOptions {
  env?: UpstashRestEnv;
  fetcher?: typeof fetch;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export function rateLimitKey(request: Request, scope: string): string {
  return `${scope}:${clientIpFromRequest(request)}`;
}

export function createMemoryRateLimiter({
  scope,
  limit,
  windowMs,
  nowMs = Date.now,
}: MemoryRateLimiterOptions): RequestRateLimiter {
  const buckets = new Map<string, Bucket>();

  return {
    async check(request: Request): Promise<RateLimitResult> {
      const now = nowMs();
      const key = rateLimitKey(request, scope);
      const current = buckets.get(key);
      const bucket = !current || current.resetAt <= now
        ? { count: 0, resetAt: now + windowMs }
        : current;

      if (bucket.count >= limit) {
        buckets.set(key, bucket);
        return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
      }

      bucket.count += 1;
      buckets.set(key, bucket);
      return { allowed: true, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
    },
  };
}

export function createUpstashRateLimiter({
  scope,
  limit,
  windowMs,
  redis,
  nowMs = Date.now,
}: UpstashRateLimiterOptions): RequestRateLimiter {
  return {
    async check(request: Request): Promise<RateLimitResult> {
      const now = nowMs();
      const bucket = Math.floor(now / windowMs);
      const resetAt = (bucket + 1) * windowMs;
      const key = `rate:${rateLimitKey(request, scope)}:${bucket}`;
      const count = await redis.command<number>(['INCR', key]);
      if (count === 1) await redis.command<string>(['PEXPIRE', key, windowMs]);
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        resetAt,
      };
    },
  };
}

export function createDefaultRateLimiter({
  scope,
  limit,
  windowMs,
  nowMs,
  env = process.env,
  fetcher,
}: DefaultRateLimiterOptions): RequestRateLimiter {
  const config = resolveUpstashRestConfig(env);
  if (config) {
    const redis = new UpstashRedis({
      ...config,
      ...(fetcher ? { fetcher } : {}),
    });
    return createUpstashRateLimiter({ scope, limit, windowMs, redis, ...(nowMs ? { nowMs } : {}) });
  }
  return createMemoryRateLimiter({ scope, limit, windowMs, ...(nowMs ? { nowMs } : {}) });
}

export async function enforceRateLimit(
  request: Request,
  limiter: RequestRateLimiter | undefined,
  nowMs: number,
): Promise<Response | undefined> {
  if (!limiter) return undefined;
  const rate = await limiter.check(request);
  return rate.allowed ? undefined : rateLimitResponse(rate.resetAt, nowMs);
}

export function rateLimitResponse(resetAt: number, nowMs: number): Response {
  return new Response(JSON.stringify({ ok: false, error: 'ERR_RATE_LIMITED' }), {
    status: 429,
    headers: {
      'content-type': 'application/json',
      'retry-after': String(Math.max(1, Math.ceil((resetAt - nowMs) / 1000))),
    },
  });
}
