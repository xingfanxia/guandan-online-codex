import { describe, expect, test } from 'vitest';
import { RealtimeCursor, buildEventSourceUrl } from '../../lib/client/realtime';

describe('client realtime helpers', () => {
  test('builds EventSource-compatible URLs with token and lastEventId query params', () => {
    expect(
      buildEventSourceUrl({
        baseUrl: 'https://gdo.ax0x.ai',
        roomId: 'K7M2P9',
        playerId: 'p1',
        token: 'signed token',
        lastEventId: '12-0',
      }),
    ).toBe('https://gdo.ax0x.ai/api/sse/K7M2P9?playerId=p1&token=signed+token&lastEventId=12-0');
  });

  test('tracks last received event id for reconnects', () => {
    const cursor = new RealtimeCursor();

    expect(cursor.lastEventId).toBeUndefined();
    cursor.record({ lastEventId: '1-0' });
    cursor.record({ lastEventId: '' });
    cursor.record({ lastEventId: '2-0' });

    expect(cursor.lastEventId).toBe('2-0');
  });
});
