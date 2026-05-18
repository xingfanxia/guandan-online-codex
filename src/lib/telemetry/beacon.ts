export interface LatencyBeaconOptions {
  route: string;
  durationMs: number;
  fetcher?: typeof fetch;
}

export interface PostWithLatencyOptions {
  body: unknown;
  fetcher?: typeof fetch;
  nowMs?: () => number;
}

export async function sendLatencyBeacon({
  route,
  durationMs,
  fetcher = fetch,
}: LatencyBeaconOptions): Promise<void> {
  try {
    await fetcher('/api/telemetry/latency', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ route, durationMs: Math.round(durationMs) }),
      keepalive: true,
    });
  } catch {
    // Telemetry must never block gameplay.
  }
}

export async function postWithLatencyBeacon(
  route: string,
  { body, fetcher = fetch, nowMs = () => performance.now() }: PostWithLatencyOptions,
): Promise<Response> {
  const startedAt = nowMs();
  const response = await fetcher(route, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  await sendLatencyBeacon({
    route,
    durationMs: nowMs() - startedAt,
    fetcher,
  });
  return response;
}
