export type RoomVisibility = 'public' | 'unlisted' | 'invite-only';

export function normalizeRoomVisibility(value: unknown = 'public'): RoomVisibility {
  if (value === 'public' || value === 'unlisted' || value === 'invite-only') return value;
  throw new Error('ERR_INVALID_ROOM_VISIBILITY');
}
