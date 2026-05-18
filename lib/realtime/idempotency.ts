export type IdempotencyRecord<T> =
  | { state: 'pending'; expiresAtMs: number }
  | { state: 'completed'; response: T; expiresAtMs: number };

type MaybePromise<T> = T | Promise<T>;

export type IdempotencyStart<T> =
  | { status: 'started' }
  | { status: 'pending' }
  | { status: 'replay'; response: T };

export interface IdempotencyStore {
  get<T>(key: string, nowMs: number): MaybePromise<IdempotencyRecord<T> | undefined>;
  setPending(key: string, ttlSeconds: number, nowMs: number): MaybePromise<void>;
  setPendingIfAbsent?(key: string, ttlSeconds: number, nowMs: number): MaybePromise<boolean>;
  setCompleted<T>(key: string, response: T, ttlSeconds: number, nowMs: number): MaybePromise<void>;
}

export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord<unknown>>();

  get<T>(key: string, nowMs: number): IdempotencyRecord<T> | undefined {
    const record = this.records.get(key) as IdempotencyRecord<T> | undefined;
    if (!record) return undefined;
    if (record.expiresAtMs <= nowMs) {
      this.records.delete(key);
      return undefined;
    }
    return record;
  }

  setPending(key: string, ttlSeconds: number, nowMs: number): void {
    this.records.set(key, { state: 'pending', expiresAtMs: nowMs + ttlSeconds * 1_000 });
  }

  setPendingIfAbsent(key: string, ttlSeconds: number, nowMs: number): boolean {
    if (this.get(key, nowMs)) return false;
    this.setPending(key, ttlSeconds, nowMs);
    return true;
  }

  setCompleted<T>(key: string, response: T, ttlSeconds: number, nowMs: number): void {
    this.records.set(key, { state: 'completed', response, expiresAtMs: nowMs + ttlSeconds * 1_000 });
  }
}

export async function startIdempotentOperation<T>(
  store: IdempotencyStore,
  key: string,
  ttlSeconds: number,
  nowMs = Date.now(),
): Promise<IdempotencyStart<T>> {
  const existing = await store.get<T>(key, nowMs);
  if (existing?.state === 'pending') return { status: 'pending' };
  if (existing?.state === 'completed') return { status: 'replay', response: existing.response };

  if (store.setPendingIfAbsent) {
    const reserved = await store.setPendingIfAbsent(key, ttlSeconds, nowMs);
    if (!reserved) {
      const raced = await store.get<T>(key, nowMs);
      if (raced?.state === 'completed') return { status: 'replay', response: raced.response };
      return { status: 'pending' };
    }
    return { status: 'started' };
  }

  await store.setPending(key, ttlSeconds, nowMs);
  return { status: 'started' };
}

export async function completeIdempotentOperation<T>(
  store: IdempotencyStore,
  key: string,
  response: T,
  ttlSeconds: number,
  nowMs = Date.now(),
): Promise<void> {
  await store.setCompleted(key, response, ttlSeconds, nowMs);
}
