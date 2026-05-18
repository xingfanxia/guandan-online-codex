import { describe, expect, test } from 'vitest';
import { serializeSseComment, serializeSseEvent } from '../../lib/realtime/sse';
import { MessageType } from '../../lib/realtime/messages';

describe('SSE serialization', () => {
  test('serializes id, event, retry, and JSON data fields', () => {
    expect(
      serializeSseEvent({
        id: '12-0',
        event: MessageType.Heartbeat,
        data: { type: MessageType.Heartbeat, at: '2026-05-18T00:00:00.000Z' },
        retryMs: 100,
      }),
    ).toBe('id: 12-0\nevent: heartbeat\nretry: 100\ndata: {"type":"heartbeat","at":"2026-05-18T00:00:00.000Z"}\n\n');
  });

  test('serializes heartbeat comments', () => {
    expect(serializeSseComment('heartbeat')).toBe(': heartbeat\n\n');
  });
});
