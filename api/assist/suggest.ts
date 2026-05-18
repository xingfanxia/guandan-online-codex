import { universalHandler } from '../_node.js';
import { suggestMove } from '../../lib/ai/assist.js';
import type { LegalMove } from '../../lib/ai/engine.js';
import { defaultRealtimePersistence } from '../../lib/realtime/defaults.js';
import type { GameStateStore } from '../../lib/realtime/stateStore.js';
import { defaultRoomStore } from '../../lib/room/defaultStore.js';
import type { RoomStore } from '../../lib/room/lifecycle.js';
import { authorizeRoomPlayer } from '../../lib/room/playerAuth.js';
import { createDefaultRateLimiter, enforceRateLimit, type RequestRateLimiter } from '../../lib/security/rateLimit.js';

export interface SuggestMoveBody {
  roomId: string;
  playerId: string;
  token?: string;
}

export interface SuggestMoveHandlerDeps {
  stateStore: GameStateStore;
  roomStore: RoomStore;
  rateLimiter?: RequestRateLimiter;
}

export type SuggestMoveResponse =
  | { ok: true; move: LegalMove; description: string }
  | { ok: false; error: string };

export function createSuggestMoveHandler(deps: SuggestMoveHandlerDeps): (request: Request) => Promise<Response> {
  return async function handleSuggestMove(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' }, 405);
    const rateLimited = await enforceRateLimit(request, deps.rateLimiter, Date.now());
    if (rateLimited) return rateLimited;

    let body: Partial<SuggestMoveBody>;
    try {
      body = await request.json() as Partial<SuggestMoveBody>;
    } catch {
      return json({ ok: false, error: 'ERR_INVALID_JSON' }, 400);
    }

    if (typeof body.roomId !== 'string' || typeof body.playerId !== 'string') {
      return json({ ok: false, error: 'ERR_INVALID_REQUEST' }, 400);
    }

    const auth = await authorizeRoomPlayer(deps.roomStore, body.roomId, body.playerId, body.token);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

    const state = await deps.stateStore.get(body.roomId);
    if (!state) return json({ ok: false, error: 'ERR_ROOM_NOT_FOUND' }, 404);
    if (state.phase !== 'playing') return json({ ok: false, error: 'ERR_NOT_PLAYING' }, 409);

    const suggestion = suggestMove(state, body.playerId);
    return json({ ok: true, move: suggestion.move, description: suggestion.description }, 200);
  };
}

function json(payload: SuggestMoveResponse | { ok: false; error: string }, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const defaultHandler = createSuggestMoveHandler({
  stateStore: defaultRealtimePersistence.stateStore,
  roomStore: defaultRoomStore,
  rateLimiter: createDefaultRateLimiter({ scope: 'assist-suggest', limit: 20, windowMs: 5_000 }),
});

export default universalHandler(defaultHandler);
