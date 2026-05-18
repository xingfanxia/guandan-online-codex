import type { RoomRecord } from './lifecycle.js';

export interface SameRoomIpWarning {
  type: 'same_ip';
  ip: string;
  matchingHandles: string[];
}

export function sameRoomIpWarning(room: RoomRecord, joiningIp: string): SameRoomIpWarning | undefined {
  if (!joiningIp || joiningIp === 'unknown') return undefined;
  const matchingHandles = room.players
    .filter((player) => player.clientIp === joiningIp)
    .map((player) => player.handle);
  return matchingHandles.length > 0
    ? { type: 'same_ip', ip: joiningIp, matchingHandles }
    : undefined;
}
