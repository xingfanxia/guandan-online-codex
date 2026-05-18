import { MemoryRoomStore } from './lifecycle';
import { UpstashRoomStore } from './upstashStore';
import { UpstashRedis } from '../realtime/upstashRest';

export interface RoomStoreEnv {
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
}

export function createDefaultRoomStore(env: RoomStoreEnv = process.env): MemoryRoomStore | UpstashRoomStore {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return new UpstashRoomStore(new UpstashRedis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    }));
  }
  return new MemoryRoomStore();
}

export const defaultRoomStore = createDefaultRoomStore();
