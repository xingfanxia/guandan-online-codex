import { randomBytes } from 'node:crypto';
import { normalizeHandle, validateHandle } from '../auth/handle';
import type { PlayerConnectionStatus } from '../game/state';
import type { GameMode } from '../game/mode';
import { generateRoomCode } from './code';
import { normalizeRoomVisibility, type RoomVisibility } from './access';
import { sameRoomIpWarning, type SameRoomIpWarning } from './ipWarning';
import { normalizeRoomRules, type RoomRules } from './rules';

type MaybePromise<T> = T | Promise<T>;

export interface RoomPlayer {
  id: string;
  handle: string;
  role: 'host' | 'player';
  playerToken: string;
  clientIp?: string;
  connectionStatus?: PlayerConnectionStatus;
  lastSeenAt?: string;
  disconnectedAt?: string;
  takeoverAt?: string;
  reclaimUntil?: string;
}

export interface RoomRecord {
  code: string;
  hostHandle: string;
  hostToken: string;
  joinToken: string;
  players: RoomPlayer[];
  rules: RoomRules;
  mode: GameMode;
  visibility: RoomVisibility;
  createdAt: string;
  updatedAt: string;
  maxPlayers: number;
}

export type PublicRoomPlayer = Pick<RoomPlayer, 'id' | 'handle' | 'role' | 'connectionStatus'>;
export type PublicRoom = Omit<RoomRecord, 'hostToken' | 'joinToken' | 'players'> & {
  players: PublicRoomPlayer[];
};

export interface RoomStore {
  get(code: string): MaybePromise<RoomRecord | undefined>;
  set(code: string, room: RoomRecord): MaybePromise<void>;
  has(code: string): MaybePromise<boolean>;
  delete(code: string): MaybePromise<void>;
  list(): MaybePromise<RoomRecord[]>;
}

export class MemoryRoomStore implements RoomStore {
  private readonly rooms = new Map<string, RoomRecord>();

  get(code: string): RoomRecord | undefined {
    const room = this.rooms.get(code);
    return room ? cloneRoom(room) : undefined;
  }

  set(code: string, room: RoomRecord): void {
    this.rooms.set(code, cloneRoom(room));
  }

  has(code: string): boolean {
    return this.rooms.has(code);
  }

  delete(code: string): void {
    this.rooms.delete(code);
  }

  list(): RoomRecord[] {
    return [...this.rooms.values()].map(cloneRoom);
  }
}

export async function createRoom(
  store: RoomStore,
  {
    hostHandle,
    random,
    nowIso = () => new Date().toISOString(),
    rules,
    mode,
    visibility,
    clientIp,
  }: {
    hostHandle: string;
    random?: () => number;
    nowIso?: () => string;
    rules?: unknown;
    mode?: unknown;
    visibility?: unknown;
    clientIp?: string;
  },
): Promise<{ room: RoomRecord; hostToken: string; joinToken: string; playerToken: string }> {
  const handle = normalizeHandle(hostHandle);
  if (!validateHandle(handle)) throw new Error('ERR_INVALID_HANDLE');

  const roomMode = normalizeRoomMode(mode);
  const code = await allocateCode(store, random ?? Math.random);
  const hostToken = makeRoomToken('host', code, random);
  const joinToken = makeRoomToken('join', code, random);
  const playerToken = makeRoomToken('player', code, random);
  const now = nowIso();
  const room: RoomRecord = {
    code,
    hostHandle: handle,
    hostToken,
    joinToken,
    players: [{
      id: 'p1',
      handle,
      role: 'host',
      playerToken,
      connectionStatus: 'online',
      lastSeenAt: now,
      ...(clientIp ? { clientIp } : {}),
    }],
    rules: normalizeRoomRules(rules),
    mode: roomMode,
    visibility: normalizeRoomVisibility(visibility),
    createdAt: now,
    updatedAt: now,
    maxPlayers: Number(roomMode),
  };
  await store.set(code, room);
  return { room: cloneRoom(room), hostToken, joinToken, playerToken };
}

export async function listPublicRooms(store: RoomStore): Promise<PublicRoom[]> {
  const rooms = await store.list();
  return rooms
    .filter((room) => room.visibility === 'public')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(publicRoom);
}

export type JoinRoomResult =
  | { ok: true; room: RoomRecord; player: RoomPlayer; playerToken: string; warnings?: SameRoomIpWarning[] }
  | { ok: false; error: 'ERR_ROOM_NOT_FOUND' | 'ERR_INVALID_JOIN_TOKEN' | 'ERR_INVALID_HANDLE' | 'ERR_ROOM_FULL' };

export async function joinRoom(
  store: RoomStore,
  code: string,
  { handle, token, clientIp }: { handle: string; token?: string; clientIp?: string },
): Promise<JoinRoomResult> {
  const room = await store.get(code);
  if (!room) return { ok: false, error: 'ERR_ROOM_NOT_FOUND' };
  if (token && token !== room.joinToken) return { ok: false, error: 'ERR_INVALID_JOIN_TOKEN' };
  if (!token && room.visibility !== 'public') return { ok: false, error: 'ERR_INVALID_JOIN_TOKEN' };

  const normalized = normalizeHandle(handle);
  if (!validateHandle(normalized)) return { ok: false, error: 'ERR_INVALID_HANDLE' };

  const existing = room.players.find((player) => player.handle === normalized);
  if (existing) {
    const now = new Date().toISOString();
    if (existing.connectionStatus !== 'bot-takeover') {
      existing.connectionStatus = 'online';
      existing.lastSeenAt = now;
      room.updatedAt = now;
      await store.set(code, room);
    }
    return { ok: true, room: cloneRoom(room), player: { ...existing }, playerToken: existing.playerToken };
  }
  if (room.players.length >= room.maxPlayers) return { ok: false, error: 'ERR_ROOM_FULL' };

  const warning = clientIp ? sameRoomIpWarning(room, clientIp) : undefined;
  const player: RoomPlayer = {
    id: `p${room.players.length + 1}`,
    handle: normalized,
    role: 'player',
    playerToken: makeRoomToken('player', code),
    connectionStatus: 'online',
    lastSeenAt: new Date().toISOString(),
    ...(clientIp ? { clientIp } : {}),
  };
  room.players.push(player);
  room.updatedAt = new Date().toISOString();
  await store.set(code, room);
  return {
    ok: true,
    room: cloneRoom(room),
    player: { ...player },
    playerToken: player.playerToken,
    ...(warning ? { warnings: [warning] } : {}),
  };
}

export async function leaveRoom(
  store: RoomStore,
  code: string,
  { handle }: { handle: string },
): Promise<{ ok: true } | { ok: false; error: 'ERR_ROOM_NOT_FOUND' | 'ERR_PLAYER_NOT_IN_ROOM' }> {
  const room = await store.get(code);
  if (!room) return { ok: false, error: 'ERR_ROOM_NOT_FOUND' };

  const normalized = normalizeHandle(handle);
  const before = room.players.length;
  room.players = room.players.filter((player) => player.handle !== normalized);
  if (room.players.length === before) return { ok: false, error: 'ERR_PLAYER_NOT_IN_ROOM' };

  if (room.players.length === 0 || normalized === room.hostHandle) {
    await store.delete(code);
  } else {
    room.updatedAt = new Date().toISOString();
    await store.set(code, room);
  }
  return { ok: true };
}

export type KickRoomPlayerResult =
  | { ok: true; room: RoomRecord }
  | {
      ok: false;
      error:
        | 'ERR_ROOM_NOT_FOUND'
        | 'ERR_INVALID_HOST_TOKEN'
        | 'ERR_PLAYER_NOT_IN_ROOM'
        | 'ERR_CANNOT_KICK_HOST';
    };

export async function kickRoomPlayer(
  store: RoomStore,
  code: string,
  { hostToken, playerId }: { hostToken: string; playerId: string },
): Promise<KickRoomPlayerResult> {
  const room = await store.get(code);
  if (!room) return { ok: false, error: 'ERR_ROOM_NOT_FOUND' };
  if (hostToken !== room.hostToken) return { ok: false, error: 'ERR_INVALID_HOST_TOKEN' };

  const player = room.players.find((candidate) => candidate.id === playerId);
  if (!player) return { ok: false, error: 'ERR_PLAYER_NOT_IN_ROOM' };
  if (player.role === 'host' || player.handle === room.hostHandle) {
    return { ok: false, error: 'ERR_CANNOT_KICK_HOST' };
  }

  room.players = room.players.filter((candidate) => candidate.id !== playerId);
  room.updatedAt = new Date().toISOString();
  await store.set(code, room);
  return { ok: true, room: cloneRoom(room) };
}

export function publicRoom(room: RoomRecord): PublicRoom {
  const { hostToken: _hostToken, joinToken: _joinToken, ...publicFields } = room;
  return {
    ...publicFields,
    players: room.players.map(publicRoomPlayer),
  };
}

export function publicRoomPlayer(player: RoomPlayer): PublicRoomPlayer {
  return {
    id: player.id,
    handle: player.handle,
    role: player.role,
    ...(player.connectionStatus ? { connectionStatus: player.connectionStatus } : {}),
  };
}

async function allocateCode(store: RoomStore, random: () => number): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode(random);
    if (!(await store.has(code))) return code;
  }
  throw new Error('ERR_ROOM_CODE_COLLISION');
}

function makeRoomToken(prefix: string, code: string, random?: () => number): string {
  const suffix = random
    ? Math.floor(random() * 1_000_000).toString(36).padStart(4, '0')
    : randomBytes(24).toString('base64url');
  return `${prefix}_${code}_${suffix}`;
}

function normalizeRoomMode(mode: unknown): GameMode {
  if (mode === undefined) return '4';
  if (mode === '4' || mode === '6' || mode === '8') return mode;
  throw new Error('ERR_INVALID_ROOM_MODE');
}

function cloneRoom(room: RoomRecord): RoomRecord {
  return {
    ...room,
    players: room.players.map((player) => ({ ...player })),
  };
}
