import { UpstashRedis } from '../realtime/upstashRest';
import { MemoryModerationStore, UpstashModerationStore } from './reports';

export interface ModerationStoreEnv {
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
}

export function createDefaultModerationStore(
  env: ModerationStoreEnv = process.env,
): MemoryModerationStore | UpstashModerationStore {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return new UpstashModerationStore(new UpstashRedis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    }));
  }
  return new MemoryModerationStore();
}

export const defaultModerationStore = createDefaultModerationStore();
