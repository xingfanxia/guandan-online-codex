import { describe, expect, test } from 'vitest';
import { MemoryEventLog, playerEventStream } from '../../lib/realtime/eventLog';
import { MessageType } from '../../lib/realtime/messages';
import type { ClientPayload } from '../../lib/realtime/payload';

function payload(type: ClientPayload['type'], event: ClientPayload['event']): ClientPayload {
  return {
    type,
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

describe('event log replay', () => {
  test('stores events in per-player streams and replays events after Last-Event-ID', () => {
    const log = new MemoryEventLog();
    const first = log.append('K7M2P9', 'p1', payload(MessageType.Heartbeat, { type: MessageType.Heartbeat, at: '2026-05-18T00:00:00.000Z' }));
    const second = log.append('K7M2P9', 'p1', payload(MessageType.StateResync, { type: MessageType.StateResync, reason: 'reconnect' }));
    log.append('K7M2P9', 'p2', payload(MessageType.Error, { type: MessageType.Error, code: 'ERR_PRIVATE', message: 'private' }));

    expect(playerEventStream('K7M2P9', 'p1')).toBe('game:K7M2P9:events:p1');
    expect(first.id).toBe('1-0');
    expect(second.id).toBe('2-0');
    expect(log.replayAfter('K7M2P9', 'p1', '1-0')).toEqual([second]);
    expect(log.replayAfter('K7M2P9', 'p1')).toEqual([first, second]);
  });

  test('trims old events by max length per stream', () => {
    const log = new MemoryEventLog({ maxLength: 2 });
    log.append('K7M2P9', 'p1', payload(MessageType.Heartbeat, { type: MessageType.Heartbeat, at: '1' }));
    const second = log.append('K7M2P9', 'p1', payload(MessageType.Heartbeat, { type: MessageType.Heartbeat, at: '2' }));
    const third = log.append('K7M2P9', 'p1', payload(MessageType.Heartbeat, { type: MessageType.Heartbeat, at: '3' }));

    expect(log.replayAfter('K7M2P9', 'p1')).toEqual([second, third]);
  });
});
