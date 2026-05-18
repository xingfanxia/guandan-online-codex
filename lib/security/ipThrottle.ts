import type { UpstashRedis } from '../realtime/upstashRest';
import { clientIpFromRequest } from './requestIp';

type MaybePromise<T> = T | Promise<T>;

export interface IpThrottleOptions {
  scope: string;
  limit: number;
  windowMs: number;
}

export interface IpThrottleResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  key: string;
  ip: string;
}

export interface IpThrottleStore {
  increment(key: string, windowMs: number): MaybePromise<{ count: number; resetAt: number }>;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export class MemoryIpThrottleStore implements IpThrottleStore {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly nowMs: () => number = Date.now) {}

  increment(key: string, windowMs: number): { count: number; resetAt: number } {
    const now = this.nowMs();
    const current = this.buckets.get(key);
    const bucket = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : current;
    bucket.count += 1;
    this.buckets.set(key, bucket);
    return { count: bucket.count, resetAt: bucket.resetAt };
  }
}

export class UpstashIpThrottleStore implements IpThrottleStore {
  constructor(private readonly redis: UpstashRedis) {}

  async increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const count = await this.redis.command<number>(['INCR', key]);
    if (count === 1) await this.redis.command<string>(['PEXPIRE', key, windowMs]);
    const ttl = await this.redis.command<number>(['PTTL', key]);
    return { count, resetAt: Date.now() + Math.max(0, ttl) };
  }
}

export async function checkIpThrottle(
  store: IpThrottleStore,
  request: Request,
  { scope, limit, windowMs }: IpThrottleOptions,
): Promise<IpThrottleResult> {
  const ip = clientIpFromRequest(request);
  const key = `ip:${scope}:${ip}`;
  const bucket = await store.increment(key, windowMs);
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    key,
    ip,
  };
}

export function ipThrottleResponse(result: IpThrottleResult, nowMs: number): Response {
  return new Response(JSON.stringify({ ok: false, error: 'ERR_IP_THROTTLED' }), {
    status: 429,
    headers: {
      'content-type': 'application/json',
      'retry-after': String(Math.max(1, Math.ceil((result.resetAt - nowMs) / 1000))),
    },
  });
}
