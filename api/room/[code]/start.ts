import { universalHandler, roomCodeParams } from '../../_node.js';
import { runBotTurns, type BotTurnOptions } from '../../../lib/ai/chain.js';
import { generateDeckForMode, shuffleDeck, type Card } from '../../../lib/game/cards.js';
import { defaultRealtimePersistence } from '../../../lib/realtime/defaults.js';
import type { EventLog } from '../../../lib/realtime/eventLog.js';
import { MessageType, type ServerEvent } from '../../../lib/realtime/messages.js';
import { buildClientPayload } from '../../../lib/realtime/payload.js';
import { publishEventsToPlayers } from '../../../lib/realtime/publish.js';
import type { GameStateStore } from '../../../lib/realtime/stateStore.js';
import type { RealtimePublisher } from '../../../lib/realtime/upstash.js';
import { defaultRoomStore } from '../../../lib/room/defaultStore.js';
import { markRoomStarted, type RoomStore } from '../../../lib/room/lifecycle.js';
import { startRoomGame } from '../../../lib/room/start.js';
import { createDefaultRateLimiter, enforceRateLimit, type RequestRateLimiter } from '../../../lib/security/rateLimit.js';
import type { RoomCodeParams } from './join.js';

export interface StartRoomDeps {
  roomStore: RoomStore;
  stateStore: GameStateStore;
  eventLog: EventLog;
  publisher: RealtimePublisher;
  deckForRoom?: (code: string) => readonly Card[];
  firstLeaderRandom?: () => number;
  botChain?: BotTurnOptions | false;
  rateLimiter?: RequestRateLimiter;
}

export function createStartRoomHandler(deps: StartRoomDeps): (request: Request, params: RoomCodeParams) => Promise<Response> {
  return async function handleStartRoom(request: Request, params: RoomCodeParams): Promise<Response> {
    if (request.method !== 'POST') return json({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' }, 405);
    const rateLimited = await enforceRateLimit(request, deps.rateLimiter, Date.now());
    if (rateLimited) return rateLimited;

    let body: { hostToken?: string; fillBots?: boolean; botDifficulty?: 'easy' | 'medium' };
    try {
      body = await request.json() as { hostToken?: string; fillBots?: boolean; botDifficulty?: 'easy' | 'medium' };
    } catch {
      return json({ ok: false, error: 'ERR_INVALID_JSON' }, 400);
    }
    if (!body.hostToken) return json({ ok: false, error: 'ERR_INVALID_REQUEST' }, 400);

    const room = await deps.roomStore.get(params.code);
    if (!room) return json({ ok: false, error: 'ERR_ROOM_NOT_FOUND' }, 404);
    if (body.hostToken !== room.hostToken) return json({ ok: false, error: 'ERR_INVALID_HOST_TOKEN' }, 403);
    if (room.status === 'playing') return json({ ok: false, error: 'ERR_ROOM_STARTED' }, 409);

    try {
      const startedState = startRoomGame(room, {
        deck: deps.deckForRoom?.(params.code) ?? shuffleDeck(generateDeckForMode(room.mode)),
        fillBots: body.fillBots ?? true,
        botDifficulty: body.botDifficulty ?? 'easy',
        ...(deps.firstLeaderRandom ? { firstLeaderRandom: deps.firstLeaderRandom } : {}),
      });
      const botTurns = deps.botChain === false
        ? { state: startedState, events: [] as ServerEvent[] }
        : runBotTurns(startedState, deps.botChain ?? {});
      const state = botTurns.state;
      await deps.stateStore.set(params.code, state);
      await markRoomStarted(deps.roomStore, params.code, { hostToken: body.hostToken });
      const events: ServerEvent[] = [{ type: MessageType.StateResync, reason: 'room-start' }, ...botTurns.events];
      const logged = await publishEventsToPlayers(deps, params.code, state, events);
      const eventIds = Object.fromEntries(
        state.players.map((player) => [
          player.id,
          logged.filter((entry) => entry.playerId === player.id).map((entry) => entry.event.id),
        ]),
      );
      return json({
        ok: true,
        phase: state.phase,
        mode: state.mode,
        version: state.version,
        players: state.players.map((player) => ({ ...player })),
        view: buildClientPayload(state.players[0]!.id, events[0]!, state).view,
        events: events.map((event) => event.type),
        eventIds,
      }, 200);
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : 'ERR_START_ROOM_FAILED' }, 400);
    }
  };
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const defaultHandler = createStartRoomHandler({
  roomStore: defaultRoomStore,
  stateStore: defaultRealtimePersistence.stateStore,
  eventLog: defaultRealtimePersistence.eventLog,
  publisher: defaultRealtimePersistence.publisher,
  rateLimiter: createDefaultRateLimiter({ scope: 'room-start', limit: 20, windowMs: 60_000 }),
});

export default universalHandler(defaultHandler, roomCodeParams('code'));
