import { describe, expect, test } from 'vitest';
import { createSuggestMoveHandler } from '../../api/assist/suggest';
import type { Card } from '../../lib/game/cards';
import type { PlayingState } from '../../lib/game/state';
import { MemoryGameStateStore } from '../../lib/realtime/stateStore';
import { createRoom, MemoryRoomStore } from '../../lib/room/lifecycle';

function c(rank: Card['rank'], suit: Card['suit'] = 'spades', deck: Card['deck'] = 1): Card {
  return { rank, suit, deck };
}

function request(body: unknown, method = 'POST'): Request {
  const init: RequestInit = { method, headers: { 'content-type': 'application/json' } };
  if (method === 'POST') init.body = JSON.stringify(body);
  return new Request('https://gdo.ax0x.ai/api/assist/suggest', init);
}

function playingState(): PlayingState {
  return {
    phase: 'playing',
    mode: '4',
    levelRank: '5',
    players: [
      { id: 'p1', seat: 'east', team: 't1' },
      { id: 'p2', seat: 'south', team: 't2' },
      { id: 'p3', seat: 'west', team: 't1' },
      { id: 'p4', seat: 'north', team: 't2' },
    ],
    hands: {
      p1: [c('3'), c('4'), c('5', 'hearts')],
      p2: [c('A')],
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

describe('api/assist/suggest handler', () => {
  test('returns a server-side move suggestion after validating the player token', async () => {
    const roomStore = new MemoryRoomStore();
    const created = await createRoom(roomStore, { hostHandle: 'fufu', random: () => 0 });
    const stateStore = new MemoryGameStateStore([[created.room.code, playingState()]]);
    const handler = createSuggestMoveHandler({ roomStore, stateStore });

    const denied = await handler(request({
      roomId: created.room.code,
      playerId: 'p1',
      token: 'wrong',
    }));
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ ok: false, error: 'ERR_INVALID_PLAYER_TOKEN' });

    const allowed = await handler(request({
      roomId: created.room.code,
      playerId: 'p1',
      token: created.playerToken,
    }));
    const body = await allowed.json();

    expect(allowed.status).toBe(200);
    expect(body).toMatchObject({ ok: true, description: expect.any(String), move: { type: 'play' } });
    expect(JSON.stringify(body)).not.toContain('"p2"');
  });

  test('returns named errors for non-playing states and malformed requests', async () => {
    const roomStore = new MemoryRoomStore();
    const created = await createRoom(roomStore, { hostHandle: 'fufu', random: () => 0 });
    const stateStore = new MemoryGameStateStore([[created.room.code, {
      phase: 'waiting',
      mode: '4',
      levelRank: '5',
      players: [],
      version: 1,
    }]]);
    const handler = createSuggestMoveHandler({ roomStore, stateStore });

    expect(await (await handler(request({}, 'GET'))).json()).toEqual({ ok: false, error: 'ERR_METHOD_NOT_ALLOWED' });
    expect(await (await handler(request({}))).json()).toEqual({ ok: false, error: 'ERR_INVALID_REQUEST' });
    expect(await (await handler(request({
      roomId: created.room.code,
      playerId: 'p1',
      token: created.playerToken,
    }))).json()).toEqual({ ok: false, error: 'ERR_NOT_PLAYING' });
  });
});
