import type { GameState, PlayerId } from '../game/state';
import type { EventLog, LoggedEvent } from './eventLog';
import { playerEventStream } from './eventLog';
import type { IdempotencyRecord, IdempotencyStore } from './idempotency';
import type { ClientPayload } from './payload';
import type { GameStateStore } from './stateStore';
import type { RealtimePublisher } from './upstash';

type RedisArgument = string | number;

interface UpstashResponse<T> {
  result?: T;
  error?: string;
}

export interface UpstashRedisOptions {
  url: string;
  token: string;
  fetcher?: typeof fetch;
}

export class UpstashRedis {
  private readonly url: string;
  private readonly token: string;
  private readonly fetcher: typeof fetch;

  constructor({ url, token, fetcher = fetch }: UpstashRedisOptions) {
    this.url = url.replace(/\/+$/, '');
    this.token = token;
    this.fetcher = fetcher;
  }

  async command<T>(command: readonly RedisArgument[]): Promise<T> {
    const response = await this.fetcher(this.url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(command),
    });
    const payload = await response.json() as UpstashResponse<T>;
    if (!response.ok || payload.error) {
      throw new Error(payload.error ?? `ERR_UPSTASH_HTTP_${response.status}`);
    }
    return payload.result as T;
  }
}

export class UpstashPublisher implements RealtimePublisher {
  constructor(private readonly redis: UpstashRedis) {}

  async publish(channel: string, payload: string): Promise<void> {
    await this.redis.command<number>(['PUBLISH', channel, payload]);
  }
}

export class UpstashGameStateStore implements GameStateStore {
  constructor(private readonly redis: UpstashRedis) {}

  async get(roomId: string): Promise<GameState | undefined> {
    const raw = await this.redis.command<string | null>(['GET', stateKey(roomId)]);
    return raw ? JSON.parse(raw) as GameState : undefined;
  }

  async set(roomId: string, state: GameState): Promise<void> {
    await this.redis.command<string>(['SET', stateKey(roomId), JSON.stringify(state)]);
  }
}

export class UpstashIdempotencyStore implements IdempotencyStore {
  constructor(private readonly redis: UpstashRedis) {}

  async get<T>(key: string, nowMs: number): Promise<IdempotencyRecord<T> | undefined> {
    const raw = await this.redis.command<string | null>(['GET', key]);
    if (!raw) return undefined;
    const record = JSON.parse(raw) as IdempotencyRecord<T>;
    return record.expiresAtMs > nowMs ? record : undefined;
  }

  async setPending(key: string, ttlSeconds: number, nowMs: number): Promise<void> {
    await this.redis.command<string>(['SET', key, JSON.stringify(pendingRecord(nowMs, ttlSeconds)), 'EX', ttlSeconds]);
  }

  async setPendingIfAbsent(key: string, ttlSeconds: number, nowMs: number): Promise<boolean> {
    const result = await this.redis.command<string | null>([
      'SET',
      key,
      JSON.stringify(pendingRecord(nowMs, ttlSeconds)),
      'NX',
      'EX',
      ttlSeconds,
    ]);
    return result === 'OK';
  }

  async setCompleted<T>(key: string, response: T, ttlSeconds: number, nowMs: number): Promise<void> {
    const record: IdempotencyRecord<T> = {
      state: 'completed',
      response,
      expiresAtMs: nowMs + ttlSeconds * 1_000,
    };
    await this.redis.command<string>(['SET', key, JSON.stringify(record), 'EX', ttlSeconds]);
  }
}

export class UpstashEventLog implements EventLog {
  private readonly maxLength: number;

  constructor(private readonly redis: UpstashRedis, { maxLength = 1_000 }: { maxLength?: number } = {}) {
    this.maxLength = maxLength;
  }

  async append(roomId: string, playerId: PlayerId, payload: ClientPayload): Promise<LoggedEvent> {
    const id = await this.redis.command<string>([
      'XADD',
      playerEventStream(roomId, playerId),
      'MAXLEN',
      '~',
      this.maxLength,
      '*',
      'payload',
      JSON.stringify(payload),
    ]);
    return { id, payload: clonePayload(payload) };
  }

  async replayAfter(roomId: string, playerId: PlayerId, lastEventId?: string): Promise<LoggedEvent[]> {
    const start = lastEventId ? `(${lastEventId}` : '-';
    const entries = await this.redis.command<Array<[string, string[]]>>([
      'XRANGE',
      playerEventStream(roomId, playerId),
      start,
      '+',
    ]);
    return entries.map(([id, fields]) => ({
      id,
      payload: parsePayload(fields),
    }));
  }
}

function stateKey(roomId: string): string {
  return `game:${roomId}:state`;
}

function pendingRecord(nowMs: number, ttlSeconds: number): IdempotencyRecord<never> {
  return {
    state: 'pending',
    expiresAtMs: nowMs + ttlSeconds * 1_000,
  };
}

function parsePayload(fields: readonly string[]): ClientPayload {
  const payloadIndex = fields.indexOf('payload');
  if (payloadIndex < 0 || payloadIndex + 1 >= fields.length) throw new Error('ERR_EVENT_STREAM_MALFORMED');
  return JSON.parse(fields[payloadIndex + 1]!) as ClientPayload;
}

function clonePayload(payload: ClientPayload): ClientPayload {
  return JSON.parse(JSON.stringify(payload)) as ClientPayload;
}
