import { postWithLatencyBeacon } from '../telemetry/beacon';
import type { GameMode } from '../../../lib/game/mode';
import type { ClientStateView } from '../../../lib/realtime/payload';

export interface RoomPlayerDto {
  id: string;
  handle: string;
  role: 'host' | 'player';
  connectionStatus?: 'online' | 'disconnected' | 'bot-takeover';
}

export interface PublicRoomDto {
  code: string;
  hostHandle: string;
  players: RoomPlayerDto[];
  mode: GameMode;
  maxPlayers: number;
  visibility: 'public' | 'unlisted' | 'invite-only';
  status: 'waiting' | 'playing';
  updatedAt: string;
}

export type RoomApiError = { ok: false; error: string };
export type CreateRoomResult = { ok: true; room: PublicRoomDto; hostToken: string; joinToken: string; playerToken: string } | RoomApiError;
export type JoinRoomResult = {
  ok: true;
  room: PublicRoomDto;
  player: RoomPlayerDto;
  playerToken: string;
  warnings?: unknown[];
} | RoomApiError;
export type StartRoomResult = {
  ok: true;
  phase: 'playing' | string;
  mode?: GameMode;
  version: number;
  players: unknown[];
  view?: ClientStateView;
  events?: string[];
  eventIds?: Record<string, string[]>;
} | RoomApiError;
export type LeaveRoomResult = { ok: true } | RoomApiError;
export type KickPlayerResult = { ok: true; room: PublicRoomDto } | RoomApiError;
export type ListRoomsResult = { ok: true; rooms: PublicRoomDto[] } | RoomApiError;

export interface CreateRoomInput {
  hostHandle: string;
  mode?: GameMode;
  rules?: Record<string, unknown>;
  visibility?: PublicRoomDto['visibility'];
  fetcher?: typeof fetch;
  nowMs?: () => number;
}

export interface JoinRoomInput {
  code: string;
  handle: string;
  token?: string;
  fetcher?: typeof fetch;
  nowMs?: () => number;
}

export interface StartRoomInput {
  code: string;
  hostToken: string;
  fillBots: boolean;
  botDifficulty: 'easy' | 'medium';
  fetcher?: typeof fetch;
  nowMs?: () => number;
}

export interface LeaveRoomInput {
  code: string;
  handle: string;
  token: string;
  fetcher?: typeof fetch;
  nowMs?: () => number;
}

export interface KickPlayerInput {
  code: string;
  hostToken: string;
  playerId: string;
  fetcher?: typeof fetch;
  nowMs?: () => number;
}

export interface ListRoomsInput {
  fetcher?: typeof fetch;
}

export async function createRoom({
  hostHandle,
  mode = '4',
  rules = {},
  visibility = 'public',
  fetcher,
  nowMs,
}: CreateRoomInput): Promise<CreateRoomResult> {
  const response = await postWithLatencyBeacon('/api/room/create', {
    body: { hostHandle, mode, rules, visibility },
    ...(fetcher ? { fetcher } : {}),
    ...(nowMs ? { nowMs } : {}),
  });
  return response.json();
}

export async function joinRoom({
  code,
  handle,
  token,
  fetcher,
  nowMs,
}: JoinRoomInput): Promise<JoinRoomResult> {
  const body: Record<string, unknown> = { handle };
  if (token) body.token = token;
  const response = await postWithLatencyBeacon(`/api/room/${code}/join`, {
    body,
    ...(fetcher ? { fetcher } : {}),
    ...(nowMs ? { nowMs } : {}),
  });
  return response.json();
}

export async function startRoom({
  code,
  hostToken,
  fillBots,
  botDifficulty,
  fetcher,
  nowMs,
}: StartRoomInput): Promise<StartRoomResult> {
  const response = await postWithLatencyBeacon(`/api/room/${code}/start`, {
    body: { hostToken, fillBots, botDifficulty },
    ...(fetcher ? { fetcher } : {}),
    ...(nowMs ? { nowMs } : {}),
  });
  return response.json();
}

export async function leaveRoom({
  code,
  handle,
  token,
  fetcher,
  nowMs,
}: LeaveRoomInput): Promise<LeaveRoomResult> {
  const response = await postWithLatencyBeacon(`/api/room/${code}/leave`, {
    body: { handle, token },
    ...(fetcher ? { fetcher } : {}),
    ...(nowMs ? { nowMs } : {}),
  });
  return response.json();
}

export async function kickPlayer({
  code,
  hostToken,
  playerId,
  fetcher,
  nowMs,
}: KickPlayerInput): Promise<KickPlayerResult> {
  const response = await postWithLatencyBeacon(`/api/room/${code}/kick`, {
    body: { hostToken, playerId },
    ...(fetcher ? { fetcher } : {}),
    ...(nowMs ? { nowMs } : {}),
  });
  return response.json();
}

export async function listRooms({ fetcher = fetch }: ListRoomsInput = {}): Promise<ListRoomsResult> {
  const response = await fetcher('/api/room/list');
  return response.json();
}
