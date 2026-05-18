import { resolveUpstashRestConfig, type UpstashRestEnv } from '../realtime/upstashEnv';
import { UpstashRedis } from '../realtime/upstashRest';
import { MemoryLatencyStore, UpstashLatencyStore } from './latency';

export type LatencyStoreEnv = UpstashRestEnv;

export function createDefaultLatencyStore(
  env: LatencyStoreEnv = process.env,
): MemoryLatencyStore | UpstashLatencyStore {
  const config = resolveUpstashRestConfig(env);
  if (config) {
    return new UpstashLatencyStore(new UpstashRedis(config));
  }
  return new MemoryLatencyStore();
}

export const defaultLatencyStore = createDefaultLatencyStore();
