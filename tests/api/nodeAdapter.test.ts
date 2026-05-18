import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, test } from 'vitest';
import { universalHandler, roomCodeParams, type VercelNodeRequest } from '../../api/_node';
import { createCreateHandleHandler } from '../../api/auth/createHandle';
import { MemoryPlayerProfileStore } from '../../lib/auth/playerProfile';
import { MemoryIpThrottleStore } from '../../lib/security/ipThrottle';

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(closeServer));
});

describe('api/_node universalHandler', () => {
  test('adapts Vercel Node requests into Web Requests for JSON handlers', async () => {
    const profiles = new MemoryPlayerProfileStore();
    const webHandler = createCreateHandleHandler({
      profiles,
      throttleStore: new MemoryIpThrottleStore(() => 1_000),
      nowIso: () => '2026-05-18T00:00:00.000Z',
      nowMs: () => 1_000,
    });
    const baseUrl = await listen(universalHandler(webHandler));

    const response = await fetch(`${baseUrl}/api/auth/createHandle`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.42',
      },
      body: JSON.stringify({ handle: '@NodeUser' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.json()).toEqual({
      ok: true,
      profile: {
        handle: 'nodeuser',
        createdAt: '2026-05-18T00:00:00.000Z',
        createIp: '203.0.113.42',
      },
    });
    expect(profiles.get('nodeuser')).toMatchObject({ handle: 'nodeuser' });
  });

  test('resolves Vercel dynamic route params from request.query', async () => {
    const webHandler = (_request: Request, params: { code: string }): Response => {
      return Response.json({ ok: true, code: params.code });
    };
    const nodeHandler = universalHandler(webHandler, roomCodeParams('code'));
    const baseUrl = await listen((request, response) => {
      request.query = { code: 'A2A2A2' };
      return nodeHandler(request, response);
    });

    const response = await fetch(`${baseUrl}/api/room/A2A2A2/join`, { method: 'POST' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, code: 'A2A2A2' });
  });

  test('falls back to dynamic route params from the request path', async () => {
    const webHandler = (_request: Request, params: { code: string }): Response => {
      return Response.json({ ok: true, code: params.code });
    };
    const baseUrl = await listen(universalHandler(webHandler, roomCodeParams('code')));

    const response = await fetch(`${baseUrl}/api/room/K7M2P9/join`, { method: 'POST' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, code: 'K7M2P9' });
  });

  test('streams Web Response chunks without waiting for the body to close', async () => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let closeStream = (): void => {};
    const handler = universalHandler(() => {
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('event: heartbeat\n\n'));
          closeStream = () => controller.close();
        },
      }), {
        headers: { 'content-type': 'text/event-stream; charset=utf-8' },
      });
    });
    const baseUrl = await listen(handler);

    const response = await withTimeout(fetch(`${baseUrl}/api/sse/ROOM1`), 200);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('ERR_MISSING_RESPONSE_BODY');
    const firstChunk = await withTimeout(reader.read(), 200);

    expect(response.status).toBe(200);
    expect(decoder.decode(firstChunk.value)).toBe('event: heartbeat\n\n');

    closeStream();
    const lastChunk = await withTimeout(reader.read(), 200);
    expect(lastChunk.done).toBe(true);
  });

  test('still returns a Web Response when called directly by unit tests', async () => {
    const handler = universalHandler((request: Request) => {
      return Response.json({ ok: true, method: request.method });
    });

    const response = await handler(new Request('https://gdo.ax0x.ai/api/room/list'));

    expect(response).toBeInstanceOf(Response);
    expect(await response?.json()).toEqual({ ok: true, method: 'GET' });
  });
});

async function listen(
  handler: (request: VercelNodeRequest, response: ServerResponse) => Promise<Response | void> | Response | void,
): Promise<string> {
  const server = createServer((request, response) => {
    Promise.resolve(handler(request as VercelNodeRequest, response)).catch((error: unknown) => {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.stack : String(error));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error('ERR_TEST_TIMEOUT')), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
