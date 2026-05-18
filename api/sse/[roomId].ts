import { defaultRealtimePersistence } from '../../lib/realtime/defaults';
import { MemoryEventLog, type EventLog } from '../../lib/realtime/eventLog';
import { MessageType } from '../../lib/realtime/messages';
import { serializeSseComment, serializeSseEvent } from '../../lib/realtime/sse';
import { defaultRoomStore } from '../../lib/room/defaultStore';
import { markRoomPlayerSeen } from '../../lib/room/dcDetection';
import { authorizeRoomPlayer } from '../../lib/room/playerAuth';
import type { RoomStore } from '../../lib/room/lifecycle';

export interface SseRouteParams {
  roomId: string;
}

export interface SseHandlerDeps {
  eventLog: EventLog;
  roomStore?: RoomStore;
  nowIso?: () => string;
  nowMs?: () => number;
  sleep?: (ms: number) => Promise<void>;
  maxDurationMs?: number;
  heartbeatMs?: number;
  pollMs?: number;
}

export function createSseHandler(deps: SseHandlerDeps): (request: Request, params: SseRouteParams) => Promise<Response> {
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const nowMs = deps.nowMs ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const maxDurationMs = deps.maxDurationMs ?? 0;
  const heartbeatMs = deps.heartbeatMs ?? 20_000;
  const pollMs = deps.pollMs ?? 250;

  return async function handleSse(request: Request, params: SseRouteParams): Promise<Response> {
    if (request.method !== 'GET') {
      return json({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' }, 405);
    }

    const url = new URL(request.url);
    const playerId = url.searchParams.get('playerId');
    if (!playerId) {
      return json({ ok: false, error: 'ERR_MISSING_PLAYER_ID' }, 400);
    }
    if (deps.roomStore) {
      const auth = await authorizeRoomPlayer(deps.roomStore, params.roomId, playerId, url.searchParams.get('token'));
      if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
      await markRoomPlayerSeen(deps.roomStore, params.roomId, playerId, nowIso);
    }

    const lastEventId = url.searchParams.get('lastEventId') ?? request.headers.get('last-event-id') ?? undefined;
    const encoder = new TextEncoder();

    return new Response(new ReadableStream<Uint8Array>({
      async start(controller) {
        let cursor = lastEventId;
        const deadline = nowMs() + maxDurationMs;
        let nextHeartbeatAt = nowMs();
        let firstPoll = true;

        while (firstPoll || (maxDurationMs > 0 && nowMs() < deadline)) {
          firstPoll = false;
          const events = await deps.eventLog.replayAfter(params.roomId, playerId, cursor);
          for (const logged of events) {
            cursor = logged.id;
            controller.enqueue(encoder.encode(serializeSseEvent({
              id: logged.id,
              event: logged.payload.type,
              data: logged.payload,
            })));
          }

          if (nowMs() >= nextHeartbeatAt) {
            controller.enqueue(encoder.encode(serializeSseComment('heartbeat')));
            controller.enqueue(encoder.encode(serializeSseEvent({
              event: MessageType.Heartbeat,
              data: { type: MessageType.Heartbeat, at: nowIso() },
              retryMs: 100,
            })));
            if (deps.roomStore) {
              await markRoomPlayerSeen(deps.roomStore, params.roomId, playerId, nowIso);
            }
            nextHeartbeatAt = nowMs() + heartbeatMs;
          }

          if (maxDurationMs <= 0) break;
          await sleep(pollMs);
        }
        controller.close();
      },
    }), {
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      },
    });
  };
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const defaultHandler = createSseHandler({
  eventLog: defaultRealtimePersistence.eventLog,
  roomStore: defaultRoomStore,
  maxDurationMs: 270_000,
});

export default defaultHandler;
