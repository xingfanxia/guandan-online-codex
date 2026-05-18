import type { Card } from '../../lib/game/cards';
import { applyCardExchange, validateExchangeSelection, type ExchangeDirection } from '../../lib/game/exchange';
import { submitExchangeSelection } from '../../lib/game/exchangeFlow';
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
import { createDefaultRateLimiter, enforceRateLimit, type RequestRateLimiter } from '../../lib/security/rateLimit';

export interface ExchangeSelectSession {
  roomId: string;
  playerOrder: PlayerId[];
  hands: Record<PlayerId, Card[]>;
  selections: Partial<Record<PlayerId, Card[]>>;
  direction: ExchangeDirection;
  cardCount: number;
  deadlineAt: string;
}

export interface ExchangeSelectStore {
  get(roomId: string): ExchangeSelectSession | undefined;
  set(roomId: string, session: ExchangeSelectSession): void;
}

export class MemoryExchangeSelectStore implements ExchangeSelectStore {
  private readonly sessions = new Map<string, ExchangeSelectSession>();

  constructor(sessions: ExchangeSelectSession[] = []) {
    for (const session of sessions) this.set(session.roomId, session);
  }

  get(roomId: string): ExchangeSelectSession | undefined {
    const session = this.sessions.get(roomId);
    return session ? cloneSession(session) : undefined;
  }

  set(roomId: string, session: ExchangeSelectSession): void {
    this.sessions.set(roomId, cloneSession(session));
  }
}

export interface ExchangeSelectHandlerDeps {
  store?: ExchangeSelectStore;
  stateStore?: GameStateStore;
  eventLog?: EventLog;
  publisher?: RealtimePublisher;
  roomStore?: RoomStore;
  rateLimiter?: RequestRateLimiter;
}

export function createExchangeSelectHandler({ store, stateStore, eventLog, publisher, roomStore, rateLimiter }: ExchangeSelectHandlerDeps): (request: Request) => Promise<Response> {
  return async function handleExchangeSelect(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' }, 405);
    const rateLimited = await enforceRateLimit(request, rateLimiter, Date.now());
    if (rateLimited) return rateLimited;

    let body: { roomId?: string; playerId?: PlayerId; token?: string; cards?: Card[] };
    try {
      body = await request.json() as { roomId?: string; playerId?: PlayerId; token?: string; cards?: Card[] };
    } catch {
      return json({ ok: false, error: 'ERR_INVALID_JSON' }, 400);
    }
    if (!body.roomId || !body.playerId || !Array.isArray(body.cards)) {
      return json({ ok: false, error: 'ERR_INVALID_REQUEST' }, 400);
    }
    if (roomStore) {
      const auth = await authorizeRoomPlayer(roomStore, body.roomId, body.playerId, body.token);
      if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
    }

    if (stateStore && eventLog && publisher) {
      return handleStatefulSelect({ stateStore, eventLog, publisher }, body.roomId, body.playerId, body.cards);
    }

    if (!store) return json({ ok: false, error: 'ERR_EXCHANGE_NOT_FOUND' }, 404);
    const session = store.get(body.roomId);
    if (!session) return json({ ok: false, error: 'ERR_EXCHANGE_NOT_FOUND' }, 404);
    const hand = session.hands[body.playerId];
    if (!hand || !session.playerOrder.includes(body.playerId)) {
      return json({ ok: false, error: 'ERR_NOT_EXCHANGE_PLAYER' }, 403);
    }
    if (!validateExchangeSelection(body.cards, hand, session.cardCount)) {
      return json({ ok: false, error: 'ERR_INVALID_EXCHANGE_SELECTION' }, 400);
    }

    session.selections[body.playerId] = body.cards.map((card) => ({ ...card }));
    const completed = session.playerOrder.every((playerId) => session.selections[playerId]?.length === session.cardCount);
    if (!completed) {
      store.set(body.roomId, session);
      return json({ ok: true, completed: false }, 200);
    }

    const result = applyCardExchange({
      playerOrder: session.playerOrder,
      hands: session.hands,
      selections: session.selections as Record<PlayerId, Card[]>,
      direction: session.direction,
      cardCount: session.cardCount,
    });
    session.hands = result.hands;
    store.set(body.roomId, session);

    return json({ ok: true, completed: true, receivedCards: result.received[body.playerId] ?? [] }, 200);
  };
}

async function handleStatefulSelect(
  deps: { stateStore: GameStateStore; eventLog: EventLog; publisher: RealtimePublisher },
  roomId: string,
  playerId: PlayerId,
  cards: Card[],
): Promise<Response> {
  const state = await deps.stateStore.get(roomId);
  if (!state) return json({ ok: false, error: 'ERR_EXCHANGE_NOT_FOUND' }, 404);
  if (state.phase !== 'exchange-select-pending') {
    return json({ ok: false, error: 'ERR_NOT_EXCHANGE_SELECT_PENDING' }, 409);
  }

  const result = submitExchangeSelection(state, { playerId, cards });
  if (!result.ok) return json({ ok: false, error: result.error }, statusForError(result.error));

  await deps.stateStore.set(roomId, result.state);
  const logged = await publishEventsToPlayers(deps, roomId, result.state, result.events);
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
    view: buildClientPayload(playerId, firstEvent(result.events), result.state).view,
    events: result.events.map((event) => event.type),
    eventIds,
  }, 200);
}

function firstEvent(events: readonly ServerEvent[]): ServerEvent {
  return events[0] ?? { type: MessageType.StateResync, reason: 'exchange-select' };
}

function cloneSession(session: ExchangeSelectSession): ExchangeSelectSession {
  return {
    ...session,
    playerOrder: [...session.playerOrder],
    hands: cloneHands(session.hands),
    selections: cloneSelections(session.selections),
  };
}

function cloneHands(hands: Record<PlayerId, Card[]>): Record<PlayerId, Card[]> {
  return Object.fromEntries(Object.entries(hands).map(([playerId, hand]) => [playerId, hand.map((card) => ({ ...card }))]));
}

function cloneSelections(selections: Partial<Record<PlayerId, Card[]>>): Partial<Record<PlayerId, Card[]>> {
  return Object.fromEntries(Object.entries(selections).map(([playerId, cards]) => [playerId, cards?.map((card) => ({ ...card }))]));
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function statusForError(error: string): number {
  if (error.includes('PLAYER')) return 403;
  if (error.includes('INVALID')) return 400;
  return 409;
}

export default createExchangeSelectHandler({
  stateStore: defaultRealtimePersistence.stateStore,
  eventLog: defaultRealtimePersistence.eventLog,
  publisher: defaultRealtimePersistence.publisher,
  roomStore: defaultRoomStore,
  rateLimiter: createDefaultRateLimiter({ scope: 'exchange-select', limit: 30, windowMs: 5_000 }),
});
