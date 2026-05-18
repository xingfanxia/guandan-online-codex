import { generateDoubleDeck, shuffleDeck, type Card } from '../../../lib/game/cards';
import { defaultRealtimePersistence } from '../../../lib/realtime/defaults';
import type { EventLog } from '../../../lib/realtime/eventLog';
import { MessageType, type ServerEvent } from '../../../lib/realtime/messages';
import { buildClientPayload } from '../../../lib/realtime/payload';
import { publishEventsToPlayers } from '../../../lib/realtime/publish';
import type { GameStateStore } from '../../../lib/realtime/stateStore';
import type { RealtimePublisher } from '../../../lib/realtime/upstash';
import { defaultRoomStore } from '../../../lib/room/defaultStore';
import type { RoomStore } from '../../../lib/room/lifecycle';
import { startRoomGame } from '../../../lib/room/start';
import { createDefaultRateLimiter, enforceRateLimit, type RequestRateLimiter } from '../../../lib/security/rateLimit';
import type { RoomCodeParams } from './join';

export interface StartRoomDeps {
  roomStore: RoomStore;
  stateStore: GameStateStore;
  eventLog: EventLog;
  publisher: RealtimePublisher;
  deckForRoom?: (code: string) => readonly Card[];
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

    try {
      const state = startRoomGame(room, {
        deck: deps.deckForRoom?.(params.code) ?? shuffleDeck(generateDoubleDeck()),
        fillBots: body.fillBots ?? true,
        botDifficulty: body.botDifficulty ?? 'easy',
      });
      await deps.stateStore.set(params.code, state);
      const events: ServerEvent[] = [{ type: MessageType.StateResync, reason: 'room-start' }];
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

export default createStartRoomHandler({
  roomStore: defaultRoomStore,
  stateStore: defaultRealtimePersistence.stateStore,
  eventLog: defaultRealtimePersistence.eventLog,
  publisher: defaultRealtimePersistence.publisher,
  rateLimiter: createDefaultRateLimiter({ scope: 'room-start', limit: 20, windowMs: 60_000 }),
});
