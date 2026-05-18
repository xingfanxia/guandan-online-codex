import type { Card } from '../../../lib/game/cards';
import { postWithLatencyBeacon } from '../telemetry/beacon';

export type MoveApiError = { ok: false; error: string };
export type SubmitMoveResult = {
  ok: true;
  version: number;
  events?: string[];
  eventIds?: Record<string, string[]>;
  botMoves?: unknown[];
} | MoveApiError;

export interface SubmitMoveInput {
  roomId: string;
  moveId: string;
  playerId: string;
  token?: string;
  command: { type: 'play'; cards: readonly Card[] } | { type: 'pass' };
  fetcher?: typeof fetch;
  nowMs?: () => number;
}

export async function submitMove({
  roomId,
  moveId,
  playerId,
  token,
  command,
  fetcher,
  nowMs,
}: SubmitMoveInput): Promise<SubmitMoveResult> {
  const response = await postWithLatencyBeacon('/api/move', {
    body: { roomId, playerId, ...(token ? { token } : {}), moveId, command },
    ...(fetcher ? { fetcher } : {}),
    ...(nowMs ? { nowMs } : {}),
  });
  return response.json();
}
