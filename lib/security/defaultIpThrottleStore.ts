import { resolveUpstashRestConfig, type UpstashRestEnv } from '../realtime/upstashEnv';
import { UpstashRedis } from '../realtime/upstashRest';
import { MemoryIpThrottleStore, UpstashIpThrottleStore } from './ipThrottle';

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
