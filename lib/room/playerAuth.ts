import type { PlayerId } from '../game/state.js';
import { normalizeHandle } from '../auth/handle.js';
import type { RoomStore } from './lifecycle.js';

export type RoomPlayerAuthResult =
  | { ok: true }
  | { ok: false; status: number; error: 'ERR_ROOM_NOT_FOUND' | 'ERR_PLAYER_NOT_IN_ROOM' | 'ERR_INVALID_PLAYER_TOKEN' };

export async function authorizeRoomPlayer(
  store: RoomStore,
  roomId: string,
  playerId: PlayerId,
  token: unknown,
): Promise<RoomPlayerAuthResult> {
  const room = await store.get(roomId);
  if (!room) return { ok: false, status: 404, error: 'ERR_ROOM_NOT_FOUND' };

  const player = room.players.find((candidate) => candidate.id === playerId);
  if (!player) return { ok: false, status: 403, error: 'ERR_PLAYER_NOT_IN_ROOM' };
  if (typeof token !== 'string' || !constantTimeEqual(token, player.playerToken)) {
    return { ok: false, status: 403, error: 'ERR_INVALID_PLAYER_TOKEN' };
  }
  return { ok: true };
}

export async function authorizeRoomHandle(
  store: RoomStore,
  roomId: string,
  handle: string,
  token: unknown,
): Promise<RoomPlayerAuthResult> {
  const room = await store.get(roomId);
  if (!room) return { ok: false, status: 404, error: 'ERR_ROOM_NOT_FOUND' };

  const normalized = normalizeHandle(handle);
  const player = room.players.find((candidate) => candidate.handle === normalized);
  if (!player) return { ok: false, status: 403, error: 'ERR_PLAYER_NOT_IN_ROOM' };
  if (typeof token !== 'string' || !constantTimeEqual(token, player.playerToken)) {
    return { ok: false, status: 403, error: 'ERR_INVALID_PLAYER_TOKEN' };
  }
  return { ok: true };
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
