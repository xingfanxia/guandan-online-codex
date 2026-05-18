import { resolveUpstashRestConfig, type UpstashRestEnv } from '../realtime/upstashEnv.js';
import { UpstashRedis } from '../realtime/upstashRest.js';
import { MemoryPlayerProfileStore, UpstashPlayerProfileStore } from './playerProfile.js';

export type PlayerProfileStoreEnv = UpstashRestEnv;

export function createDefaultPlayerProfileStore(
  env: PlayerProfileStoreEnv = process.env,
): MemoryPlayerProfileStore | UpstashPlayerProfileStore {
  const config = resolveUpstashRestConfig(env);
  if (config) {
    return new UpstashPlayerProfileStore(new UpstashRedis(config));
  }
  return new MemoryPlayerProfileStore();
}

export const defaultPlayerProfileStore = createDefaultPlayerProfileStore();
