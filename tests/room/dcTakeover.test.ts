import { describe, expect, test } from 'vitest';
import { MessageType } from '../../lib/realtime/messages';
import { applyBotTakeovers, reclaimBotTakeover } from '../../lib/room/botTakeover';
import type { RoomRecord } from '../../lib/room/lifecycle';
import { DEFAULT_ROOM_RULES } from '../../lib/room/rules';
import type { Card } from '../../lib/game/cards';
import type { PlayingState } from '../../lib/game/state';

function c(rank: Card['rank'], suit: Card['suit'] = 'spades', deck: Card['deck'] = 1): Card {
  return { rank, suit, deck };
}

function room(): RoomRecord {
  return {
    code: 'K7M2P9',
    hostHandle: 'fufu',
    hostToken: 'host-token',
    joinToken: 'join-token',
    players: [
      {
        id: 'p1',
        handle: 'fufu',
        role: 'host',
        playerToken: 'player-token',
        connectionStatus: 'online',
        lastSeenAt: '2026-05-18T00:00:00.000Z',
      },
    ],
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

describe('disconnect bot takeover helpers', () => {
  test('promotes a timed-out human to a reclaimable medium bot', () => {
    const result = applyBotTakeovers(room(), state(), {
      nowIso: () => '2026-05-18T00:01:01.000Z',
    });

    expect(result.changed).toBe(true);
    expect(result.events).toEqual([
      { type: MessageType.PlayerDc, playerId: 'p1' },
      { type: MessageType.BotTakeover, playerId: 'p1', difficulty: 'medium' },
    ]);
    expect(result.room.players[0]).toMatchObject({
      connectionStatus: 'bot-takeover',
      takeoverAt: '2026-05-18T00:01:01.000Z',
      reclaimUntil: '2026-05-18T00:06:01.000Z',
    });
    expect(result.state.players[0]).toMatchObject({
      kind: 'bot',
      botDifficulty: 'medium',
      connectionStatus: 'bot-takeover',
      displayName: '@fufu · 代打',
    });
  });

  test('reclaims a takeover when the player reconnects within the reclaim window', () => {
    const takeover = applyBotTakeovers(room(), state(), {
      nowIso: () => '2026-05-18T00:01:01.000Z',
    });

    const reclaimed = reclaimBotTakeover(takeover.room, takeover.state, 'p1', {
      nowIso: () => '2026-05-18T00:03:00.000Z',
    });

    expect(reclaimed.changed).toBe(true);
    expect(reclaimed.events).toEqual([{ type: MessageType.PlayerReconnect, playerId: 'p1' }]);
    expect(reclaimed.room.players[0]).toMatchObject({
      connectionStatus: 'online',
      lastSeenAt: '2026-05-18T00:03:00.000Z',
    });
    expect(reclaimed.state.players[0]).toMatchObject({
      kind: 'human',
      handle: 'fufu',
      displayName: '@fufu',
      connectionStatus: 'online',
    });
    expect(reclaimed.state.players[0]).not.toHaveProperty('botDifficulty');
  });
});
