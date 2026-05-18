import { UpstashRedis } from '../realtime/upstashRest';
import { MemoryPlayerProfileStore, UpstashPlayerProfileStore } from './playerProfile';

export interface PlayerProfileStoreEnv {
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
}

export function createDefaultPlayerProfileStore(
  env: PlayerProfileStoreEnv = process.env,
): MemoryPlayerProfileStore | UpstashPlayerProfileStore {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return new UpstashPlayerProfileStore(new UpstashRedis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    }));
  }
  return new MemoryPlayerProfileStore();
}

export const defaultPlayerProfileStore = createDefaultPlayerProfileStore();
