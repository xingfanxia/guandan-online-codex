import type { Card } from '../../../lib/game/cards';
import type { ExchangeVoteChoice } from '../../../lib/game/exchange';
import type { ClientStateView } from '../../../lib/realtime/payload';
import { postWithLatencyBeacon } from '../telemetry/beacon';

export type PhaseActionError = { ok: false; error: string };
export type TributeSelectionResult = {
  ok: true;
  phase?: string;
  version?: number;
  view?: ClientStateView;
  events?: string[];
  eventIds?: Record<string, string[]>;
  kind?: 'tribute' | 'return';
  card?: Card;
} | PhaseActionError;
export type ExchangeVoteResult = {
  ok: true;
  phase?: string;
  version?: number;
  view?: ClientStateView;
  events?: string[];
  eventIds?: Record<string, string[]>;
  result?: { passed: boolean; yes: number; no: number; required: number; direction?: string };
} | PhaseActionError;
export type ExchangeSelectionResult = {
  ok: true;
  phase?: string;
  version?: number;
  view?: ClientStateView;
  events?: string[];
  eventIds?: Record<string, string[]>;
  completed?: boolean;
  receivedCards?: Card[];
} | PhaseActionError;

export interface PhaseActionBaseInput {
  roomId: string;
  playerId: string;
  token?: string;
  fetcher?: typeof fetch;
  nowMs?: () => number;
}

export async function submitTributeSelection({
  roomId,
  playerId,
  token,
  card,
  fetcher,
  nowMs,
}: PhaseActionBaseInput & { card: Card }): Promise<TributeSelectionResult> {
  const response = await postWithLatencyBeacon('/api/tribute/select', {
    body: { roomId, playerId, ...(token ? { token } : {}), card },
    ...(fetcher ? { fetcher } : {}),
    ...(nowMs ? { nowMs } : {}),
  });
  return response.json();
}

export async function submitExchangeVote({
  roomId,
  playerId,
  token,
  choice,
  fetcher,
  nowMs,
}: PhaseActionBaseInput & { choice: ExchangeVoteChoice }): Promise<ExchangeVoteResult> {
  const response = await postWithLatencyBeacon('/api/exchange/vote', {
    body: { roomId, playerId, ...(token ? { token } : {}), choice },
    ...(fetcher ? { fetcher } : {}),
    ...(nowMs ? { nowMs } : {}),
  });
  return response.json();
}

export async function submitExchangeSelection({
  roomId,
  playerId,
  token,
  cards,
  fetcher,
  nowMs,
}: PhaseActionBaseInput & { cards: readonly Card[] }): Promise<ExchangeSelectionResult> {
  const response = await postWithLatencyBeacon('/api/exchange/select', {
    body: { roomId, playerId, ...(token ? { token } : {}), cards },
    ...(fetcher ? { fetcher } : {}),
    ...(nowMs ? { nowMs } : {}),
  });
  return response.json();
}
