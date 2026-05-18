import { MemoryEventLog, type EventLog } from './eventLog';
import { MemoryIdempotencyStore, type IdempotencyStore } from './idempotency';
import { MemoryGameStateStore, type GameStateStore } from './stateStore';
import { UpstashEventLog, UpstashGameStateStore, UpstashIdempotencyStore, UpstashPublisher, UpstashRedis } from './upstashRest';
import type { RealtimePublisher } from './upstash';

export interface RealtimeEnv {
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
}

export interface RealtimePersistence {
  backend: 'memory' | 'upstash';
  stateStore: GameStateStore;
  idempotency: IdempotencyStore;
  eventLog: EventLog;
  publisher: RealtimePublisher;
}

export function createDefaultRealtimePersistence(env: RealtimeEnv = process.env): RealtimePersistence {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    const redis = new UpstashRedis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
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
