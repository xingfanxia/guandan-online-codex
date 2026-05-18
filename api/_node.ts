import { once } from 'node:events';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';

type MaybePromise<T> = T | Promise<T>;

export interface VercelNodeRequest extends IncomingMessage {
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
}

export type WebRouteHandler<Params> = (request: Request, params: Params) => MaybePromise<Response>;
export type NodeParamsResolver<Params> = (request: VercelNodeRequest) => Params;
export interface UniversalRouteHandler<Params> {
  (request: Request, params?: Params): Promise<Response>;
  (request: VercelNodeRequest, response: ServerResponse): Promise<void>;
}

export function universalHandler<Params = undefined>(
  handler: WebRouteHandler<Params>,
  resolveParams?: NodeParamsResolver<Params>,
): UniversalRouteHandler<Params> {
  return async function handleUniversal(
    request: Request | VercelNodeRequest,
    responseOrParams?: ServerResponse | Params,
  ): Promise<Response | void> {
    if (request instanceof Request) {
      return handler(request, responseOrParams as Params);
    }

    const nodeResponse = responseOrParams as ServerResponse | undefined;
    if (!nodeResponse) throw new Error('ERR_NODE_RESPONSE_REQUIRED');
    const webRequest = await toWebRequest(request);
    const params = resolveParams ? resolveParams(request) : (undefined as Params);
    const webResponse = await handler(webRequest, params);
    await sendWebResponse(nodeResponse, webResponse);
  } as UniversalRouteHandler<Params>;
}

export function roomCodeParams(paramName: string): NodeParamsResolver<{ code: string }> {
  return (request) => ({ code: routeParam(request, paramName) });
}

export function roomIdParams(paramName: string): NodeParamsResolver<{ roomId: string }> {
  return (request) => ({ roomId: routeParam(request, paramName) });
}

function oneQueryParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function routeParam(request: VercelNodeRequest, paramName: string): string {
  const queryValue = oneQueryParam(request.query?.[paramName]);
  if (queryValue) return queryValue;

  const parts = new URL(nodeRequestUrl(request)).pathname.split('/').filter(Boolean);
  if (paramName === 'code') {
    const roomIndex = parts.indexOf('room');
    return roomIndex >= 0 ? parts[roomIndex + 1] ?? '' : '';
  }
  if (paramName === 'roomId') {
    const routeIndex = parts.findIndex((part) => part === 'poll' || part === 'sse');
    return routeIndex >= 0 ? parts[routeIndex + 1] ?? '' : '';
  }
  return '';
}

async function toWebRequest(request: VercelNodeRequest): Promise<Request> {
  const headers = toWebHeaders(request.headers);
  const method = request.method ?? 'GET';
  const init: RequestInit = { method, headers };
  if (method !== 'GET' && method !== 'HEAD') {
    const body = await readNodeBody(request);
    if (body) init.body = body;
  }
  return new Request(nodeRequestUrl(request), init);
}

function toWebHeaders(headers: IncomingHttpHeaders): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') result.set(key, value);
    else if (Array.isArray(value)) result.set(key, value.join(', '));
  }
  return result;
}

async function readNodeBody(request: VercelNodeRequest): Promise<BodyInit | undefined> {
  if (request.body !== undefined) {
    if (typeof request.body === 'string') return request.body;
    if (request.body instanceof Uint8Array) return Buffer.from(request.body).toString('utf8');
    return JSON.stringify(request.body);
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : undefined;
}

function nodeRequestUrl(request: VercelNodeRequest): string {
  const host = request.headers.host ?? 'localhost';
  const protocol = request.headers['x-forwarded-proto'] ?? 'https';
  return `${Array.isArray(protocol) ? protocol[0] : protocol}://${host}${request.url ?? '/'}`;
}

async function sendWebResponse(response: ServerResponse, webResponse: Response): Promise<void> {
  response.statusCode = webResponse.status;
  webResponse.headers.forEach((value, key) => {
    response.setHeader(key, value);
  });

  if (!webResponse.body) {
    response.end();
    return;
  }

  const reader = webResponse.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && !response.write(Buffer.from(value))) {
        await once(response, 'drain');
      }
    }
    response.end();
  } catch (error) {
    response.destroy(error instanceof Error ? error : undefined);
  }
}
