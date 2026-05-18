import { generateDoubleDeck, shuffleDeck, type Card } from '../../lib/game/cards';
import { startNextRoundFlow } from '../../lib/game/roundFlow';
import type { RoundEndState } from '../../lib/game/state';
import type { TeamStructure } from '../../lib/game/tribute';
import { defaultRealtimePersistence } from '../../lib/realtime/defaults';
import type { EventLog } from '../../lib/realtime/eventLog';
import {
  completeIdempotentOperation,
  startIdempotentOperation,
  type IdempotencyStore,
} from '../../lib/realtime/idempotency';
import { MessageType, type ServerEvent } from '../../lib/realtime/messages';
import { publishEventsToPlayers } from '../../lib/realtime/publish';
import type { GameStateStore } from '../../lib/realtime/stateStore';
import type { RealtimePublisher } from '../../lib/realtime/upstash';
import { defaultRoomStore } from '../../lib/room/defaultStore';
import type { RoomStore } from '../../lib/room/lifecycle';
import { authorizeRoomPlayer } from '../../lib/room/playerAuth';
import { DEFAULT_ROOM_RULES, normalizeRoomRules, type RoomRules } from '../../lib/room/rules';
import { createDefaultRateLimiter, enforceRateLimit, type RequestRateLimiter } from '../../lib/security/rateLimit';

export interface NextRoundRequestBody {
  roomId: string;
  transitionId: string;
  playerId?: string;
  token?: string;
}

export interface NextRoundHandlerDeps {
  stateStore: GameStateStore;
  idempotency: IdempotencyStore;
  eventLog: EventLog;
  publisher: RealtimePublisher;
  roomStore?: RoomStore;
  deckForRoom?: (roomId: string, roundEnd: RoundEndState) => readonly Card[];
  rulesForRoom?: (roomId: string, roundEnd: RoundEndState) => RoomRules | Promise<RoomRules>;
  teamStructureForRoom?: (roomId: string, roundEnd: RoundEndState) => TeamStructure;
  deadlineAt?: (roundEnd: RoundEndState, rules: RoomRules) => string;
  exchangeDeadlineAt?: (roundEnd: RoundEndState, rules: RoomRules) => string;
  nowMs?: () => number;
  rateLimiter?: RequestRateLimiter;
}

export function createNextRoundHandler(deps: NextRoundHandlerDeps): (request: Request) => Promise<Response> {
  const nowMs = deps.nowMs ?? Date.now;

  return async function handleNextRound(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return json({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' }, 405);
    }
    const rateLimited = await enforceRateLimit(request, deps.rateLimiter, nowMs());
    if (rateLimited) return rateLimited;

    let body: NextRoundRequestBody;
    try {
      body = await request.json() as NextRoundRequestBody;
    } catch {
      return json({ ok: false, error: 'ERR_INVALID_JSON' }, 400);
    }

    if (!validBody(body)) {
      return json({ ok: false, error: 'ERR_INVALID_REQUEST' }, 400);
    }
    if (deps.roomStore) {
      if (typeof body.playerId !== 'string') {
        return json({ ok: false, error: 'ERR_INVALID_REQUEST' }, 400);
      }
      const auth = await authorizeRoomPlayer(deps.roomStore, body.roomId, body.playerId, body.token);
      if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
    }

    const idempotencyKey = `idem:${body.roomId}:round:${body.transitionId}`;
    const started = await startIdempotentOperation(deps.idempotency, idempotencyKey, 300, nowMs());
    if (started.status === 'pending') {
      return json({ ok: false, error: 'ERR_ROUND_TRANSITION_PENDING' }, 409);
    }
    if (started.status === 'replay') {
      return json(started.response, 200);
    }

    const state = await deps.stateStore.get(body.roomId);
    if (!state) {
      const response = { ok: false, error: 'ERR_ROOM_NOT_FOUND' };
      await completeIdempotentOperation(deps.idempotency, idempotencyKey, response, 300, nowMs());
      return json(response, 404);
    }
    if (state.phase !== 'round-end') {
      const response = { ok: false, error: 'ERR_NOT_ROUND_END' };
      await completeIdempotentOperation(deps.idempotency, idempotencyKey, response, 300, nowMs());
      return json(response, 409);
    }

    const rules = normalizeRoomRules(await (deps.rulesForRoom?.(body.roomId, state) ?? DEFAULT_ROOM_RULES));
    const flow = startNextRoundFlow({
      roundEnd: state,
      deck: deps.deckForRoom?.(body.roomId, state) ?? shuffleDeck(generateDoubleDeck()),
      rules,
      deadlineAt: deps.deadlineAt?.(state, rules) ?? deadlineFromNow(nowMs(), rules.returnTimeLimitSeconds),
      exchangeDeadlineAt: deps.exchangeDeadlineAt?.(state, rules) ?? deadlineFromNow(nowMs(), rules.exchangeVoteDurationSeconds),
      teamStructure: deps.teamStructureForRoom?.(body.roomId, state) ?? '2-teams-of-n',
    });

    await deps.stateStore.set(body.roomId, flow.state);
    const events: ServerEvent[] = flow.events.length > 0
      ? flow.events
      : [{ type: MessageType.StateResync, reason: 'next-round' }];
    const logged = await publishEventsToPlayers(deps, body.roomId, flow.state, events);
    const eventIds = Object.fromEntries(
      flow.state.players.map((player) => [
        player.id,
        logged.filter((entry) => entry.playerId === player.id).map((entry) => entry.event.id),
      ]),
    );
    const response = {
      ok: true,
      phase: flow.state.phase,
      version: flow.state.version,
      events: events.map((event) => event.type),
      eventIds,
    };
    await completeIdempotentOperation(deps.idempotency, idempotencyKey, response, 300, nowMs());
    return json(response, 200);
  };
}

function validBody(body: NextRoundRequestBody): boolean {
  return Boolean(body && typeof body.roomId === 'string' && typeof body.transitionId === 'string');
}

function deadlineFromNow(nowMs: number, seconds: number): string {
  return new Date(nowMs + seconds * 1000).toISOString();
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const defaultHandler = createNextRoundHandler({
  stateStore: defaultRealtimePersistence.stateStore,
  idempotency: defaultRealtimePersistence.idempotency,
  eventLog: defaultRealtimePersistence.eventLog,
  publisher: defaultRealtimePersistence.publisher,
  roomStore: defaultRoomStore,
  rateLimiter: createDefaultRateLimiter({ scope: 'round-next', limit: 20, windowMs: 5_000 }),
});

export default defaultHandler;
