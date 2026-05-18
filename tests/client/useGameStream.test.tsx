// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
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

describe('useGameStream', () => {
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
});
