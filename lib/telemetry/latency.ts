import type { UpstashRedis } from '../realtime/upstashRest';

type MaybePromise<T> = T | Promise<T>;

export interface LatencySample {
  route: string;
  durationMs: number;
  region: string;
  createdAt: string;
}

export interface LatencyAggregate {
  route: string;
  region: string;
  count: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface LatencyStore {
  save(sample: LatencySample): MaybePromise<void>;
  listRecent(limit?: number): MaybePromise<LatencySample[]>;
}

export type LatencyError =
  | 'ERR_INVALID_ROUTE'
  | 'ERR_INVALID_DURATION'
  | 'ERR_INVALID_REGION';

export class MemoryLatencyStore implements LatencyStore {
  private readonly samples: LatencySample[] = [];

  async save(sample: LatencySample): Promise<void> {
    this.samples.unshift({ ...sample });
  }

  async listRecent(limit = 1_000): Promise<LatencySample[]> {
    return this.samples.slice(0, limit).map((sample) => ({ ...sample }));
  }
}

export class UpstashLatencyStore implements LatencyStore {
  constructor(private readonly redis: UpstashRedis, private readonly maxLength = 5_000) {}

  async save(sample: LatencySample): Promise<void> {
    await this.redis.command<number>([
      'LPUSH',
      latencyKey(),
      JSON.stringify(sample),
    ]);
    await this.redis.command<string>(['LTRIM', latencyKey(), 0, this.maxLength - 1]);
  }

  async listRecent(limit = 1_000): Promise<LatencySample[]> {
    const rows = await this.redis.command<string[]>(['LRANGE', latencyKey(), 0, Math.max(0, limit - 1)]);
    return rows.map((row) => JSON.parse(row) as LatencySample);
  }
}

export async function recordLatencySample(
  store: LatencyStore,
  input: { route?: unknown; durationMs?: unknown; region?: unknown },
  { nowIso = () => new Date().toISOString() }: { nowIso?: () => string } = {},
): Promise<{ ok: true; sample: LatencySample } | { ok: false; error: LatencyError }> {
  if (!isValidRoute(input.route)) return { ok: false, error: 'ERR_INVALID_ROUTE' };
  if (!isValidDuration(input.durationMs)) return { ok: false, error: 'ERR_INVALID_DURATION' };
  if (input.region !== undefined && !isValidRegion(input.region)) return { ok: false, error: 'ERR_INVALID_REGION' };

  const sample: LatencySample = {
    route: input.route,
    durationMs: Math.round(input.durationMs),
    region: typeof input.region === 'string' ? input.region.toUpperCase() : 'unknown',
    createdAt: nowIso(),
  };
  await store.save(sample);
  return { ok: true, sample: { ...sample } };
}

export function aggregateLatency(samples: readonly LatencySample[]): LatencyAggregate[] {
  const groups = new Map<string, LatencySample[]>();
  for (const sample of samples) {
    const key = `${sample.route}\n${sample.region}`;
    groups.set(key, [...(groups.get(key) ?? []), sample]);
  }

  return [...groups.values()]
    .map((group) => {
      const first = group[0]!;
      const durations = group.map((sample) => sample.durationMs).sort((a, b) => a - b);
      return {
        route: first.route,
        region: first.region,
        count: durations.length,
        p50: percentile(durations, 0.5),
        p95: percentile(durations, 0.95),
        p99: percentile(durations, 0.99),
      };
    })
    .sort((a, b) => a.route.localeCompare(b.route) || a.region.localeCompare(b.region));
}

function isValidRoute(route: unknown): route is string {
  return typeof route === 'string'
    && /^\/api\/[A-Za-z0-9/_-]{1,100}$/.test(route)
    && !route.includes('//');
}

function isValidDuration(durationMs: unknown): durationMs is number {
  return typeof durationMs === 'number'
    && Number.isFinite(durationMs)
    && durationMs >= 0
    && durationMs <= 60_000;
}

function isValidRegion(region: unknown): region is string {
  return typeof region === 'string' && (/^[A-Z]{2}$/.test(region.toUpperCase()) || region === 'unknown');
}

function percentile(sortedValues: readonly number[], percentileValue: number): number {
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1),
  );
  return sortedValues[index]!;
}

function latencyKey(): string {
  return 'go:telemetry:latency';
}
