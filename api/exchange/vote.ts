import {
  pickExchangeDirection,
  resolveExchangeVote,
  type ExchangeDirection,
  type ExchangeVoteChoice,
  type ExchangeVoteThreshold,
} from '../../lib/game/exchange';
import { submitExchangeVote } from '../../lib/game/exchangeFlow';
import { runAutomaticPhaseActions } from '../../lib/game/phaseAutomation';
import type { PlayerId } from '../../lib/game/state';
import { defaultRealtimePersistence } from '../../lib/realtime/defaults';
import type { EventLog } from '../../lib/realtime/eventLog';
import { MessageType, type ServerEvent } from '../../lib/realtime/messages';
import { buildClientPayload } from '../../lib/realtime/payload';
import { publishEventsToPlayers } from '../../lib/realtime/publish';
import type { GameStateStore } from '../../lib/realtime/stateStore';
import type { RealtimePublisher } from '../../lib/realtime/upstash';
import { defaultRoomStore } from '../../lib/room/defaultStore';
import type { RoomStore } from '../../lib/room/lifecycle';
import { authorizeRoomPlayer } from '../../lib/room/playerAuth';
import { DEFAULT_ROOM_RULES, normalizeRoomRules, type RoomRules } from '../../lib/room/rules';
import { createDefaultRateLimiter, enforceRateLimit, type RequestRateLimiter } from '../../lib/security/rateLimit';

export interface ExchangeVoteSession {
  roomId: string;
  eligibleVoters: PlayerId[];
  votes: Partial<Record<PlayerId, ExchangeVoteChoice>>;
  threshold: ExchangeVoteThreshold;
  deadlineAt: string;
  direction?: ExchangeDirection;
}

export interface ExchangeVoteStore {
  get(roomId: string): ExchangeVoteSession | undefined;
  set(roomId: string, session: ExchangeVoteSession): void;
}

export class MemoryExchangeVoteStore implements ExchangeVoteStore {
  private readonly sessions = new Map<string, ExchangeVoteSession>();

  constructor(sessions: ExchangeVoteSession[] = []) {
    for (const session of sessions) this.set(session.roomId, session);
  }

  get(roomId: string): ExchangeVoteSession | undefined {
    const session = this.sessions.get(roomId);
    return session ? cloneSession(session) : undefined;
  }

  set(roomId: string, session: ExchangeVoteSession): void {
    this.sessions.set(roomId, cloneSession(session));
  }
}

export interface ExchangeVoteHandlerDeps {
  store?: ExchangeVoteStore;
  stateStore?: GameStateStore;
  eventLog?: EventLog;
  publisher?: RealtimePublisher;
  roomStore?: RoomStore;
  rulesForRoom?: (roomId: string) => RoomRules | Promise<RoomRules>;
  direction?: (roomId: string) => ExchangeDirection;
  deadlineAt?: (rules: RoomRules) => string;
  random?: () => number;
  rateLimiter?: RequestRateLimiter;
}

export function createExchangeVoteHandler({
  store,
  stateStore,
  eventLog,
  publisher,
  roomStore,
  rulesForRoom,
  direction,
  deadlineAt,
  random = Math.random,
  rateLimiter,
}: ExchangeVoteHandlerDeps): (request: Request) => Promise<Response> {
  return async function handleExchangeVote(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' }, 405);
    const rateLimited = await enforceRateLimit(request, rateLimiter, Date.now());
    if (rateLimited) return rateLimited;

    let body: { roomId?: string; playerId?: PlayerId; token?: string; choice?: ExchangeVoteChoice };
    try {
      body = await request.json() as { roomId?: string; playerId?: PlayerId; token?: string; choice?: ExchangeVoteChoice };
    } catch {
      return json({ ok: false, error: 'ERR_INVALID_JSON' }, 400);
    }
    if (!body.roomId || !body.playerId || (body.choice !== 'yes' && body.choice !== 'no')) {
      return json({ ok: false, error: 'ERR_INVALID_REQUEST' }, 400);
    }
    if (roomStore) {
      const auth = await authorizeRoomPlayer(roomStore, body.roomId, body.playerId, body.token);
      if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
    }

    if (stateStore && eventLog && publisher) {
      return handleStatefulVote({
        stateStore,
        eventLog,
        publisher,
        rulesForRoom,
        direction,
        deadlineAt,
        random,
      }, body.roomId, body.playerId, body.choice);
    }

    if (!store) return json({ ok: false, error: 'ERR_EXCHANGE_NOT_FOUND' }, 404);
    const session = store.get(body.roomId);
    if (!session) return json({ ok: false, error: 'ERR_EXCHANGE_NOT_FOUND' }, 404);
    if (!session.eligibleVoters.includes(body.playerId)) {
      return json({ ok: false, error: 'ERR_NOT_EXCHANGE_VOTER' }, 403);
    }

    session.votes[body.playerId] = body.choice;
    const result = resolveExchangeVote({
      eligibleVoters: session.eligibleVoters,
      votes: session.votes,
      threshold: session.threshold,
    });
    if (result.passed && !session.direction) session.direction = pickExchangeDirection(random);
    store.set(body.roomId, session);

    return json({ ok: true, result: { ...result, ...(session.direction ? { direction: session.direction } : {}) } }, 200);
  };
}

async function handleStatefulVote(
  deps: {
    stateStore: GameStateStore;
    eventLog: EventLog;
    publisher: RealtimePublisher;
    rulesForRoom?: ((roomId: string) => RoomRules | Promise<RoomRules>) | undefined;
    direction?: ((roomId: string) => ExchangeDirection) | undefined;
    deadlineAt?: ((rules: RoomRules) => string) | undefined;
    random?: (() => number) | undefined;
  },
  roomId: string,
  playerId: PlayerId,
  choice: ExchangeVoteChoice,
): Promise<Response> {
  const state = await deps.stateStore.get(roomId);
  if (!state) return json({ ok: false, error: 'ERR_EXCHANGE_NOT_FOUND' }, 404);
  if (state.phase !== 'exchange-vote-pending') return json({ ok: false, error: 'ERR_NOT_EXCHANGE_VOTE_PENDING' }, 409);

  const rules = normalizeRoomRules(await (deps.rulesForRoom?.(roomId) ?? DEFAULT_ROOM_RULES));
  const result = submitExchangeVote(state, {
    playerId,
    choice,
    rules,
    direction: deps.direction?.(roomId) ?? pickExchangeDirection(deps.random),
    deadlineAt: deps.deadlineAt?.(rules) ?? deadlineFromNow(rules.exchangeVoteDurationSeconds),
  });
  if (!result.ok) return json({ ok: false, error: result.error }, statusForError(result.error));

  const automated = runAutomaticPhaseActions(result.state, {
    rules,
    returnDeadlineAt: () => deps.deadlineAt?.(rules) ?? deadlineFromNow(rules.returnTimeLimitSeconds),
    exchangeDeadlineAt: () => deps.deadlineAt?.(rules) ?? deadlineFromNow(rules.exchangeVoteDurationSeconds),
    exchangeDirection: () => deps.direction?.(roomId) ?? pickExchangeDirection(deps.random),
  });
  const finalState = automated.state;
  const events = [...result.events, ...automated.events];

  await deps.stateStore.set(roomId, finalState);
  const logged = await publishEventsToPlayers(deps, roomId, finalState, events);
  const eventIds = Object.fromEntries(
    finalState.players.map((player) => [
      player.id,
      logged.filter((entry) => entry.playerId === player.id).map((entry) => entry.event.id),
    ]),
  );
  return json({
    ok: true,
    phase: finalState.phase,
    version: finalState.version,
    view: buildClientPayload(playerId, firstEvent(events), finalState).view,
    events: events.map((event) => event.type),
    eventIds,
  }, 200);
}

function firstEvent(events: readonly ServerEvent[]): ServerEvent {
  return events[0] ?? { type: MessageType.StateResync, reason: 'exchange-vote' };
}

function cloneSession(session: ExchangeVoteSession): ExchangeVoteSession {
  return {
    ...session,
    eligibleVoters: [...session.eligibleVoters],
    votes: { ...session.votes },
  };
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function deadlineFromNow(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function statusForError(error: string): number {
  if (error.includes('VOTER')) return 403;
  return 409;
}

export default createExchangeVoteHandler({
  stateStore: defaultRealtimePersistence.stateStore,
  eventLog: defaultRealtimePersistence.eventLog,
  publisher: defaultRealtimePersistence.publisher,
  roomStore: defaultRoomStore,
  rateLimiter: createDefaultRateLimiter({ scope: 'exchange-vote', limit: 30, windowMs: 5_000 }),
});
