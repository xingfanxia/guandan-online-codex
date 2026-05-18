// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { MessageType } from '../../lib/realtime/messages';
import type { ClientPayload } from '../../lib/realtime/payload';
import { type GameEventSource } from '../../src/lib/realtime/gameStream';
import { useGameStream } from '../../src/lib/realtime/useGameStream';

class FakeEventSource implements GameEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>();
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  close(): void {
    this.closed = true;
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emit(payload: ClientPayload, lastEventId: string): void {
    this.onmessage?.({ data: JSON.stringify(payload), lastEventId } as MessageEvent<string>);
  }

  emitNamed(type: string, payload: ClientPayload, lastEventId: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data: JSON.stringify(payload), lastEventId } as MessageEvent<string>);
    }
  }

  emitRaw(data: string): void {
    this.onmessage?.({ data, lastEventId: '' } as MessageEvent<string>);
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

function Harness({
  enabled = true,
  roomId = 'K7M2P9',
}: {
  enabled?: boolean;
  roomId?: string;
}): React.ReactElement {
  const stream = useGameStream({
    baseUrl: 'https://gdo.ax0x.ai',
    roomId,
    playerId: 'p1',
    enabled,
    EventSourceCtor: FakeEventSource,
  });
  return (
    <div>
      <span data-testid="phase">{stream.view?.phase ?? 'none'}</span>
      <span data-testid="last-event-id">{stream.lastEventId ?? 'none'}</span>
      {stream.error ? <span role="alert">{stream.error.type}</span> : null}
    </div>
  );
}

function PollingHarness({ fetcher }: { fetcher: typeof fetch }): React.ReactElement {
  const stream = useGameStream({
    baseUrl: 'https://gdo.ax0x.ai',
    roomId: 'K7M2P9',
    playerId: 'p1',
    fetcher,
    pollIntervalMs: 60_000,
  });
  return (
    <div>
      <span data-testid="phase">{stream.view?.phase ?? 'none'}</span>
      <span data-testid="last-event-id">{stream.lastEventId ?? 'none'}</span>
      {stream.error ? <span role="alert">{stream.error.type}</span> : null}
    </div>
  );
}

function FallbackHarness({ fetcher }: { fetcher: typeof fetch }): React.ReactElement {
  const stream = useGameStream({
    baseUrl: 'https://gdo.ax0x.ai',
    roomId: 'K7M2P9',
    playerId: 'p1',
    EventSourceCtor: FakeEventSource,
    fetcher,
    pollIntervalMs: 60_000,
    sseFallbackFailureThreshold: 2,
    sseFallbackWindowMs: 60_000,
  });
  return (
    <div>
      <span data-testid="phase">{stream.view?.phase ?? 'none'}</span>
      <span data-testid="last-event-id">{stream.lastEventId ?? 'none'}</span>
      {stream.error ? <span role="alert">{stream.error.type}</span> : null}
    </div>
  );
}

describe('useGameStream', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('connects to the SSE stream and exposes the latest filtered view', () => {
    FakeEventSource.instances = [];
    render(<Harness />);

    expect(FakeEventSource.instances[0]?.url).toBe('https://gdo.ax0x.ai/api/sse/K7M2P9?playerId=p1');

    act(() => {
      FakeEventSource.instances[0]!.emit(payload(7), '7-0');
    });

    expect(screen.getByTestId('phase')).toHaveTextContent('playing');
    expect(screen.getByTestId('last-event-id')).toHaveTextContent('7-0');
  });

  test('updates from named SSE events', () => {
    FakeEventSource.instances = [];
    render(<Harness />);

    act(() => {
      FakeEventSource.instances[0]!.emitNamed(MessageType.MovePlayed, payload(8), '8-0');
    });

    expect(screen.getByTestId('phase')).toHaveTextContent('playing');
    expect(screen.getByTestId('last-event-id')).toHaveTextContent('8-0');
  });

  test('reports parse errors and closes stale connections', () => {
    FakeEventSource.instances = [];
    const { rerender } = render(<Harness />);

    act(() => {
      FakeEventSource.instances[0]!.emitRaw('{');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('parse');

    rerender(<Harness enabled={false} />);
    expect(FakeEventSource.instances[0]?.closed).toBe(true);
  });

  test('keeps SSE active after a single rotation error', () => {
    FakeEventSource.instances = [];
    const fetcher = vi.fn(async () => Response.json({ ok: true, events: [] })) as unknown as typeof fetch;
    render(<FallbackHarness fetcher={fetcher} />);

    act(() => {
      FakeEventSource.instances[0]!.onerror?.(new Event('error'));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('connection');
    expect(FakeEventSource.instances[0]?.closed).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();

    act(() => {
      FakeEventSource.instances[0]!.emit(payload(9), '9-0');
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('last-event-id')).toHaveTextContent('9-0');
  });

  test('falls back to long-poll replay after repeated SSE failures', async () => {
    FakeEventSource.instances = [];
    const fetcher = vi.fn(async () => Response.json({
      ok: true,
      cursor: '10-0',
      events: [{ id: '10-0', payload: payload(10) }],
    })) as unknown as typeof fetch;
    render(<FallbackHarness fetcher={fetcher} />);

    act(() => {
      FakeEventSource.instances[0]!.onerror?.(new Event('error'));
      FakeEventSource.instances[0]!.onerror?.(new Event('error'));
    });

    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('playing'));
    expect(FakeEventSource.instances[0]?.closed).toBe(true);
    expect(screen.getByTestId('last-event-id')).toHaveTextContent('10-0');
    expect(fetcher).toHaveBeenCalledWith('https://gdo.ax0x.ai/api/poll/K7M2P9?playerId=p1');
  });

  test('falls back to long-poll replay when EventSource is unavailable', async () => {
    vi.stubGlobal('EventSource', undefined);
    const fetcher = vi.fn(async () => Response.json({
      ok: true,
      cursor: '9-0',
      events: [{ id: '9-0', payload: payload(9) }],
    })) as unknown as typeof fetch;

    render(<PollingHarness fetcher={fetcher} />);

    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('playing'));
    expect(screen.getByTestId('last-event-id')).toHaveTextContent('9-0');
    expect(fetcher).toHaveBeenCalledWith('https://gdo.ax0x.ai/api/poll/K7M2P9?playerId=p1');
  });

  test('reports connection errors from the long-poll fallback', async () => {
    vi.stubGlobal('EventSource', undefined);
    const fetcher = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    render(<PollingHarness fetcher={fetcher} />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('connection'));
    expect(screen.getByTestId('phase')).toHaveTextContent('none');
  });
});
