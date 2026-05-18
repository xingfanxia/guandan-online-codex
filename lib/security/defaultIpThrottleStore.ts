import { resolveUpstashRestConfig, type UpstashRestEnv } from '../realtime/upstashEnv.js';
import { UpstashRedis } from '../realtime/upstashRest.js';
import { MemoryIpThrottleStore, UpstashIpThrottleStore } from './ipThrottle.js';

export type IpThrottleStoreEnv = UpstashRestEnv;

export function createDefaultIpThrottleStore(
  env: IpThrottleStoreEnv = process.env,
): MemoryIpThrottleStore | UpstashIpThrottleStore {
  const config = resolveUpstashRestConfig(env);
  if (config) {
    return new UpstashIpThrottleStore(new UpstashRedis(config));
  }
  return new MemoryIpThrottleStore();
}

export const defaultIpThrottleStore = createDefaultIpThrottleStore();
