import { describe, expect, test } from 'vitest';
import { createReclaimRoomHandler } from '../../api/room/[code]/reclaim';
import type { Card } from '../../lib/game/cards';
import type { PlayingState } from '../../lib/game/state';
import { MemoryEventLog } from '../../lib/realtime/eventLog';
import { MemoryGameStateStore } from '../../lib/realtime/stateStore';
import type { RealtimePublisher } from '../../lib/realtime/upstash';
import { applyBotTakeovers } from '../../lib/room/botTakeover';
import { MemoryRoomStore, type RoomRecord } from '../../lib/room/lifecycle';
import { DEFAULT_ROOM_RULES } from '../../lib/room/rules';

function c(rank: Card['rank'], suit: Card['suit'] = 'spades', deck: Card['deck'] = 1): Card {
  return { rank, suit, deck };
}

function request(body: unknown): Request {
  return new Request('https://gdo.ax0x.ai/api/room/K7M2P9/reclaim', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
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

describe('api/room/[code]/reclaim handler', () => {
  test('reclaims a bot-taken player with the stored player token', async () => {
    const takeover = applyBotTakeovers(room(), state(), {
      nowIso: () => '2026-05-18T00:01:01.000Z',
    });
    const roomStore = new MemoryRoomStore();
    await roomStore.set('K7M2P9', takeover.room);
    const stateStore = new MemoryGameStateStore([['K7M2P9', takeover.state]]);
    const eventLog = new MemoryEventLog();
    const published: Array<{ channel: string; payload: string }> = [];
    const publisher: RealtimePublisher = {
      async publish(channel, payload) {
        published.push({ channel, payload });
      },
    };
    const handler = createReclaimRoomHandler({
      roomStore,
      stateStore,
      eventLog,
      publisher,
      nowIso: () => '2026-05-18T00:03:00.000Z',
    });

    const response = await handler(request({ playerId: 'p1', token: 'player-token' }), { code: 'K7M2P9' });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      reclaimed: true,
      phase: 'playing',
      version: 1,
      events: ['player_reconnect'],
      view: {
        phase: 'playing',
        self: { playerId: 'p1', hand: [c('3'), c('4')] },
      },
      room: {
        players: [{ id: 'p1', connectionStatus: 'online' }],
      },
    });
    expect(await roomStore.get('K7M2P9')).toMatchObject({
      players: [{ id: 'p1', connectionStatus: 'online', lastSeenAt: '2026-05-18T00:03:00.000Z' }],
    });
    expect((await stateStore.get('K7M2P9'))?.players).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'p1', kind: 'human', connectionStatus: 'online' }),
    ]));
    expect(eventLog.replayAfter('K7M2P9', 'p1').map((entry) => entry.payload.type)).toEqual(['player_reconnect']);
    expect(published).toHaveLength(4);
  });

  test('returns a current filtered view when there is no takeover to reclaim', async () => {
    const roomStore = new MemoryRoomStore();
    await roomStore.set('K7M2P9', room());
    const handler = createReclaimRoomHandler({
      roomStore,
      stateStore: new MemoryGameStateStore([['K7M2P9', state()]]),
      eventLog: new MemoryEventLog(),
      publisher: { async publish() {} },
    });

    expect(await (await handler(request({ playerId: 'p1', token: 'player-token' }), { code: 'K7M2P9' })).json()).toMatchObject({
      ok: true,
      reclaimed: false,
      events: ['state_resync'],
      view: { phase: 'playing', self: { playerId: 'p1', hand: [c('3'), c('4')] } },
    });
  });

  test('requires the original player token', async () => {
    const roomStore = new MemoryRoomStore();
    await roomStore.set('K7M2P9', room());
    const handler = createReclaimRoomHandler({
      roomStore,
      stateStore: new MemoryGameStateStore([['K7M2P9', state()]]),
      eventLog: new MemoryEventLog(),
      publisher: { async publish() {} },
    });

    expect(await (await handler(request({ playerId: 'p1', token: 'wrong' }), { code: 'K7M2P9' })).json()).toEqual({
      ok: false,
      error: 'ERR_INVALID_PLAYER_TOKEN',
    });
  });
});
