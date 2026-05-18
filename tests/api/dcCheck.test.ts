import { describe, expect, test } from 'vitest';
import { createDcCheckHandler } from '../../api/cron/dcCheck';
import type { Card } from '../../lib/game/cards';
import type { PlayingState, ReturnPendingState } from '../../lib/game/state';
import { MemoryEventLog } from '../../lib/realtime/eventLog';
import { MemoryGameStateStore } from '../../lib/realtime/stateStore';
import { MemoryRoomStore, type RoomRecord } from '../../lib/room/lifecycle';
import { DEFAULT_ROOM_RULES } from '../../lib/room/rules';
import type { RealtimePublisher } from '../../lib/realtime/upstash';

function c(rank: Card['rank'], suit: Card['suit'] = 'spades', deck: Card['deck'] = 1): Card {
  return { rank, suit, deck };
}

function request(secret = 'tick-secret'): Request {
  return new Request('https://gdo.ax0x.ai/api/cron/dcCheck', {
    method: 'GET',
    headers: { 'x-internal-secret': secret },
  });
}

function cronRequest(secret = 'cron-secret'): Request {
  return new Request('https://gdo.ax0x.ai/api/cron/dcCheck', {
    method: 'GET',
    headers: { authorization: `Bearer ${secret}` },
  });
}

function room(): RoomRecord {
  return {
    code: 'K7M2P9',
    hostHandle: 'fufu',
    hostToken: 'host-token',
    joinToken: 'join-token',
    players: [{
      id: 'p1',
      handle: 'fufu',
      role: 'host',
      playerToken: 'player-token',
      connectionStatus: 'online',
      lastSeenAt: '2026-05-18T00:00:00.000Z',
    }],
    rules: DEFAULT_ROOM_RULES,
    mode: '4',
    visibility: 'public',
    status: 'playing',
    createdAt: '2026-05-18T00:00:00.000Z',
    updatedAt: '2026-05-18T00:00:00.000Z',
    maxPlayers: 4,
  };
}

function state(): PlayingState {
  return {
    phase: 'playing',
    mode: '4',
    levelRank: '2',
    players: [
      { id: 'p1', seat: 'east', team: 't1', kind: 'human', handle: 'fufu', displayName: '@fufu' },
      { id: 'p2', seat: 'south', team: 't2' },
      { id: 'p3', seat: 'west', team: 't1' },
      { id: 'p4', seat: 'north', team: 't2' },
    ],
    hands: {
      p1: [c('3'), c('4')],
      p2: [c('5')],
      p3: [c('6')],
      p4: [c('7')],
    },
    undealt: [],
    finished: [],
    currentTurn: 'p1',
    currentTrick: { leader: 'p1', passes: [] },
    version: 1,
  };
}

function returnPendingState(): ReturnPendingState {
  return {
    phase: 'return-pending',
    mode: '4',
    levelRank: '2',
    players: [
      { id: 'p1', seat: 'east', team: 't1', kind: 'human', handle: 'fufu', displayName: '@fufu' },
      { id: 'p2', seat: 'south', team: 't2', kind: 'human', handle: 'momo', displayName: '@momo' },
      { id: 'p3', seat: 'west', team: 't1', kind: 'human', handle: 'doudou', displayName: '@doudou' },
      { id: 'p4', seat: 'north', team: 't2', kind: 'human', handle: 'xiaoyu', displayName: '@xiaoyu' },
    ],
    hands: {
      p1: [c('3')],
      p2: [c('K')],
      p3: [c('4')],
      p4: [c('Q'), c('A')],
    },
    undealt: [],
    exchanges: [{ from: 'p4', to: 'p1', tributeCard: c('A') }],
    selectedReturns: {},
    firstLeader: 'p1',
    deadlineAt: '2026-05-18T00:00:15.000Z',
    version: 30,
  };
}

describe('api/cron/dcCheck handler', () => {
  test('requires the internal secret when configured', async () => {
    const handler = createDcCheckHandler({
      roomStore: new MemoryRoomStore(),
      stateStore: new MemoryGameStateStore(),
      eventLog: new MemoryEventLog(),
      publisher: { async publish() {} },
      internalSecret: 'tick-secret',
    });

    expect(await (await handler(request('wrong'))).json()).toEqual({
      ok: false,
      error: 'ERR_UNAUTHORIZED',
    });
  });

  test('accepts Vercel cron authorization when configured', async () => {
    const handler = createDcCheckHandler({
      roomStore: new MemoryRoomStore(),
      stateStore: new MemoryGameStateStore(),
      eventLog: new MemoryEventLog(),
      publisher: { async publish() {} },
      internalSecret: 'tick-secret',
      cronSecret: 'cron-secret',
    });

    expect(await (await handler(cronRequest())).json()).toMatchObject({
      ok: true,
      roomsScanned: 0,
    });
  });

  test('promotes disconnected current turn players and continues with bot moves', async () => {
    const roomStore = new MemoryRoomStore();
    await roomStore.set('K7M2P9', room());
    const stateStore = new MemoryGameStateStore([['K7M2P9', state()]]);
    const eventLog = new MemoryEventLog();
    const published: Array<{ channel: string; payload: string }> = [];
    const publisher: RealtimePublisher = {
      async publish(channel, payload) {
        published.push({ channel, payload });
      },
    };
    const handler = createDcCheckHandler({
      roomStore,
      stateStore,
      eventLog,
      publisher,
      internalSecret: 'tick-secret',
      nowIso: () => '2026-05-18T00:01:01.000Z',
      random: () => 0.9,
      maxBotMoves: 1,
    });

    const response = await handler(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      roomsScanned: 1,
      takeovers: [{ roomId: 'K7M2P9', playerId: 'p1' }],
      botMoves: [{ roomId: 'K7M2P9', playerId: 'p1' }],
    });
    expect(await roomStore.get('K7M2P9')).toMatchObject({
      players: [{ id: 'p1', connectionStatus: 'bot-takeover' }],
    });
    const storedState = await stateStore.get('K7M2P9');
    expect(storedState).toMatchObject({ phase: 'playing', currentTurn: 'p2' });
    expect(storedState?.players.find((player) => player.id === 'p1')).toMatchObject({
      id: 'p1',
      kind: 'bot',
      botDifficulty: 'medium',
    });
    expect(eventLog.replayAfter('K7M2P9', 'p2').map((entry) => entry.payload.type)).toEqual([
      'player_dc',
      'bot_takeover',
      'move_played',
    ]);
    expect(published.length).toBeGreaterThanOrEqual(12);
  });

  test('advances expired human phase actions for non-playing states', async () => {
    const roomStore = new MemoryRoomStore();
    await roomStore.set('K7M2P9', room());
    const stateStore = new MemoryGameStateStore([['K7M2P9', returnPendingState()]]);
    const eventLog = new MemoryEventLog();
    const published: Array<{ channel: string; payload: string }> = [];
    const publisher: RealtimePublisher = {
      async publish(channel, payload) {
        published.push({ channel, payload });
      },
    };
    const handler = createDcCheckHandler({
      roomStore,
      stateStore,
      eventLog,
      publisher,
      internalSecret: 'tick-secret',
      nowIso: () => '2026-05-18T00:00:16.000Z',
    });

    const response = await handler(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      roomsScanned: 1,
      takeovers: [],
      phaseActions: [{ roomId: 'K7M2P9', playerId: 'p1', type: 'return-timeout' }],
      botMoves: [],
    });
    expect(await stateStore.get('K7M2P9')).toMatchObject({
      phase: 'playing',
      currentTurn: 'p1',
      hands: {
        p1: [c('A')],
        p4: [c('Q'), c('3')],
      },
    });
    expect(eventLog.replayAfter('K7M2P9', 'p1').map((entry) => entry.payload.type)).toEqual(['tribute_resolved']);
    expect(published).toHaveLength(4);
  });
});
