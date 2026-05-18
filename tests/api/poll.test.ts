import { describe, expect, test } from 'vitest';
import { createPollHandler } from '../../api/poll/[roomId]';
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

describe('api/poll room event handler', () => {
  test('returns replayed events after the supplied cursor', async () => {
    const eventLog = new MemoryEventLog();
    const first = eventLog.append('K7M2P9', 'p1', payload({ type: MessageType.Heartbeat, at: '1' }));
    const second = eventLog.append('K7M2P9', 'p1', payload({ type: MessageType.StateResync, reason: 'late' }));
    eventLog.append('K7M2P9', 'p2', payload({ type: MessageType.Error, code: 'ERR_PRIVATE', message: 'private' }));
    const handler = createPollHandler({ eventLog });

    const response = await handler(
      new Request(`https://gdo.ax0x.ai/api/poll/K7M2P9?playerId=p1&lastEventId=${encodeURIComponent(first.id)}`),
      { roomId: 'K7M2P9' },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      cursor: second.id,
      events: [{ id: second.id, payload: payload({ type: MessageType.StateResync, reason: 'late' }) }],
    });
  });

  test('waits through a bounded poll window and returns an empty heartbeat when no events arrive', async () => {
    let now = 0;
    const replayCalls: Array<string | undefined> = [];
    const eventLog: EventLog = {
      append: (_roomId, _playerId, event) => ({ id: 'ignored', payload: event }),
      replayAfter: (_roomId, _playerId, lastEventId) => {
        replayCalls.push(lastEventId);
        return [];
      },
    };
    const handler = createPollHandler({
      eventLog,
      nowMs: () => now,
      sleep: async (ms) => {
        now += ms;
      },
      maxDurationMs: 30,
      pollMs: 10,
    });

    const response = await handler(new Request('https://gdo.ax0x.ai/api/poll/K7M2P9?playerId=p1'), { roomId: 'K7M2P9' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, events: [] });
    expect(replayCalls.length).toBeGreaterThan(1);
  });

  test('requires a valid room player token when a room store is configured', async () => {
    const roomStore = new MemoryRoomStore();
    const created = await createRoom(roomStore, { hostHandle: 'fufu', random: () => 0 });
    const handler = createPollHandler({ eventLog: new MemoryEventLog(), roomStore, maxDurationMs: 0 });

    const denied = await handler(
      new Request('https://gdo.ax0x.ai/api/poll/A2A2A2?playerId=p1&token=wrong'),
      { roomId: created.room.code },
    );
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ ok: false, error: 'ERR_INVALID_PLAYER_TOKEN' });

    const allowed = await handler(
      new Request(`https://gdo.ax0x.ai/api/poll/A2A2A2?playerId=p1&token=${created.playerToken}`),
      { roomId: created.room.code },
    );
    expect(allowed.status).toBe(200);
  });
});
