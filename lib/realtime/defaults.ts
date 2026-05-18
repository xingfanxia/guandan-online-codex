import { MemoryEventLog, type EventLog } from './eventLog';
import { MemoryIdempotencyStore, type IdempotencyStore } from './idempotency';
import { MemoryGameStateStore, type GameStateStore } from './stateStore';
import { resolveUpstashRestConfig, type UpstashRestEnv } from './upstashEnv';
import { UpstashEventLog, UpstashGameStateStore, UpstashIdempotencyStore, UpstashPublisher, UpstashRedis } from './upstashRest';
import type { RealtimePublisher } from './upstash';

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
