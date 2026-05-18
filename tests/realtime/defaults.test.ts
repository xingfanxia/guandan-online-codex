import { describe, expect, test } from 'vitest';
import { MemoryEventLog } from '../../lib/realtime/eventLog';
import { MemoryIdempotencyStore } from '../../lib/realtime/idempotency';
import { createDefaultRealtimePersistence } from '../../lib/realtime/defaults';
import { MemoryGameStateStore } from '../../lib/realtime/stateStore';
import { UpstashEventLog, UpstashGameStateStore, UpstashIdempotencyStore, UpstashPublisher } from '../../lib/realtime/upstashRest';

describe('default realtime persistence', () => {
  test('uses process-local memory stores when Upstash env is missing', () => {
    const deps = createDefaultRealtimePersistence({});

    expect(deps.backend).toBe('memory');
    expect(deps.stateStore).toBeInstanceOf(MemoryGameStateStore);
    expect(deps.idempotency).toBeInstanceOf(MemoryIdempotencyStore);
    expect(deps.eventLog).toBeInstanceOf(MemoryEventLog);
  });

  test('uses Upstash REST adapters when both env vars are present', () => {
    const deps = createDefaultRealtimePersistence({
      UPSTASH_REDIS_REST_URL: 'https://redis.example',
      UPSTASH_REDIS_REST_TOKEN: 'secret',
    });

    expect(deps.backend).toBe('upstash');
    expect(deps.stateStore).toBeInstanceOf(UpstashGameStateStore);
    expect(deps.idempotency).toBeInstanceOf(UpstashIdempotencyStore);
    expect(deps.eventLog).toBeInstanceOf(UpstashEventLog);
    expect(deps.publisher).toBeInstanceOf(UpstashPublisher);
  });
});
