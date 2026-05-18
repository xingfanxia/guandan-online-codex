import { describe, expect, test, vi } from 'vitest';
import { MessageType } from '../../lib/realtime/messages';
import type { ClientPayload } from '../../lib/realtime/payload';
import { connectGameStream, pollGameEvents, type GameEventSource } from '../../src/lib/realtime/gameStream';

class FakeEventSource implements GameEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  close(): void {
    this.closed = true;
  }

  emit(data: unknown, lastEventId = ''): void {
    this.onmessage?.({ data: JSON.stringify(data), lastEventId } as MessageEvent<string>);
  }

  emitRaw(data: string): void {
    this.onmessage?.({ data, lastEventId: '' } as MessageEvent<string>);
  }

  fail(): void {
    this.onerror?.(new Event('error'));
  }
}

function payload(version: number): ClientPayload {
  return {
    type: MessageType.StateResync,
    event: { type: MessageType.StateResync, reason: 'test' },
    view: {
      phase: 'playing',
      mode: '4',
      levelRank: '5',
      version,
      players: [],
    },
  };
}

describe('connectGameStream', () => {
  test('opens an EventSource URL and emits parsed client payloads', () => {
    FakeEventSource.instances = [];
    const onPayload = vi.fn();

    const stream = connectGameStream({
      baseUrl: 'https://gdo.ax0x.ai',
      roomId: 'K7M2P9',
      playerId: 'p1',
      token: 'signed token',
      EventSourceCtor: FakeEventSource,
      onPayload,
    });

    expect(FakeEventSource.instances[0]?.url).toBe('https://gdo.ax0x.ai/api/sse/K7M2P9?playerId=p1&token=signed+token');
    FakeEventSource.instances[0]!.emit(payload(2), '12-0');

    expect(onPayload).toHaveBeenCalledWith(payload(2));
    expect(stream.lastEventId()).toBe('12-0');
  });

  test('uses an initial lastEventId for reconnects and reports malformed payloads', () => {
    FakeEventSource.instances = [];
    const onError = vi.fn();

    const stream = connectGameStream({
      baseUrl: 'https://gdo.ax0x.ai',
      roomId: 'K7M2P9',
      playerId: 'p1',
      lastEventId: '11-0',
      EventSourceCtor: FakeEventSource,
      onPayload: vi.fn(),
      onError,
    });

    expect(FakeEventSource.instances[0]?.url).toContain('lastEventId=11-0');
    FakeEventSource.instances[0]!.emitRaw('{');
    FakeEventSource.instances[0]!.fail();
    stream.close();

    expect(onError).toHaveBeenCalledWith({ type: 'parse', error: expect.any(SyntaxError) });
    expect(onError).toHaveBeenCalledWith({ type: 'connection' });
    expect(FakeEventSource.instances[0]?.closed).toBe(true);
  });
});

describe('pollGameEvents', () => {
  test('fetches poll fallback events and returns the replay cursor', async () => {
    const fetcher = vi.fn(async () => Response.json({
      ok: true,
      cursor: '12-0',
      events: [{ id: '12-0', payload: payload(3) }],
    }));

    await expect(pollGameEvents({
      baseUrl: 'https://gdo.ax0x.ai',
      roomId: 'K7M2P9',
      playerId: 'p1',
      token: 'signed token',
      lastEventId: '11-0',
      fetcher,
    })).resolves.toEqual({
      ok: true,
      cursor: '12-0',
      payloads: [payload(3)],
    });

    expect(fetcher).toHaveBeenCalledWith('https://gdo.ax0x.ai/api/poll/K7M2P9?playerId=p1&token=signed+token&lastEventId=11-0');
  });
});
