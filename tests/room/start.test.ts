import { describe, expect, test } from 'vitest';
import { generateDeckForMode, generateDoubleDeck } from '../../lib/game/cards';
import { createRoom, joinRoom, kickRoomPlayer, MemoryRoomStore } from '../../lib/room/lifecycle';
import { startRoomGame } from '../../lib/room/start';

describe('room start', () => {
  test('builds a 4P playing state and fills empty seats with bots', async () => {
    const store = new MemoryRoomStore();
    const created = await createRoom(store, {
      hostHandle: '@Fufu',
      random: () => 0,
      nowIso: () => '2026-05-18T00:00:00.000Z',
    });

    const result = startRoomGame(created.room, {
      deck: generateDoubleDeck(),
      fillBots: true,
      botDifficulty: 'easy',
      firstLeaderRandom: () => 0,
    });

    expect(result).toMatchObject({
      phase: 'playing',
      mode: '4',
      currentTurn: 'p1',
      players: [
        { id: 'p1', seat: 'east', team: 't1', kind: 'human', handle: 'fufu', displayName: '@fufu' },
        { id: 'p2', seat: 'south', team: 't2', kind: 'bot', botDifficulty: 'easy', handle: 'bot_doudou_2', displayName: '@豆豆' },
        { id: 'p3', seat: 'west', team: 't1', kind: 'bot', botDifficulty: 'easy', handle: 'bot_maomao_3', displayName: '@毛毛' },
        { id: 'p4', seat: 'north', team: 't2', kind: 'bot', botDifficulty: 'easy', handle: 'bot_xiaoyu_4', displayName: '@小雨' },
      ],
      version: 1,
    });
    expect(result.hands.p1).toHaveLength(27);
    expect(result.hands.p4).toHaveLength(27);
  });

  test('uses the room mode when starting 6P and 8P rooms', async () => {
    const store = new MemoryRoomStore();
    const six = await createRoom(store, {
      hostHandle: '@Fufu',
      random: () => 0,
      mode: '6',
    });
    const eight = await createRoom(store, {
      hostHandle: '@Momo',
      random: () => 0.1,
      mode: '8',
    });

    const sixResult = startRoomGame(six.room, {
      deck: generateDeckForMode('6'),
      fillBots: true,
      botDifficulty: 'medium',
      firstLeaderRandom: () => 0,
    });
    const eightResult = startRoomGame(eight.room, {
      deck: generateDeckForMode('8'),
      fillBots: true,
      botDifficulty: 'easy',
      firstLeaderRandom: () => 0,
    });

    expect(sixResult.mode).toBe('6');
    expect(sixResult.players).toHaveLength(6);
    expect(Object.values(sixResult.hands).map((hand) => hand.length)).toEqual([27, 27, 27, 27, 27, 27]);
    expect(sixResult.players[5]).toMatchObject({ id: 'p6', kind: 'bot', botDifficulty: 'medium' });

    expect(eightResult.mode).toBe('8');
    expect(eightResult.players).toHaveLength(8);
    expect(Object.values(eightResult.hands).map((hand) => hand.length)).toEqual([27, 27, 27, 27, 27, 27, 27, 27]);
    expect(eightResult.undealt).toHaveLength(0);
    expect(eightResult.players[7]).toMatchObject({ id: 'p8', kind: 'bot', botDifficulty: 'easy' });
  });

  test('uses the room team structure when starting 6P and 8P teams-of-2 rooms', async () => {
    const store = new MemoryRoomStore();
    const six = await createRoom(store, {
      hostHandle: '@Fufu',
      random: () => 0,
      mode: '6',
      rules: { teamStructure: 'teams-of-2' },
    });
    const eight = await createRoom(store, {
      hostHandle: '@Momo',
      random: () => 0.1,
      mode: '8',
      rules: { teamStructure: 'teams-of-2' },
    });

    const sixResult = startRoomGame(six.room, {
      deck: generateDeckForMode('6'),
      fillBots: true,
      botDifficulty: 'easy',
      firstLeaderRandom: () => 0,
    });
    const eightResult = startRoomGame(eight.room, {
      deck: generateDeckForMode('8'),
      fillBots: true,
      botDifficulty: 'easy',
      firstLeaderRandom: () => 0,
    });

    expect(sixResult.players.map((player) => player.team)).toEqual(['t1', 't2', 't3', 't1', 't2', 't3']);
    expect(eightResult.players.map((player) => player.team)).toEqual(['t1', 't2', 't3', 't4', 't1', 't2', 't3', 't4']);
    expect(sixResult.progression?.levels).toMatchObject({ t1: '2', t2: '2', t3: '2' });
    expect(eightResult.progression?.levels).toMatchObject({ t1: '2', t2: '2', t3: '2', t4: '2' });
  });

  test('keeps human room ids aligned with their game seats after a kicked seat is refilled', async () => {
    const store = new MemoryRoomStore();
    const created = await createRoom(store, { hostHandle: '@Fufu', random: () => 0 });
    await joinRoom(store, created.room.code, { handle: '@Momo' });
    await joinRoom(store, created.room.code, { handle: '@Doudou' });
    await kickRoomPlayer(store, created.room.code, { hostToken: created.hostToken, playerId: 'p2' });
    await joinRoom(store, created.room.code, { handle: '@Xiaoyu' });
    const room = await store.get(created.room.code);

    const result = startRoomGame(room!, {
      deck: generateDoubleDeck(),
      fillBots: true,
      botDifficulty: 'easy',
      firstLeaderRandom: () => 0,
    });

    expect(result.players).toMatchObject([
      { id: 'p1', kind: 'human', handle: 'fufu' },
      { id: 'p2', kind: 'human', handle: 'xiaoyu' },
      { id: 'p3', kind: 'human', handle: 'doudou' },
      { id: 'p4', kind: 'bot' },
    ]);
  });

  test('uses revealed-card first leader instead of always starting from the host', async () => {
    const store = new MemoryRoomStore();
    const created = await createRoom(store, { hostHandle: '@Fufu', random: () => 0 });

    const result = startRoomGame(created.room, {
      deck: generateDoubleDeck(),
      fillBots: true,
      botDifficulty: 'easy',
      firstLeaderRandom: () => 0.5,
    });

    expect(result.currentTurn).toBe('p3');
    expect(result.currentTrick).toMatchObject({ leader: 'p3', passes: [] });
  });

  test('rejects starting without enough humans when bot fill is disabled', async () => {
    const store = new MemoryRoomStore();
    const created = await createRoom(store, { hostHandle: '@Fufu', random: () => 0 });

    expect(() => startRoomGame(created.room, {
      deck: generateDoubleDeck(),
      fillBots: false,
      botDifficulty: 'easy',
    })).toThrow('ERR_NOT_ENOUGH_PLAYERS');
  });
});
