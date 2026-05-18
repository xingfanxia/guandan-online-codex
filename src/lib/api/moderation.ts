export type ReportReason = 'cheat' | 'collusion' | 'abuse' | 'other';

export interface ReportRecordDto {
  id: string;
  reporterHandle: string;
  targetHandle: string;
  gameId: string;
  reason: ReportReason;
  status: 'open' | 'dismissed' | 'escalated';
  createdAt: string;
  description?: string;
}

export interface LatencyAggregateDto {
  route: string;
  region: string;
  count: number;
  p50: number;
  p95: number;
  p99: number;
}

export type ModerationApiError = { ok: false; error: string };
export type SubmitReportResult = { ok: true; duplicate: boolean; report?: ReportRecordDto } | ModerationApiError;
export type ListReportsResult = { ok: true; reports: ReportRecordDto[] } | ModerationApiError;
export type ListLatencyResult = { ok: true; aggregates: LatencyAggregateDto[] } | ModerationApiError;
export type BanHandleResult = { ok: true; player: unknown } | ModerationApiError;
export type ResetStatsResult = { ok: true; player: unknown } | ModerationApiError;

export async function submitReport({
  reporterHandle,
  targetHandle,
  gameId,
  reason,
  description,
  fetcher = fetch,
}: {
  reporterHandle: string;
  targetHandle: string;
  gameId: string;
  reason: ReportReason;
  description?: string;
  fetcher?: typeof fetch;
}): Promise<SubmitReportResult> {
  const body: Record<string, unknown> = { reporterHandle, targetHandle, gameId, reason };
  if (description) body.description = description;
  const response = await fetcher('/api/report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json();
}

export async function listReports({
  adminToken,
  fetcher = fetch,
}: {
  adminToken: string;
  fetcher?: typeof fetch;
}): Promise<ListReportsResult> {
  const response = await fetcher('/api/admin/reports', {
    headers: { 'x-admin-token': adminToken },
  });
  return response.json();
}

export async function listLatency({
  adminToken,
  fetcher = fetch,
}: {
  adminToken: string;
  fetcher?: typeof fetch;
}): Promise<ListLatencyResult> {
  const response = await fetcher('/api/admin/latency', {
    headers: { 'x-admin-token': adminToken },
  });
  return response.json();
}

export async function banHandle({
  adminToken,
  handle,
  banned,
  reason,
  fetcher = fetch,
}: {
  adminToken: string;
  handle: string;
  banned: boolean;
  reason?: string;
  fetcher?: typeof fetch;
}): Promise<BanHandleResult> {
  const response = await fetcher('/api/admin/ban', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-token': adminToken },
    body: JSON.stringify({ handle, banned, ...(reason ? { reason } : {}) }),
  });
  return response.json();
}

export async function resetStats({
  adminToken,
  handle,
  fetcher = fetch,
}: {
  adminToken: string;
  handle: string;
  fetcher?: typeof fetch;
}): Promise<ResetStatsResult> {
  const response = await fetcher('/api/admin/reset-stats', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-token': adminToken },
    body: JSON.stringify({ handle }),
  });
  return response.json();
}
