import { describe, expect, test } from 'vitest';
import {
  MemoryIdempotencyStore,
  completeIdempotentOperation,
  startIdempotentOperation,
} from '../../lib/realtime/idempotency';

describe('idempotency', () => {
  test('reserves a move id, reports pending duplicates, then replays completed response', async () => {
    const store = new MemoryIdempotencyStore();
    const first = await startIdempotentOperation(store, 'idem:room:move-1', 300, 1_000);
    const duplicatePending = await startIdempotentOperation(store, 'idem:room:move-1', 300, 1_001);

    expect(first).toEqual({ status: 'started' });
    expect(duplicatePending).toEqual({ status: 'pending' });

    await completeIdempotentOperation(store, 'idem:room:move-1', { ok: true, version: 2 }, 300, 1_002);
    const duplicateCompleted = await startIdempotentOperation<{ ok: boolean; version: number }>(
      store,
      'idem:room:move-1',
      300,
      1_003,
    );

    expect(duplicateCompleted).toEqual({ status: 'replay', response: { ok: true, version: 2 } });
  });

  test('allows reuse after TTL expiry', async () => {
    const store = new MemoryIdempotencyStore();

    await expect(startIdempotentOperation(store, 'idem:room:move-1', 5, 1_000)).resolves.toEqual({ status: 'started' });
    await expect(startIdempotentOperation(store, 'idem:room:move-1', 5, 6_001)).resolves.toEqual({ status: 'started' });
  });
});
