import type { PlayerId } from '../game/state';
import type { RoomRecord, RoomStore } from './lifecycle';

export type MarkSeenResult =
  | { ok: true; room: RoomRecord }
  | { ok: false; error: 'ERR_ROOM_NOT_FOUND' | 'ERR_PLAYER_NOT_IN_ROOM' };

export function touchRoomPlayer(room: RoomRecord, playerId: PlayerId, nowIso: () => string = () => new Date().toISOString()): MarkSeenResult {
  const player = room.players.find((candidate) => candidate.id === playerId);
  if (!player) return { ok: false, error: 'ERR_PLAYER_NOT_IN_ROOM' };
  if (player.connectionStatus === 'bot-takeover') return { ok: true, room };

  const now = nowIso();
  player.connectionStatus = 'online';
  player.lastSeenAt = now;
  delete player.disconnectedAt;
  room.updatedAt = now;
  return { ok: true, room };
}

export async function markRoomPlayerSeen(
  store: RoomStore,
  code: string,
  playerId: PlayerId,
  nowIso?: () => string,
): Promise<MarkSeenResult> {
  const room = await store.get(code);
  if (!room) return { ok: false, error: 'ERR_ROOM_NOT_FOUND' };

  const result = touchRoomPlayer(room, playerId, nowIso);
  if (!result.ok) return result;
  await store.set(code, result.room);
  return result;
}
