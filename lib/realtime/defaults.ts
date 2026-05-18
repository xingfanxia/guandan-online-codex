import { MemoryEventLog, type EventLog } from './eventLog.js';
import { MemoryIdempotencyStore, type IdempotencyStore } from './idempotency.js';
import { MemoryGameStateStore, type GameStateStore } from './stateStore.js';
import { resolveUpstashRestConfig, type UpstashRestEnv } from './upstashEnv.js';
import { UpstashEventLog, UpstashGameStateStore, UpstashIdempotencyStore, UpstashPublisher, UpstashRedis } from './upstashRest.js';
import type { RealtimePublisher } from './upstash.js';

export type RealtimeEnv = UpstashRestEnv;

export interface RealtimePersistence {
  backend: 'memory' | 'upstash';
  stateStore: GameStateStore;
  idempotency: IdempotencyStore;
  eventLog: EventLog;
  publisher: RealtimePublisher;
}

export function createDefaultRealtimePersistence(env: RealtimeEnv = process.env): RealtimePersistence {
  const config = resolveUpstashRestConfig(env);
  if (config) {
    const redis = new UpstashRedis(config);
    return {
      backend: 'upstash',
      stateStore: new UpstashGameStateStore(redis),
      idempotency: new UpstashIdempotencyStore(redis),
      eventLog: new UpstashEventLog(redis),
      publisher: new UpstashPublisher(redis),
    };
  }

  return {
    backend: 'memory',
    stateStore: new MemoryGameStateStore(),
    idempotency: new MemoryIdempotencyStore(),
    eventLog: new MemoryEventLog(),
    publisher: { async publish() {} },
  };
}

export const defaultRealtimePersistence = createDefaultRealtimePersistence();
