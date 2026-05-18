import { MessageType, type ServerEvent } from '../realtime/messages.js';
import type { GameState, Player, PlayerConnectionStatus, PlayerId } from '../game/state.js';
import type { RoomPlayer, RoomRecord } from './lifecycle.js';

export const DEFAULT_DISCONNECT_TIMEOUT_MS = 60_000;
export const DEFAULT_RECLAIM_WINDOW_MS = 300_000;

export interface TakeoverOptions {
  nowIso?: () => string;
  disconnectMs?: number;
  reclaimMs?: number;
  difficulty?: 'easy' | 'medium';
}

export interface TakeoverResult {
  changed: boolean;
  room: RoomRecord;
  state: GameState;
  events: ServerEvent[];
}

export function applyBotTakeovers(
  inputRoom: RoomRecord,
  inputState: GameState,
  {
    nowIso = () => new Date().toISOString(),
    disconnectMs = DEFAULT_DISCONNECT_TIMEOUT_MS,
    reclaimMs = DEFAULT_RECLAIM_WINDOW_MS,
    difficulty = 'medium',
  }: TakeoverOptions = {},
): TakeoverResult {
  const room = cloneRoom(inputRoom);
  const state = cloneState(inputState);
  const events: ServerEvent[] = [];
  if (state.phase !== 'playing') return { changed: false, room, state, events };

  const now = nowIso();
  const nowMs = Date.parse(now);
  for (const roomPlayer of room.players) {
    if (roomPlayer.connectionStatus === 'bot-takeover') continue;
    if (!roomPlayer.lastSeenAt) continue;
    const lastSeenMs = Date.parse(roomPlayer.lastSeenAt);
    if (!Number.isFinite(lastSeenMs) || nowMs - lastSeenMs < disconnectMs) continue;

    const statePlayer = state.players.find((player) => player.id === roomPlayer.id);
    if (!statePlayer || statePlayer.kind === 'bot') continue;

    roomPlayer.connectionStatus = 'bot-takeover';
    roomPlayer.disconnectedAt = roomPlayer.disconnectedAt ?? now;
    roomPlayer.takeoverAt = now;
    roomPlayer.reclaimUntil = new Date(nowMs + reclaimMs).toISOString();
    promotePlayer(statePlayer, roomPlayer, difficulty);
    events.push({ type: MessageType.PlayerDc, playerId: roomPlayer.id });
    events.push({ type: MessageType.BotTakeover, playerId: roomPlayer.id, difficulty });
  }

  if (events.length > 0) room.updatedAt = now;
  return { changed: events.length > 0, room, state, events };
}

export function reclaimBotTakeover(
  inputRoom: RoomRecord,
  inputState: GameState,
  playerId: PlayerId,
  { nowIso = () => new Date().toISOString() }: { nowIso?: () => string } = {},
): TakeoverResult {
  const room = cloneRoom(inputRoom);
  const state = cloneState(inputState);
  const roomPlayer = room.players.find((player) => player.id === playerId);
  const events: ServerEvent[] = [];
  if (!roomPlayer || roomPlayer.connectionStatus !== 'bot-takeover') return { changed: false, room, state, events };

  const now = nowIso();
  if (roomPlayer.reclaimUntil && Date.parse(now) > Date.parse(roomPlayer.reclaimUntil)) {
    return { changed: false, room, state, events };
  }

  roomPlayer.connectionStatus = 'online';
  roomPlayer.lastSeenAt = now;
  delete roomPlayer.disconnectedAt;
  delete roomPlayer.takeoverAt;
  delete roomPlayer.reclaimUntil;
  room.updatedAt = now;

  const statePlayer = state.players.find((player) => player.id === playerId);
  if (statePlayer) restoreHuman(statePlayer, roomPlayer);
  events.push({ type: MessageType.PlayerReconnect, playerId });
  return { changed: true, room, state, events };
}

function promotePlayer(player: Player, roomPlayer: RoomPlayer, difficulty: 'easy' | 'medium'): void {
  player.kind = 'bot';
  player.botDifficulty = difficulty;
  player.handle = roomPlayer.handle;
  player.displayName = `${displayName(roomPlayer)} · 代打`;
  player.connectionStatus = 'bot-takeover';
}

function restoreHuman(player: Player, roomPlayer: RoomPlayer): void {
  player.kind = 'human';
  player.handle = roomPlayer.handle;
  player.displayName = displayName(roomPlayer);
  player.connectionStatus = 'online';
  delete player.botDifficulty;
}

function displayName(player: RoomPlayer): string {
  return `@${player.handle}`;
}

function cloneRoom(room: RoomRecord): RoomRecord {
  return JSON.parse(JSON.stringify(room)) as RoomRecord;
}

function cloneState<T extends GameState>(state: T): T {
  return JSON.parse(JSON.stringify(state)) as T;
}

export function connectionStatusLabel(status: PlayerConnectionStatus | undefined): string | undefined {
  switch (status) {
    case 'disconnected':
      return '断线';
    case 'bot-takeover':
      return '代打';
    case 'online':
    case undefined:
      return undefined;
  }
}
