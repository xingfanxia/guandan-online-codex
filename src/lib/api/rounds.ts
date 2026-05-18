import { postWithLatencyBeacon } from '../telemetry/beacon';

export type RoundApiError = { ok: false; error: string };
export type AdvanceRoundResult = {
  ok: true;
  phase: string;
  version: number;
  events?: string[];
  eventIds?: Record<string, string[]>;
} | RoundApiError;

export interface AdvanceRoundInput {
  roomId: string;
  playerId: string;
  token?: string;
  transitionId: string;
  fetcher?: typeof fetch;
  nowMs?: () => number;
}

export async function advanceRound({
  roomId,
  playerId,
  token,
  transitionId,
  fetcher,
  nowMs,
}: AdvanceRoundInput): Promise<AdvanceRoundResult> {
  const response = await postWithLatencyBeacon('/api/round/next', {
    body: { roomId, playerId, ...(token ? { token } : {}), transitionId },
    ...(fetcher ? { fetcher } : {}),
    ...(nowMs ? { nowMs } : {}),
  });
  return response.json();
}
