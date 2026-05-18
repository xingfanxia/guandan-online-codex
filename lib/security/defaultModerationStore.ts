import { resolveUpstashRestConfig, type UpstashRestEnv } from '../realtime/upstashEnv.js';
import { UpstashRedis } from '../realtime/upstashRest.js';
import { MemoryModerationStore, UpstashModerationStore } from './reports.js';

export type ModerationStoreEnv = UpstashRestEnv;

export function createDefaultModerationStore(
  env: ModerationStoreEnv = process.env,
): MemoryModerationStore | UpstashModerationStore {
  const config = resolveUpstashRestConfig(env);
  if (config) {
    return new UpstashModerationStore(new UpstashRedis(config));
  }
  return new MemoryModerationStore();
}

export const defaultModerationStore = createDefaultModerationStore();
