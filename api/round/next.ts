import { generateDoubleDeck, shuffleDeck, type Card } from '../../lib/game/cards.js';
import { runAutomaticPhaseActions } from '../../lib/game/phaseAutomation.js';
import { startNextRoundFlow } from '../../lib/game/roundFlow.js';
import type { RoundEndState } from '../../lib/game/state.js';
import type { TeamStructure } from '../../lib/game/tribute.js';
import type { ExchangeDirection } from '../../lib/game/exchange.js';
import { defaultRealtimePersistence } from '../../lib/realtime/defaults.js';
import type { EventLog } from '../../lib/realtime/eventLog.js';
import {
  completeIdempotentOperation,
  startIdempotentOperation,
  type IdempotencyStore,
} from '../../lib/realtime/idempotency.js';
import { MessageType, type ServerEvent } from '../../lib/realtime/messages.js';
import { buildClientPayload } from '../../lib/realtime/payload.js';
import { publishEventsToPlayers } from '../../lib/realtime/publish.js';
import type { GameStateStore } from '../../lib/realtime/stateStore.js';
import type { RealtimePublisher } from '../../lib/realtime/upstash.js';
import { defaultRoomStore } from '../../lib/room/defaultStore.js';
import type { RoomStore } from '../../lib/room/lifecycle.js';
import { authorizeRoomPlayer } from '../../lib/room/playerAuth.js';
import { DEFAULT_ROOM_RULES, normalizeRoomRules, type RoomRules } from '../../lib/room/rules.js';
import { createDefaultRateLimiter, enforceRateLimit, type RequestRateLimiter } from '../../lib/security/rateLimit.js';

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
  exchangeDirectionForRoom?: (roomId: string, roundEnd: RoundEndState) => ExchangeDirection;
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

    const automated = runAutomaticPhaseActions(flow.state, {
      rules,
      returnDeadlineAt: () => deps.deadlineAt?.(state, rules) ?? deadlineFromNow(nowMs(), rules.returnTimeLimitSeconds),
      exchangeDeadlineAt: () => deps.exchangeDeadlineAt?.(state, rules) ?? deadlineFromNow(nowMs(), rules.exchangeVoteDurationSeconds),
      ...(deps.exchangeDirectionForRoom ? { exchangeDirection: () => deps.exchangeDirectionForRoom!(body.roomId, state) } : {}),
    });
    const finalState = automated.state;
    const emittedEvents = [...flow.events, ...automated.events];

    await deps.stateStore.set(body.roomId, finalState);
    const events: ServerEvent[] = emittedEvents.length > 0
      ? emittedEvents
      : [{ type: MessageType.StateResync, reason: 'next-round' }];
    const logged = await publishEventsToPlayers(deps, body.roomId, finalState, events);
    const eventIds = Object.fromEntries(
      finalState.players.map((player) => [
        player.id,
        logged.filter((entry) => entry.playerId === player.id).map((entry) => entry.event.id),
      ]),
    );
    const response = {
      ok: true,
      phase: finalState.phase,
      version: finalState.version,
      view: buildClientPayload(body.playerId ?? finalState.players[0]!.id, events[0]!, finalState).view,
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
