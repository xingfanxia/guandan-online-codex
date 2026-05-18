import { describe, expect, test } from 'vitest';
import { MESSAGE_TYPES, MessageType, type ServerEvent } from '../../lib/realtime/messages';

describe('realtime messages', () => {
  test('defines the canonical P0 event type list', () => {
    expect(MESSAGE_TYPES).toEqual([
      'room_joined',
      'move_played',
      'tribute_pending',
      'tribute_completed',
      'tribute_resolved',
      'anti_tribute',
      'return_required',
      'exchange_vote_required',
      'exchange_vote_resolved',
      'exchange_select_required',
      'exchange_completed',
      'round_end',
      'game_end',
      'state_resync',
      'player_dc',
      'player_reconnect',
      'bot_takeover',
      'chat_message',
      'heartbeat',
      'error',
    ]);
    expect(MessageType.MovePlayed).toBe('move_played');
  });

  test('ServerEvent is discriminated by MessageType', () => {
    const event: ServerEvent = {
      type: MessageType.Error,
      code: 'ERR_TEST',
      message: 'test error',
    };

    expect(event.type).toBe('error');
  });

  test('defines exchange and detailed tribute events', () => {
    expect(MessageType.ExchangeVoteRequired).toBe('exchange_vote_required');
    expect(MessageType.ExchangeCompleted).toBe('exchange_completed');
    expect<MessageType>(MessageType.ReturnRequired).toBe('return_required');
  });
});
