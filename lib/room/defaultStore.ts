import { MemoryRoomStore } from './lifecycle';
import { UpstashRoomStore } from './upstashStore';
import { resolveUpstashRestConfig, type UpstashRestEnv } from '../realtime/upstashEnv';
import { UpstashRedis } from '../realtime/upstashRest';

export type RoomStoreEnv = UpstashRestEnv;

export function createDefaultRoomStore(env: RoomStoreEnv = process.env): MemoryRoomStore | UpstashRoomStore {
  const config = resolveUpstashRestConfig(env);
  if (config) {
    return new UpstashRoomStore(new UpstashRedis(config));
  }
  return new MemoryRoomStore();
}

export const defaultRoomStore = createDefaultRoomStore();
