import { normalizeHandle, validateHandle } from '../auth/handle';

type MaybePromise<T> = T | Promise<T>;

export const REPORT_REASONS = ['cheat', 'collusion', 'abuse', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export type ReportStatus = 'open' | 'dismissed' | 'escalated';

export interface ReportRecord {
  id: string;
  reporterHandle: string;
  targetHandle: string;
  gameId: string;
  reason: ReportReason;
  status: ReportStatus;
  createdAt: string;
  description?: string;
}

export interface PlayerModerationRecord {
  handle: string;
  banned: boolean;
  updatedAt: string;
  bannedAt?: string;
  banReason?: string;
  statsResetAt?: string;
}

export interface ReportListFilter {
  status?: ReportStatus;
  targetHandle?: string;
  limit?: number;
}

export interface ModerationStore {
  getReport(id: string): MaybePromise<ReportRecord | undefined>;
  saveReport(report: ReportRecord): MaybePromise<boolean>;
  listReports(filter?: ReportListFilter): MaybePromise<ReportRecord[]>;
  getPlayer(handle: string): MaybePromise<PlayerModerationRecord | undefined>;
  setPlayer(player: PlayerModerationRecord): MaybePromise<void>;
}

export type ReportError =
  | 'ERR_INVALID_REPORTER'
  | 'ERR_INVALID_TARGET'
  | 'ERR_REPORT_SELF'
  | 'ERR_INVALID_GAME_ID'
  | 'ERR_INVALID_REASON'
  | 'ERR_DESCRIPTION_TOO_LONG';

export type SubmitReportResult =
  | { ok: true; duplicate: boolean; report: ReportRecord }
  | { ok: false; error: ReportError };

export interface RedisCommandClient {
  command<T>(command: readonly (string | number)[]): Promise<T>;
}

export interface SubmitReportInput {
  reporterHandle: unknown;
  targetHandle: unknown;
  gameId: unknown;
  reason: unknown;
  description?: unknown;
}

interface TimeOptions {
  nowIso?: () => string;
}

export class MemoryModerationStore implements ModerationStore {
  private readonly reports = new Map<string, ReportRecord>();
  private readonly players = new Map<string, PlayerModerationRecord>();

  getReport(id: string): ReportRecord | undefined {
    const report = this.reports.get(id);
    return report ? cloneReport(report) : undefined;
  }

  saveReport(report: ReportRecord): boolean {
    if (this.reports.has(report.id)) return false;
    this.reports.set(report.id, cloneReport(report));
    return true;
  }

  listReports(filter: ReportListFilter = {}): ReportRecord[] {
    return applyReportFilter([...this.reports.values()], filter);
  }

  getPlayer(handle: string): PlayerModerationRecord | undefined {
    const player = this.players.get(handle);
    return player ? { ...player } : undefined;
  }

  setPlayer(player: PlayerModerationRecord): void {
    this.players.set(player.handle, { ...player });
  }
}

export class UpstashModerationStore implements ModerationStore {
  constructor(private readonly redis: RedisCommandClient) {}

  async getReport(id: string): Promise<ReportRecord | undefined> {
    const raw = await this.redis.command<string | null>(['GET', reportStoreKey(id)]);
    return raw ? JSON.parse(raw) as ReportRecord : undefined;
  }

  async saveReport(report: ReportRecord): Promise<boolean> {
    const saved = await this.redis.command<string | null>([
      'SET',
      reportStoreKey(report.id),
      JSON.stringify(report),
      'NX',
    ]);
    return saved === 'OK';
  }

  async listReports(filter: ReportListFilter = {}): Promise<ReportRecord[]> {
    const keys = await this.redis.command<string[]>(['KEYS', 'go:report:*']);
    if (keys.length === 0) return [];
    const rawReports = await this.redis.command<Array<string | null>>(['MGET', ...keys]);
    return applyReportFilter(
      rawReports.flatMap((raw) => (raw ? [JSON.parse(raw) as ReportRecord] : [])),
      filter,
    );
  }

  async getPlayer(handle: string): Promise<PlayerModerationRecord | undefined> {
    const raw = await this.redis.command<string | null>(['GET', playerStoreKey(handle)]);
    return raw ? JSON.parse(raw) as PlayerModerationRecord : undefined;
  }

  async setPlayer(player: PlayerModerationRecord): Promise<void> {
    await this.redis.command<string>(['SET', playerStoreKey(player.handle), JSON.stringify(player)]);
  }
}

export async function submitReport(
  store: ModerationStore,
  input: SubmitReportInput,
  { nowIso = () => new Date().toISOString() }: TimeOptions = {},
): Promise<SubmitReportResult> {
  const reporter = normalizedValidHandle(input.reporterHandle);
  if (!reporter) return { ok: false, error: 'ERR_INVALID_REPORTER' };
  const target = normalizedValidHandle(input.targetHandle);
  if (!target) return { ok: false, error: 'ERR_INVALID_TARGET' };
  if (reporter === target) return { ok: false, error: 'ERR_REPORT_SELF' };
  if (!isValidGameId(input.gameId)) return { ok: false, error: 'ERR_INVALID_GAME_ID' };
  if (!isReportReason(input.reason)) return { ok: false, error: 'ERR_INVALID_REASON' };

  const description = normalizedDescription(input.description);
  if (description === false) return { ok: false, error: 'ERR_DESCRIPTION_TOO_LONG' };

  const id = reportId(reporter, target, input.gameId);
  const existing = await store.getReport(id);
  if (existing) return { ok: true, duplicate: true, report: cloneReport(existing) };

  const report: ReportRecord = {
    id,
    reporterHandle: reporter,
    targetHandle: target,
    gameId: input.gameId,
    reason: input.reason,
    status: 'open',
    createdAt: nowIso(),
  };
  if (description) report.description = description;

  const saved = await store.saveReport(report);
  if (!saved) {
    const stored = await store.getReport(id);
    return { ok: true, duplicate: true, report: cloneReport(stored ?? report) };
  }
  return { ok: true, duplicate: false, report: cloneReport(report) };
}

export async function setHandleBan(
  store: ModerationStore,
  {
    handle,
    banned,
    reason,
    nowIso = () => new Date().toISOString(),
  }: { handle: unknown; banned: boolean; reason?: unknown; nowIso?: () => string },
): Promise<{ ok: true; player: PlayerModerationRecord } | { ok: false; error: 'ERR_INVALID_HANDLE' }> {
  const normalized = normalizedValidHandle(handle);
  if (!normalized) return { ok: false, error: 'ERR_INVALID_HANDLE' };

  const now = nowIso();
  const existing = await store.getPlayer(normalized);
  const player: PlayerModerationRecord = {
    handle: normalized,
    banned,
    updatedAt: now,
    ...(existing?.statsResetAt ? { statsResetAt: existing.statsResetAt } : {}),
    ...(banned ? { bannedAt: now } : {}),
    ...(banned && typeof reason === 'string' && reason.trim() ? { banReason: reason.trim().slice(0, 300) } : {}),
  };
  await store.setPlayer(player);
  return { ok: true, player: { ...player } };
}

export async function resetPlayerStats(
  store: ModerationStore,
  { handle, nowIso = () => new Date().toISOString() }: { handle: unknown; nowIso?: () => string },
): Promise<{ ok: true; player: PlayerModerationRecord } | { ok: false; error: 'ERR_INVALID_HANDLE' }> {
  const normalized = normalizedValidHandle(handle);
  if (!normalized) return { ok: false, error: 'ERR_INVALID_HANDLE' };

  const now = nowIso();
  const existing = await store.getPlayer(normalized);
  const player: PlayerModerationRecord = {
    handle: normalized,
    banned: existing?.banned ?? false,
    updatedAt: now,
    statsResetAt: now,
    ...(existing?.bannedAt ? { bannedAt: existing.bannedAt } : {}),
    ...(existing?.banReason ? { banReason: existing.banReason } : {}),
  };
  await store.setPlayer(player);
  return { ok: true, player: { ...player } };
}

export async function isHandleBanned(store: ModerationStore | undefined, handle: unknown): Promise<boolean> {
  if (!store) return false;
  const normalized = normalizedValidHandle(handle);
  if (!normalized) return false;
  const player = await store.getPlayer(normalized);
  return player?.banned ?? false;
}

function reportId(reporterHandle: string, targetHandle: string, gameId: string): string {
  return `report:${reporterHandle}:${targetHandle}:${gameId}`;
}

function reportStoreKey(id: string): string {
  return `go:${id}`;
}

function playerStoreKey(handle: string): string {
  return `go:player-moderation:${handle}`;
}

function normalizedValidHandle(handle: unknown): string | undefined {
  if (typeof handle !== 'string') return undefined;
  const normalized = normalizeHandle(handle);
  return validateHandle(normalized) ? normalized : undefined;
}

function isValidGameId(gameId: unknown): gameId is string {
  return typeof gameId === 'string' && /^[A-Za-z0-9_-]{3,64}$/.test(gameId);
}

function isReportReason(reason: unknown): reason is ReportReason {
  return typeof reason === 'string' && REPORT_REASONS.includes(reason as ReportReason);
}

function normalizedDescription(description: unknown): string | false | undefined {
  if (description === undefined || description === null) return undefined;
  if (typeof description !== 'string') return undefined;
  const trimmed = description.trim();
  if (trimmed.length > 1_000) return false;
  return trimmed || undefined;
}

function applyReportFilter(reports: readonly ReportRecord[], filter: ReportListFilter): ReportRecord[] {
  const target = filter.targetHandle ? normalizedValidHandle(filter.targetHandle) : undefined;
  const filtered = reports
    .filter((report) => (!filter.status || report.status === filter.status))
    .filter((report) => (!target || report.targetHandle === target))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  return filtered.slice(0, filter.limit ?? 100).map(cloneReport);
}

function cloneReport(report: ReportRecord): ReportRecord {
  return { ...report };
}
