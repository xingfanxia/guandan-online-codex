import { describe, expect, test } from 'vitest';
import { type Card } from '../../lib/game/cards';
import { type PlayingState } from '../../lib/game/state';
import { MessageType } from '../../lib/realtime/messages';
import { playerChannel, publishToPlayer, type RealtimePublisher } from '../../lib/realtime/upstash';

function c(rank: Card['rank'], suit: Card['suit'] = 'spades', deck = 1): Card {
  return { rank, suit, deck: deck as 1 | 2 };
}

describe('realtime publisher wrapper', () => {
  test('publishes filtered payloads to per-player channels', async () => {
    const published: Array<{ channel: string; payload: string }> = [];
    const publisher: RealtimePublisher = {
      async publish(channel, payload) {
        published.push({ channel, payload });
      },
    };
    const state: PlayingState = {
      phase: 'playing',
      mode: '4',
      levelRank: '2',
      players: [
        { id: 'p1', seat: 'east', team: 't1' },
        { id: 'p2', seat: 'south', team: 't2' },
      ],
      hands: {
        p1: [c('3')],
        p2: [c('RJ', 'joker')],
      },
      undealt: [],
      finished: [],
      currentTurn: 'p1',
      currentTrick: { leader: 'p1', passes: [] },
      version: 1,
    };

    await publishToPlayer(publisher, 'K7M2P9', 'p1', { type: MessageType.StateResync, reason: 'test' }, state);

    expect(playerChannel('K7M2P9', 'p1')).toBe('game:K7M2P9:player:p1');
    expect(published).toHaveLength(1);
    expect(published[0]!.channel).toBe('game:K7M2P9:player:p1');
    expect(JSON.parse(published[0]!.payload)).toMatchObject({
      type: MessageType.StateResync,
      view: {
        self: { playerId: 'p1', hand: [c('3')] },
        handCounts: { p1: 1, p2: 1 },
      },
    });
    expect(published[0]!.payload).not.toContain('RJ');
  });
});
