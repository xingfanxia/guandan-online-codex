import type { LegalMove } from '../../../lib/ai/engine';
import { postWithLatencyBeacon } from '../telemetry/beacon';

export type AssistApiError = { ok: false; error: string };
export type SuggestMoveResult = {
  ok: true;
  move: LegalMove;
  description: string;
} | AssistApiError;

export interface SuggestMoveInput {
  roomId: string;
  playerId: string;
  token?: string;
  fetcher?: typeof fetch;
  nowMs?: () => number;
}

export async function suggestMove({
  roomId,
  playerId,
  token,
  fetcher,
  nowMs,
}: SuggestMoveInput): Promise<SuggestMoveResult> {
  const response = await postWithLatencyBeacon('/api/assist/suggest', {
    body: { roomId, playerId, ...(token ? { token } : {}) },
    ...(fetcher ? { fetcher } : {}),
    ...(nowMs ? { nowMs } : {}),
  });
  return response.json();
}
