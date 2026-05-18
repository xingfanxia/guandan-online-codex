import { postWithLatencyBeacon } from '../telemetry/beacon';

export interface PlayerProfileDto {
  handle: string;
  createdAt: string;
}

export type CreateHandleResult = { ok: true; profile: PlayerProfileDto } | { ok: false; error: string };

export interface CreateHandleInput {
  handle: string;
  fetcher?: typeof fetch;
  nowMs?: () => number;
}

export async function createHandle({
  handle,
  fetcher,
  nowMs,
}: CreateHandleInput): Promise<CreateHandleResult> {
  const response = await postWithLatencyBeacon('/api/auth/createHandle', {
    body: { handle },
    ...(fetcher ? { fetcher } : {}),
    ...(nowMs ? { nowMs } : {}),
  });
  return response.json();
}
