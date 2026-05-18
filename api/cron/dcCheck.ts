import { universalHandler } from '../_node.js';
import { runBotTurns } from '../../lib/ai/chain.js';
import { defaultRealtimePersistence } from '../../lib/realtime/defaults.js';
import type { EventLog } from '../../lib/realtime/eventLog.js';
import { publishEventsToPlayers } from '../../lib/realtime/publish.js';
import type { GameStateStore } from '../../lib/realtime/stateStore.js';
import type { RealtimePublisher } from '../../lib/realtime/upstash.js';
import { applyBotTakeovers } from '../../lib/room/botTakeover.js';
import { defaultRoomStore } from '../../lib/room/defaultStore.js';
import type { RoomStore } from '../../lib/room/lifecycle.js';

export interface DcCheckHandlerDeps {
  roomStore: RoomStore;
  stateStore: GameStateStore;
  eventLog: EventLog;
  publisher: RealtimePublisher;
  internalSecret?: string;
  nowIso?: () => string;
  random?: () => number;
  maxBotMoves?: number;
}

export function createDcCheckHandler(deps: DcCheckHandlerDeps): (request: Request) => Promise<Response> {
  return async function handleDcCheck(request: Request): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'POST') {
      return json({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' }, 405);
    }
    if (deps.internalSecret && request.headers.get('x-internal-secret') !== deps.internalSecret) {
      return json({ ok: false, error: 'ERR_UNAUTHORIZED' }, 401);
    }

    const rooms = await deps.roomStore.list();
    const takeovers: Array<{ roomId: string; playerId: string }> = [];
    const botMoves: Array<{ roomId: string; playerId: string }> = [];

    for (const room of rooms) {
      const state = await deps.stateStore.get(room.code);
      if (!state || state.phase !== 'playing') continue;

      const takeover = applyBotTakeovers(room, state, {
        ...(deps.nowIso ? { nowIso: deps.nowIso } : {}),
      });
      if (!takeover.changed) continue;

      await deps.roomStore.set(room.code, takeover.room);
      await deps.stateStore.set(room.code, takeover.state);
      await publishEventsToPlayers(deps, room.code, takeover.state, takeover.events);
      for (const event of takeover.events) {
        if (event.type === 'bot_takeover') takeovers.push({ roomId: room.code, playerId: event.playerId });
      }

      const botResult = runBotTurns(takeover.state, {
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
      botMoves,
    }, 200);
  };
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
});

export default universalHandler(defaultHandler);
