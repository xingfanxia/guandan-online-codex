import { MemoryRoomStore } from './lifecycle.js';
import { UpstashRoomStore } from './upstashStore.js';
import { resolveUpstashRestConfig, type UpstashRestEnv } from '../realtime/upstashEnv.js';
import { UpstashRedis } from '../realtime/upstashRest.js';

export type RoomStoreEnv = UpstashRestEnv;

export function createDefaultRoomStore(env: RoomStoreEnv = process.env): MemoryRoomStore | UpstashRoomStore {
  const config = resolveUpstashRestConfig(env);
  if (config) {
    return new UpstashRoomStore(new UpstashRedis(config));
  }
  return new MemoryRoomStore();
}

export const defaultRoomStore = createDefaultRoomStore();
