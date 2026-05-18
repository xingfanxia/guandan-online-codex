export interface EventSourceUrlOptions {
  baseUrl: string;
  roomId: string;
  playerId: string;
  token?: string;
  lastEventId?: string;
}

export function buildEventSourceUrl({
  baseUrl,
  roomId,
  playerId,
  token,
  lastEventId,
}: EventSourceUrlOptions): string {
  const url = new URL(`/api/sse/${encodeURIComponent(roomId)}`, baseUrl);
  url.searchParams.set('playerId', playerId);
  if (token) url.searchParams.set('token', token);
  if (lastEventId) url.searchParams.set('lastEventId', lastEventId);
  return url.toString();
}

export function buildPollUrl(options: EventSourceUrlOptions): string {
  const url = new URL(`/api/poll/${encodeURIComponent(options.roomId)}`, options.baseUrl);
  url.searchParams.set('playerId', options.playerId);
  if (options.token) url.searchParams.set('token', options.token);
  if (options.lastEventId) url.searchParams.set('lastEventId', options.lastEventId);
  return url.toString();
}

export class RealtimeCursor {
  #lastEventId: string | undefined;

  get lastEventId(): string | undefined {
    return this.#lastEventId;
  }

  record(event: { lastEventId?: string }): void {
    if (event.lastEventId) {
      this.#lastEventId = event.lastEventId;
    }
  }
}
