import { UpstashRedis } from '../realtime/upstashRest';
import { MemoryIpThrottleStore, UpstashIpThrottleStore } from './ipThrottle';

export interface IpThrottleStoreEnv {
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
}

export function createDefaultIpThrottleStore(
  env: IpThrottleStoreEnv = process.env,
): MemoryIpThrottleStore | UpstashIpThrottleStore {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return new UpstashIpThrottleStore(new UpstashRedis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    }));
  }
  return new MemoryIpThrottleStore();
}

export const defaultIpThrottleStore = createDefaultIpThrottleStore();
