import { UpstashRedis } from '../realtime/upstashRest';
import { MemoryLatencyStore, UpstashLatencyStore } from './latency';

export interface LatencyStoreEnv {
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
}

export function createDefaultLatencyStore(
  env: LatencyStoreEnv = process.env,
): MemoryLatencyStore | UpstashLatencyStore {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return new UpstashLatencyStore(new UpstashRedis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    }));
  }
  return new MemoryLatencyStore();
}

export const defaultLatencyStore = createDefaultLatencyStore();
