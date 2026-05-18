import { applyMove, type MoveCommand } from '../lib/game/move';
import type { Card } from '../lib/game/cards';
import type { PlayerId } from '../lib/game/state';
import { runBotTurns, type BotTurnOptions } from '../lib/ai/chain';
import { type EventLog } from '../lib/realtime/eventLog';
import {
  completeIdempotentOperation,
  startIdempotentOperation,
  type IdempotencyStore,
} from '../lib/realtime/idempotency';
import { defaultRealtimePersistence } from '../lib/realtime/defaults';
import { MessageType, type ServerEvent } from '../lib/realtime/messages';
import { buildClientPayload } from '../lib/realtime/payload';
import { publishEventsToPlayers } from '../lib/realtime/publish';
import { type GameStateStore } from '../lib/realtime/stateStore';
import { type RealtimePublisher } from '../lib/realtime/upstash';
import { defaultRoomStore } from '../lib/room/defaultStore';
import type { RoomStore } from '../lib/room/lifecycle';
import { authorizeRoomPlayer } from '../lib/room/playerAuth';
import { enforceBotId } from '../lib/security/botId';
import { createDefaultRateLimiter, enforceRateLimit, type RequestRateLimiter } from '../lib/security/rateLimit';

export { MemoryGameStateStore, type GameStateStore } from '../lib/realtime/stateStore';

export interface MoveRequestBody {
  roomId: string;
  moveId: string;
  playerId: PlayerId;
  token?: string;
  command: { type: 'play'; cards: Card[] } | { type: 'pass' };
}

export interface MoveHandlerDeps {
  stateStore: GameStateStore;
  idempotency: IdempotencyStore;
  eventLog: EventLog;
  publisher: RealtimePublisher;
  roomStore?: RoomStore;
  nowMs?: () => number;
  botChain?: BotTurnOptions | false;
  rateLimiter?: RequestRateLimiter;
}

export function createMoveHandler(deps: MoveHandlerDeps): (request: Request) => Promise<Response> {
  const nowMs = deps.nowMs ?? Date.now;

  return async function handleMove(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return json({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' }, 405);
    }
    const botBlocked = await enforceBotId(request);
    if (botBlocked) return botBlocked;

    const rateLimited = await enforceRateLimit(request, deps.rateLimiter, nowMs());
    if (rateLimited) return rateLimited;

    let body: MoveRequestBody;
    try {
      body = await request.json() as MoveRequestBody;
    } catch {
      return json({ ok: false, error: 'ERR_INVALID_JSON' }, 400);
    }

    if (!validBody(body)) {
      return json({ ok: false, error: 'ERR_INVALID_REQUEST' }, 400);
    }

    if (deps.roomStore) {
      const auth = await authorizeRoomPlayer(deps.roomStore, body.roomId, body.playerId, body.token);
      if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
    }

    const idempotencyKey = `idem:${body.roomId}:${body.moveId}`;
    const started = await startIdempotentOperation(deps.idempotency, idempotencyKey, 300, nowMs());
    if (started.status === 'pending') {
      return json({ ok: false, error: 'ERR_MOVE_PENDING' }, 409);
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

    const command = toMoveCommand(body);
    const result = applyMove(state, command);
    if (!result.ok) {
      const response = { ok: false, error: result.error };
      await completeIdempotentOperation(deps.idempotency, idempotencyKey, response, 300, nowMs());
      return json(response, 400);
    }

    let finalState = result.state;
    const events: ServerEvent[] = [
      moveEvent(command),
      ...(result.state.phase === 'round-end'
        ? [{ type: MessageType.RoundEnd, winnerTeam: result.state.winnerTeam } satisfies ServerEvent]
        : []),
      ...(result.state.phase === 'game-end'
        ? [{ type: MessageType.GameEnd, winnerTeam: result.state.winnerTeam } satisfies ServerEvent]
        : []),
    ];
    const botTurns = deps.botChain === false ? { state: finalState, events: [], moves: [] } : runBotTurns(finalState, deps.botChain ?? {});
    finalState = botTurns.state;
    events.push(...botTurns.events);

    await deps.stateStore.set(body.roomId, finalState);
    const logged = await publishEventsToPlayers(deps, body.roomId, finalState, events);
    const response = {
      ok: true,
      version: finalState.version,
      view: buildClientPayload(body.playerId, events[0]!, finalState).view,
      events: events.map((event) => event.type),
      ...(botTurns.moves.length > 0 ? { botMoves: botTurns.moves } : {}),
      eventIds: Object.fromEntries(logged.map(({ playerId, event: loggedEvent }) => [playerId, loggedEvent.id])),
    };
    await completeIdempotentOperation(deps.idempotency, idempotencyKey, response, 300, nowMs());
    return json(response, 200);
  };
}

function moveEvent(command: MoveCommand): ServerEvent {
  if (command.type === 'play') {
    return {
      type: MessageType.MovePlayed,
      playerId: command.playerId,
      cards: command.cards.map((card) => ({ ...card })),
    };
  }
  return {
    type: MessageType.StateResync,
    reason: `${command.playerId}:pass`,
  };
}

function toMoveCommand(body: MoveRequestBody): MoveCommand {
  if (body.command.type === 'play') {
    return {
      type: 'play',
      playerId: body.playerId,
      cards: body.command.cards,
    };
  }
  return {
    type: 'pass',
    playerId: body.playerId,
  };
}

function validBody(body: MoveRequestBody): boolean {
  return Boolean(
    body
      && typeof body.roomId === 'string'
      && typeof body.moveId === 'string'
      && typeof body.playerId === 'string'
      && body.command
      && (body.command.type === 'pass' || (body.command.type === 'play' && Array.isArray(body.command.cards))),
  );
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const defaultHandler = createMoveHandler({
  stateStore: defaultRealtimePersistence.stateStore,
  idempotency: defaultRealtimePersistence.idempotency,
  eventLog: defaultRealtimePersistence.eventLog,
  publisher: defaultRealtimePersistence.publisher,
  roomStore: defaultRoomStore,
  rateLimiter: createDefaultRateLimiter({ scope: 'move', limit: 60, windowMs: 5_000 }),
});

export default defaultHandler;
