import { describe, expect, test } from 'vitest';
import { createSseHandler } from '../../api/sse/[roomId]';
import { MemoryEventLog, type EventLog, type LoggedEvent } from '../../lib/realtime/eventLog';
import { MessageType, type ServerEvent } from '../../lib/realtime/messages';
import type { ClientPayload } from '../../lib/realtime/payload';
import { createRoom, MemoryRoomStore } from '../../lib/room/lifecycle';

function payload(event: ServerEvent): ClientPayload {
  return {
    type: event.type,
    event,
    view: {
      phase: 'waiting',
      mode: '4',
      levelRank: '2',
      version: 1,
      players: [],
    },
  };
}

describe('api/sse room stream handler', () => {
  test('replays per-player events after lastEventId and emits heartbeat comment', async () => {
    const eventLog = new MemoryEventLog();
    const first = eventLog.append('K7M2P9', 'p1', payload({ type: MessageType.Heartbeat, at: '1' }));
    const second = eventLog.append('K7M2P9', 'p1', payload({ type: MessageType.StateResync, reason: 'reconnect' }));
    eventLog.append('K7M2P9', 'p2', payload({ type: MessageType.Error, code: 'ERR_PRIVATE', message: 'private' }));
    const handler = createSseHandler({ eventLog, nowIso: () => '2026-05-18T00:00:00.000Z' });

    const response = await handler(
      new Request(`https://gdo.ax0x.ai/api/sse/K7M2P9?playerId=p1&lastEventId=${encodeURIComponent(first.id)}`),
      { roomId: 'K7M2P9' },
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(body).not.toContain('"at":"1"');
    expect(body).toContain(`id: ${second.id}`);
    expect(body).toContain('event: state_resync');
    expect(body).toContain(': heartbeat');
    expect(body).not.toContain('ERR_PRIVATE');
  });

  test('rejects missing player id and non-GET requests', async () => {
    const handler = createSseHandler({ eventLog: new MemoryEventLog() });

    expect((await handler(new Request('https://gdo.ax0x.ai/api/sse/K7M2P9'), { roomId: 'K7M2P9' })).status).toBe(400);
    expect(
      (
        await handler(new Request('https://gdo.ax0x.ai/api/sse/K7M2P9?playerId=p1', { method: 'POST' }), {
          roomId: 'K7M2P9',
        })
      ).status,
    ).toBe(405);
  });

  test('requires a valid player token when a room store is configured', async () => {
    const eventLog = new MemoryEventLog();
    const roomStore = new MemoryRoomStore();
    const created = await createRoom(roomStore, { hostHandle: 'fufu', random: () => 0 });
    const handler = createSseHandler({
      eventLog,
      roomStore,
      nowIso: () => '2026-05-18T00:05:00.000Z',
    });

    const denied = await handler(
      new Request('https://gdo.ax0x.ai/api/sse/A2A2A2?playerId=p1&token=wrong'),
      { roomId: created.room.code },
    );
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ ok: false, error: 'ERR_INVALID_PLAYER_TOKEN' });

    const allowed = await handler(
      new Request(`https://gdo.ax0x.ai/api/sse/A2A2A2?playerId=p1&token=${created.playerToken}`),
      { roomId: created.room.code },
    );
    expect(allowed.status).toBe(200);
    expect((await roomStore.get(created.room.code))?.players[0]).toMatchObject({
      id: 'p1',
      connectionStatus: 'online',
      lastSeenAt: '2026-05-18T00:05:00.000Z',
    });
  });

  test('polls the event log during a bounded stream window', async () => {
    let now = 0;
    const event = { type: MessageType.StateResync, reason: 'late' } satisfies ServerEvent;
    const late: LoggedEvent = { id: '2-0', payload: payload(event) };
    const replayCalls: Array<string | undefined> = [];
    const eventLog: EventLog = {
      append: () => late,
      replayAfter: (_roomId, _playerId, lastEventId) => {
        replayCalls.push(lastEventId);
        return replayCalls.length === 1 ? [] : [late];
      },
    };
    const handler = createSseHandler({
      eventLog,
      nowIso: () => '2026-05-18T00:00:00.000Z',
      nowMs: () => now,
      sleep: async (ms) => {
        now += ms;
      },
      maxDurationMs: 30,
      pollMs: 10,
      heartbeatMs: 1_000,
    });

    const response = await handler(new Request('https://gdo.ax0x.ai/api/sse/K7M2P9?playerId=p1'), { roomId: 'K7M2P9' });
    const body = await response.text();

    expect(replayCalls.length).toBeGreaterThan(1);
    expect(body).toContain('id: 2-0');
    expect(body).toContain('event: state_resync');
  });
});
