import { useEffect, useRef, useState } from 'react';
import type { ClientStateView } from '../../../lib/realtime/payload';
import {
  connectGameStream,
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
        },
      });
      setState((current) => ({ ...current, error: undefined, connected: true }));
    } catch {
      setState((current) => ({
        ...current,
        error: { type: 'connection' },
        connected: false,
      }));
    }

    return () => {
      active = false;
      connection?.close();
    };
  }, [baseUrl, enabled, roomId, playerId, token, EventSourceCtor]);

  return state;
}

function browserBaseUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.location.origin;
}
