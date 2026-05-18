import { universalHandler } from './_node.js';
import { runBotTurns } from '../lib/ai/chain.js';
import { defaultRealtimePersistence } from '../lib/realtime/defaults.js';
import type { EventLog } from '../lib/realtime/eventLog.js';
import { publishEventsToPlayers } from '../lib/realtime/publish.js';
import type { GameStateStore } from '../lib/realtime/stateStore.js';
import type { RealtimePublisher } from '../lib/realtime/upstash.js';

export interface TickRequestBody {
  roomId: string;
  maxMoves?: number;
}

export interface TickHandlerDeps {
  stateStore: GameStateStore;
  eventLog: EventLog;
  publisher: RealtimePublisher;
  internalSecret?: string;
  random?: () => number;
}

export function createTickHandler(deps: TickHandlerDeps): (request: Request) => Promise<Response> {
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
    if (!body.roomId || (body.maxMoves !== undefined && (!Number.isInteger(body.maxMoves) || body.maxMoves < 1 || body.maxMoves > 10))) {
      return json({ ok: false, error: 'ERR_INVALID_REQUEST' }, 400);
    }

    const state = await deps.stateStore.get(body.roomId);
    if (!state) return json({ ok: false, error: 'ERR_ROOM_NOT_FOUND' }, 404);

    const result = runBotTurns(state, {
      maxMoves: body.maxMoves ?? 3,
      ...(deps.random ? { random: deps.random } : {}),
    });
    await deps.stateStore.set(body.roomId, result.state);
    const logged = await publishEventsToPlayers(deps, body.roomId, result.state, result.events);
    const eventIds = Object.fromEntries(
      result.state.players.map((player) => [
        player.id,
        logged.filter((entry) => entry.playerId === player.id).map((entry) => entry.event.id),
      ]),
    );

    return json({
      ok: true,
      phase: result.state.phase,
      version: result.state.version,
      events: result.events.map((event) => event.type),
      ...(result.moves.length > 0 ? { botMoves: result.moves } : {}),
      eventIds,
    }, 200);
  };
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
  ...(process.env.INTERNAL_TICK_SECRET ? { internalSecret: process.env.INTERNAL_TICK_SECRET } : {}),
};

const defaultHandler = createTickHandler(defaultDeps);

export default universalHandler(defaultHandler);
