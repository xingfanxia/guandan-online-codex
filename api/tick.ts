import { universalHandler } from './_node.js';
import { pickExchangeDirection, type ExchangeDirection } from '../lib/game/exchange.js';
import { runGameplayContinuation } from '../lib/game/continuation.js';
import { defaultRealtimePersistence } from '../lib/realtime/defaults.js';
import type { EventLog } from '../lib/realtime/eventLog.js';
import { publishEventsToPlayers } from '../lib/realtime/publish.js';
import type { GameStateStore } from '../lib/realtime/stateStore.js';
import type { RealtimePublisher } from '../lib/realtime/upstash.js';
import { defaultRoomStore } from '../lib/room/defaultStore.js';
import type { RoomStore } from '../lib/room/lifecycle.js';
import { DEFAULT_ROOM_RULES, normalizeRoomRules, type RoomRules } from '../lib/room/rules.js';

export interface TickRequestBody {
  roomId: string;
  maxMoves?: number;
}

export interface TickHandlerDeps {
  stateStore: GameStateStore;
  eventLog: EventLog;
  publisher: RealtimePublisher;
  roomStore?: RoomStore;
  rulesForRoom?: (roomId: string) => RoomRules | Promise<RoomRules>;
  internalSecret?: string;
  random?: () => number;
  exchangeDirection?: () => ExchangeDirection;
  nowMs?: () => number;
}

export function createTickHandler(deps: TickHandlerDeps): (request: Request) => Promise<Response> {
  const nowMs = deps.nowMs ?? Date.now;

  return async function handleTick(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' }, 405);
    if (deps.internalSecret && request.headers.get('x-internal-secret') !== deps.internalSecret) {
      return json({ ok: false, error: 'ERR_UNAUTHORIZED' }, 401);
    }

    let body: TickRequestBody;
    try {
      body = await request.json() as TickRequestBody;
    } catch {
      return json({ ok: false, error: 'ERR_INVALID_JSON' }, 400);
    }
    if (!body.roomId || (body.maxMoves !== undefined && (!Number.isInteger(body.maxMoves) || body.maxMoves < 1 || body.maxMoves > 64))) {
      return json({ ok: false, error: 'ERR_INVALID_REQUEST' }, 400);
    }

    const state = await deps.stateStore.get(body.roomId);
    if (!state) return json({ ok: false, error: 'ERR_ROOM_NOT_FOUND' }, 404);

    const rules = await rulesForRoom(deps, body.roomId);
    const continuation = runGameplayContinuation(state, {
      rules,
      returnDeadlineAt: () => deadlineFromNow(nowMs(), rules.returnTimeLimitSeconds),
      exchangeDeadlineAt: () => deadlineFromNow(nowMs(), rules.exchangeVoteDurationSeconds),
      exchangeDirection: deps.exchangeDirection ?? (() => pickExchangeDirection(deps.random)),
      nowMs,
      botChain: {
        ...(body.maxMoves ? { maxMoves: body.maxMoves } : {}),
        ...(deps.random ? { random: deps.random } : {}),
      },
    });
    const finalState = continuation.state;
    const events = continuation.events;

    await deps.stateStore.set(body.roomId, finalState);
    const logged = await publishEventsToPlayers(deps, body.roomId, finalState, events);
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
      events: events.map((event) => event.type),
      ...(continuation.phaseActions.length > 0 ? { phaseActions: continuation.phaseActions } : {}),
      ...(continuation.botMoves.length > 0 ? { botMoves: continuation.botMoves } : {}),
      eventIds,
    }, 200);
  };
}

async function rulesForRoom(deps: TickHandlerDeps, roomId: string): Promise<RoomRules> {
  if (deps.rulesForRoom) return normalizeRoomRules(await deps.rulesForRoom(roomId));
  const room = await deps.roomStore?.get(roomId);
  return normalizeRoomRules(room?.rules ?? DEFAULT_ROOM_RULES);
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

const defaultDeps: TickHandlerDeps = {
  stateStore: defaultRealtimePersistence.stateStore,
  eventLog: defaultRealtimePersistence.eventLog,
  publisher: defaultRealtimePersistence.publisher,
  roomStore: defaultRoomStore,
  ...(process.env.INTERNAL_TICK_SECRET ? { internalSecret: process.env.INTERNAL_TICK_SECRET } : {}),
};

const defaultHandler = createTickHandler(defaultDeps);

export default universalHandler(defaultHandler);
