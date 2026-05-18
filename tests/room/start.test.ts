import { describe, expect, test } from 'vitest';
import { generateDoubleDeck } from '../../lib/game/cards';
import { createRoom, MemoryRoomStore } from '../../lib/room/lifecycle';
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
