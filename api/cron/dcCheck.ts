import { universalHandler } from '../_node.js';
import { runBotTurns } from '../../lib/ai/chain.js';
import { pickExchangeDirection } from '../../lib/game/exchange.js';
import { runAutomaticPhaseActions } from '../../lib/game/phaseAutomation.js';
import { defaultRealtimePersistence } from '../../lib/realtime/defaults.js';
import type { EventLog } from '../../lib/realtime/eventLog.js';
import { publishEventsToPlayers } from '../../lib/realtime/publish.js';
import type { GameStateStore } from '../../lib/realtime/stateStore.js';
import type { RealtimePublisher } from '../../lib/realtime/upstash.js';
import { applyBotTakeovers } from '../../lib/room/botTakeover.js';
import { defaultRoomStore } from '../../lib/room/defaultStore.js';
import type { RoomStore } from '../../lib/room/lifecycle.js';
import { normalizeRoomRules } from '../../lib/room/rules.js';

export interface DcCheckHandlerDeps {
  roomStore: RoomStore;
  stateStore: GameStateStore;
  eventLog: EventLog;
  publisher: RealtimePublisher;
  internalSecret?: string;
  cronSecret?: string;
  nowIso?: () => string;
  random?: () => number;
  maxBotMoves?: number;
}

export function createDcCheckHandler(deps: DcCheckHandlerDeps): (request: Request) => Promise<Response> {
  return async function handleDcCheck(request: Request): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'POST') {
      return json({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' }, 405);
    }
    if (!authorized(request, deps)) {
      return json({ ok: false, error: 'ERR_UNAUTHORIZED' }, 401);
    }

    const rooms = await deps.roomStore.list();
    const takeovers: Array<{ roomId: string; playerId: string }> = [];
    const phaseActions: Array<{ roomId: string; playerId: string; type: string }> = [];
    const botMoves: Array<{ roomId: string; playerId: string }> = [];

    for (const room of rooms) {
      let state = await deps.stateStore.get(room.code);
      if (!state) continue;
      let currentRoom = room;

      if (state.phase === 'playing') {
        const takeover = applyBotTakeovers(currentRoom, state, {
          ...(deps.nowIso ? { nowIso: deps.nowIso } : {}),
        });
        if (takeover.changed) {
          currentRoom = takeover.room;
          state = takeover.state;

          await deps.roomStore.set(room.code, currentRoom);
          await deps.stateStore.set(room.code, state);
          await publishEventsToPlayers(deps, room.code, state, takeover.events);
          for (const event of takeover.events) {
            if (event.type === 'bot_takeover') takeovers.push({ roomId: room.code, playerId: event.playerId });
          }
        }
      }

      const now = nowMs(deps);
      const rules = normalizeRoomRules(currentRoom.rules);
      const phaseResult = runAutomaticPhaseActions(state, {
        rules,
        returnDeadlineAt: () => deadlineFromNow(nowMs(deps), rules.returnTimeLimitSeconds),
        exchangeDeadlineAt: () => deadlineFromNow(nowMs(deps), rules.exchangeVoteDurationSeconds),
        exchangeDirection: () => pickExchangeDirection(deps.random),
        nowMs: () => now,
      });
      if (phaseResult.actions.length > 0 || phaseResult.events.length > 0) {
        state = phaseResult.state;
        await deps.stateStore.set(room.code, state);
        await publishEventsToPlayers(deps, room.code, state, phaseResult.events);
        for (const action of phaseResult.actions) {
          phaseActions.push({ roomId: room.code, playerId: action.playerId, type: action.type });
        }
      }

      const botResult = runBotTurns(state, {
        ...(deps.maxBotMoves ? { maxMoves: deps.maxBotMoves } : {}),
        ...(deps.random ? { random: deps.random } : {}),
      });
      if (botResult.moves.length === 0 && botResult.events.length === 0) continue;

      await deps.stateStore.set(room.code, botResult.state);
      await publishEventsToPlayers(deps, room.code, botResult.state, botResult.events);
      for (const move of botResult.moves) {
        botMoves.push({ roomId: room.code, playerId: move.playerId });
      }
    }

    return json({
      ok: true,
      roomsScanned: rooms.length,
      takeovers,
      phaseActions,
      botMoves,
    }, 200);
  };
}

function authorized(request: Request, deps: DcCheckHandlerDeps): boolean {
  if (!deps.internalSecret && !deps.cronSecret) return true;
  return Boolean(
    (deps.internalSecret && request.headers.get('x-internal-secret') === deps.internalSecret)
      || (deps.cronSecret && request.headers.get('authorization') === `Bearer ${deps.cronSecret}`),
  );
}

function nowMs(deps: DcCheckHandlerDeps): number {
  if (!deps.nowIso) return Date.now();
  const parsed = Date.parse(deps.nowIso());
  return Number.isFinite(parsed) ? parsed : Date.now();
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

const defaultHandler = createDcCheckHandler({
  roomStore: defaultRoomStore,
  stateStore: defaultRealtimePersistence.stateStore,
  eventLog: defaultRealtimePersistence.eventLog,
  publisher: defaultRealtimePersistence.publisher,
  ...(process.env.INTERNAL_TICK_SECRET ? { internalSecret: process.env.INTERNAL_TICK_SECRET } : {}),
  ...(process.env.CRON_SECRET ? { cronSecret: process.env.CRON_SECRET } : {}),
});

export default universalHandler(defaultHandler);
