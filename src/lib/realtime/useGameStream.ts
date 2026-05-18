import { useEffect, useRef, useState } from 'react';
import type { ClientStateView } from '../../../lib/realtime/payload';
import {
  connectGameStream,
  pollGameEvents,
  type GameEventSourceCtor,
  type GameStreamConnection,
  type GameStreamError,
} from './gameStream';

export interface UseGameStreamInput {
  baseUrl?: string | undefined;
  roomId?: string | undefined;
  playerId?: string | undefined;
  token?: string | undefined;
  lastEventId?: string | undefined;
  enabled?: boolean;
  EventSourceCtor?: GameEventSourceCtor | undefined;
  fetcher?: typeof fetch | undefined;
  pollIntervalMs?: number | undefined;
  sseFallbackFailureThreshold?: number | undefined;
  sseFallbackWindowMs?: number | undefined;
}

export interface GameStreamState {
  view?: ClientStateView | undefined;
  lastEventId?: string | undefined;
  error?: GameStreamError | undefined;
  connected: boolean;
}

export function useGameStream({
  baseUrl = browserBaseUrl(),
  roomId,
  playerId,
  token,
  lastEventId,
  enabled = true,
  EventSourceCtor,
  fetcher,
  pollIntervalMs = 1_000,
  sseFallbackFailureThreshold = 2,
  sseFallbackWindowMs = 60_000,
}: UseGameStreamInput): GameStreamState {
  const [state, setState] = useState<GameStreamState>({ connected: false });
  const cursorRef = useRef<string | undefined>(lastEventId);

  useEffect(() => {
    if (lastEventId) cursorRef.current = lastEventId;
  }, [lastEventId]);

  useEffect(() => {
    if (!enabled || !baseUrl || !roomId || !playerId) {
      setState((current) => ({ ...current, connected: false }));
      return undefined;
    }

    let active = true;
    let connection: GameStreamConnection | undefined;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let polling = false;
    let sseFailureTimes: number[] = [];

    const stopPolling = () => {
      if (pollTimer) globalThis.clearTimeout(pollTimer);
      pollTimer = undefined;
      polling = false;
    };

    const startPolling = () => {
      if (polling) return;
      polling = true;
      const poll = async () => {
        if (!active) return;
        try {
          const result = await pollGameEvents({
            baseUrl,
            roomId,
            playerId,
            ...(token ? { token } : {}),
            ...(cursorRef.current ? { lastEventId: cursorRef.current } : {}),
            ...(fetcher ? { fetcher } : {}),
          });
          if (!active) return;
          if (result.ok) {
            if (result.cursor) cursorRef.current = result.cursor;
            const latest = result.payloads.at(-1);
            setState((current) => ({
              ...current,
              ...(latest ? { view: latest.view } : {}),
              lastEventId: cursorRef.current,
              error: undefined,
              connected: true,
            }));
          } else {
            setState((current) => ({
              ...current,
              error: { type: 'connection' },
              connected: false,
            }));
          }
        } catch {
          if (!active) return;
          setState((current) => ({
            ...current,
            error: { type: 'connection' },
            connected: false,
          }));
        }
        pollTimer = globalThis.setTimeout(() => { void poll(); }, pollIntervalMs);
      };
      void poll();
    };

    const shouldFallBackToPolling = () => {
      const now = Date.now();
      const threshold = Math.max(1, sseFallbackFailureThreshold);
      sseFailureTimes = [...sseFailureTimes, now]
        .filter((failureAt) => now - failureAt <= sseFallbackWindowMs);
      return sseFailureTimes.length >= threshold;
    };

    try {
      connection = connectGameStream({
        baseUrl,
        roomId,
        playerId,
        ...(token ? { token } : {}),
        ...(cursorRef.current ? { lastEventId: cursorRef.current } : {}),
        ...(EventSourceCtor ? { EventSourceCtor } : {}),
        onPayload(payload) {
          if (!active) return;
          const latestId = connection?.lastEventId();
          cursorRef.current = latestId;
          sseFailureTimes = [];
          setState({
            view: payload.view,
            lastEventId: latestId,
            connected: true,
          });
        },
        onError(error) {
          if (!active) return;
          setState((current) => ({
            ...current,
            error,
            connected: error.type === 'connection' ? false : current.connected,
          }));
          if (error.type === 'connection' && shouldFallBackToPolling()) {
            connection?.close();
            startPolling();
          }
        },
      });
      setState((current) => ({ ...current, error: undefined, connected: true }));
    } catch {
      setState((current) => ({
        ...current,
        error: { type: 'connection' },
        connected: false,
      }));
      startPolling();
    }

    return () => {
      active = false;
      stopPolling();
      connection?.close();
    };
  }, [
    baseUrl,
    enabled,
    roomId,
    playerId,
    token,
    EventSourceCtor,
    fetcher,
    pollIntervalMs,
    sseFallbackFailureThreshold,
    sseFallbackWindowMs,
  ]);

  return state;
}

function browserBaseUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.location.origin;
}
