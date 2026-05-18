import { universalHandler } from '../_node.js';
import type { Card, LevelRank } from '../../lib/game/cards.js';
import { runGameplayContinuation } from '../../lib/game/continuation.js';
import type { PlayerId } from '../../lib/game/state.js';
import { submitReturnSelection, submitTributeSelection } from '../../lib/game/tributeFlow.js';
import type { BotTurnOptions } from '../../lib/ai/chain.js';
import {
  validatePlayerReturnCard,
  validatePlayerTributeCard,
  type ReturnCardCap,
} from '../../lib/game/tribute.js';
import { pickExchangeDirection, type ExchangeDirection } from '../../lib/game/exchange.js';
import { defaultRealtimePersistence } from '../../lib/realtime/defaults.js';
import type { EventLog } from '../../lib/realtime/eventLog.js';
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

export type TributeSelectKind = 'tribute' | 'return';

export interface TributeSelectSession {
  roomId: string;
  playerId: PlayerId;
  kind: TributeSelectKind;
  hand: Card[];
  levelRank: LevelRank;
  returnCardCap: ReturnCardCap;
}

export interface TributeSelectStore {
  get(roomId: string, playerId: PlayerId): TributeSelectSession | undefined;
  set(session: TributeSelectSession): void;
}

export class MemoryTributeSelectStore implements TributeSelectStore {
  private readonly sessions = new Map<string, TributeSelectSession>();

  constructor(sessions: TributeSelectSession[] = []) {
    for (const session of sessions) this.set(session);
  }

  get(roomId: string, playerId: PlayerId): TributeSelectSession | undefined {
    const session = this.sessions.get(key(roomId, playerId));
    return session ? cloneSession(session) : undefined;
  }

  set(session: TributeSelectSession): void {
    this.sessions.set(key(session.roomId, session.playerId), cloneSession(session));
  }
}

export interface TributeSelectHandlerDeps {
  store?: TributeSelectStore;
  stateStore?: GameStateStore;
  eventLog?: EventLog;
  publisher?: RealtimePublisher;
  roomStore?: RoomStore;
  rulesForRoom?: (roomId: string) => RoomRules | Promise<RoomRules>;
  returnDeadlineAt?: (rules: RoomRules) => string;
  exchangeDeadlineAt?: (rules: RoomRules) => string;
  exchangeDirection?: (roomId: string) => ExchangeDirection;
  random?: () => number;
  botChain?: BotTurnOptions | false;
  rateLimiter?: RequestRateLimiter;
}

export function createTributeSelectHandler(deps: TributeSelectHandlerDeps): (request: Request) => Promise<Response> {
  return async function handleTributeSelect(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' }, 405);
    const rateLimited = await enforceRateLimit(request, deps.rateLimiter, Date.now());
    if (rateLimited) return rateLimited;

    let body: { roomId?: string; playerId?: PlayerId; token?: string; card?: Card };
    try {
      body = await request.json() as { roomId?: string; playerId?: PlayerId; token?: string; card?: Card };
    } catch {
      return json({ ok: false, error: 'ERR_INVALID_JSON' }, 400);
    }
    if (!body.roomId || !body.playerId || !body.card) {
      return json({ ok: false, error: 'ERR_INVALID_REQUEST' }, 400);
    }
    if (deps.roomStore) {
      const auth = await authorizeRoomPlayer(deps.roomStore, body.roomId, body.playerId, body.token);
      if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
    }

    if (deps.stateStore && deps.eventLog && deps.publisher) {
      return handleStatefulTributeSelect(deps as StatefulTributeSelectDeps, body.roomId, body.playerId, body.card);
    }

    if (!deps.store) return json({ ok: false, error: 'ERR_TRIBUTE_SELECTION_NOT_FOUND' }, 404);
    const session = deps.store.get(body.roomId, body.playerId);
    if (!session) return json({ ok: false, error: 'ERR_TRIBUTE_SELECTION_NOT_FOUND' }, 404);

    const valid = session.kind === 'tribute'
      ? validatePlayerTributeCard(body.card, session.hand, session.levelRank)
      : validatePlayerReturnCard(body.card, session.hand, { returnCardCap: session.returnCardCap });
    if (!valid) {
      return json({
        ok: false,
        error: session.kind === 'tribute' ? 'ERR_INVALID_TRIBUTE_CARD' : 'ERR_INVALID_RETURN_CARD',
      }, 400);
    }

    return json({ ok: true, kind: session.kind, card: { ...body.card } }, 200);
  };
}

interface StatefulTributeSelectDeps extends TributeSelectHandlerDeps {
  stateStore: GameStateStore;
  eventLog: EventLog;
  publisher: RealtimePublisher;
}

async function handleStatefulTributeSelect(
  deps: StatefulTributeSelectDeps,
  roomId: string,
  playerId: PlayerId,
  card: Card,
): Promise<Response> {
  const state = await deps.stateStore.get(roomId);
  if (!state) return json({ ok: false, error: 'ERR_ROOM_NOT_FOUND' }, 404);

  const rules = await rulesForRoom(deps, roomId);
  const result = state.phase === 'tribute-pending'
    ? submitTributeSelection(state, {
        playerId,
        card,
        rules,
        deadlineAt: deps.returnDeadlineAt?.(rules) ?? deadlineFromNow(rules.returnTimeLimitSeconds),
      })
    : state.phase === 'return-pending'
      ? submitReturnSelection(state, {
          playerId,
          card,
          rules,
          deadlineAt: deps.exchangeDeadlineAt?.(rules) ?? deadlineFromNow(rules.exchangeVoteDurationSeconds),
          exchangeDirection: deps.exchangeDirection?.(roomId) ?? pickExchangeDirection(deps.random),
        })
      : { ok: false as const, error: 'ERR_NOT_TRIBUTE_PHASE' as const };

  if (!result.ok) return json({ ok: false, error: result.error }, statusForError(result.error));

  const continuation = runGameplayContinuation(result.state, {
    rules,
    returnDeadlineAt: () => deps.returnDeadlineAt?.(rules) ?? deadlineFromNow(rules.returnTimeLimitSeconds),
    exchangeDeadlineAt: () => deps.exchangeDeadlineAt?.(rules) ?? deadlineFromNow(rules.exchangeVoteDurationSeconds),
    ...(deps.botChain !== undefined ? { botChain: deps.botChain } : {}),
  });
  const finalState = continuation.state;
  const events = [...result.events, ...continuation.events];

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
    ...(continuation.botMoves.length > 0 ? { botMoves: continuation.botMoves } : {}),
    eventIds,
  }, 200);
}

async function rulesForRoom(deps: StatefulTributeSelectDeps, roomId: string): Promise<RoomRules> {
  if (deps.rulesForRoom) return normalizeRoomRules(await deps.rulesForRoom(roomId));
  const room = await deps.roomStore?.get(roomId);
  return normalizeRoomRules(room?.rules ?? DEFAULT_ROOM_RULES);
}

function firstEvent(events: readonly ServerEvent[]): ServerEvent {
  return events[0] ?? { type: MessageType.StateResync, reason: 'phase-action' };
}

function key(roomId: string, playerId: PlayerId): string {
  return `${roomId}:${playerId}`;
}

function cloneSession(session: TributeSelectSession): TributeSelectSession {
  return {
    ...session,
    hand: session.hand.map((card) => ({ ...card })),
  };
}

function deadlineFromNow(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function statusForError(error: string): number {
  if (error.includes('PLAYER')) return 403;
  if (error.includes('INVALID')) return 400;
  return 409;
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const defaultHandler = createTributeSelectHandler({
  stateStore: defaultRealtimePersistence.stateStore,
  eventLog: defaultRealtimePersistence.eventLog,
  publisher: defaultRealtimePersistence.publisher,
  roomStore: defaultRoomStore,
  rateLimiter: createDefaultRateLimiter({ scope: 'tribute-select', limit: 30, windowMs: 5_000 }),
});

export default universalHandler(defaultHandler);
