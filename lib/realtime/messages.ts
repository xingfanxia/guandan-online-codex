import type { Card } from '../game/cards.js';
import type { PlayerId } from '../game/state.js';
import type { TeamKey } from '../game/mode.js';
import type { ExchangeDirection } from '../game/exchange.js';

export enum MessageType {
  RoomJoined = 'room_joined',
  MovePlayed = 'move_played',
  TributePending = 'tribute_pending',
  TributeCompleted = 'tribute_completed',
  TributeResolved = 'tribute_resolved',
  AntiTribute = 'anti_tribute',
  ReturnRequired = 'return_required',
  ExchangeVoteRequired = 'exchange_vote_required',
  ExchangeVoteResolved = 'exchange_vote_resolved',
  ExchangeSelectRequired = 'exchange_select_required',
  ExchangeCompleted = 'exchange_completed',
  RoundEnd = 'round_end',
  GameEnd = 'game_end',
  StateResync = 'state_resync',
  PlayerDc = 'player_dc',
  PlayerReconnect = 'player_reconnect',
  BotTakeover = 'bot_takeover',
  ChatMessage = 'chat_message',
  Heartbeat = 'heartbeat',
  Error = 'error',
}

export const MESSAGE_TYPES = [
  MessageType.RoomJoined,
  MessageType.MovePlayed,
  MessageType.TributePending,
  MessageType.TributeCompleted,
  MessageType.TributeResolved,
  MessageType.AntiTribute,
  MessageType.ReturnRequired,
  MessageType.ExchangeVoteRequired,
  MessageType.ExchangeVoteResolved,
  MessageType.ExchangeSelectRequired,
  MessageType.ExchangeCompleted,
  MessageType.RoundEnd,
  MessageType.GameEnd,
  MessageType.StateResync,
  MessageType.PlayerDc,
  MessageType.PlayerReconnect,
  MessageType.BotTakeover,
  MessageType.ChatMessage,
  MessageType.Heartbeat,
  MessageType.Error,
] as const;

export type ServerEvent =
  | { type: MessageType.RoomJoined; playerId: PlayerId }
  | { type: MessageType.MovePlayed; playerId: PlayerId; cards: Card[] }
  | { type: MessageType.TributePending; playerId: PlayerId; toPlayerId?: PlayerId; autoPickCard?: Card }
  | { type: MessageType.TributeCompleted; exchanges: Array<{ fromPlayerId: PlayerId; toPlayerId: PlayerId; card: Card }> }
  | {
      type: MessageType.TributeResolved;
      exchanges: Array<{ fromPlayerId: PlayerId; toPlayerId: PlayerId; tributeCard: Card; returnCard: Card }>;
      firstLeader: PlayerId;
    }
  | { type: MessageType.AntiTribute; team: TeamKey; declaredBy?: PlayerId[]; firstLeader?: PlayerId }
  | { type: MessageType.ReturnRequired; playerId: PlayerId; toPlayerId?: PlayerId; tributeCardReceived?: Card }
  | { type: MessageType.ExchangeVoteRequired; voterIds: PlayerId[]; deadlineAt: string }
  | { type: MessageType.ExchangeVoteResolved; passed: boolean; yes: number; required: number; direction?: ExchangeDirection }
  | { type: MessageType.ExchangeSelectRequired; playerId: PlayerId; cardCount: number; direction: ExchangeDirection; deadlineAt: string }
  | { type: MessageType.ExchangeCompleted; direction: ExchangeDirection; receivedCards?: Card[] }
  | { type: MessageType.RoundEnd; winnerTeam: TeamKey }
  | { type: MessageType.GameEnd; winnerTeam: TeamKey }
  | { type: MessageType.StateResync; reason: string }
  | { type: MessageType.PlayerDc; playerId: PlayerId }
  | { type: MessageType.PlayerReconnect; playerId: PlayerId }
  | { type: MessageType.BotTakeover; playerId: PlayerId; difficulty: 'easy' | 'medium' | 'hard' }
  | { type: MessageType.ChatMessage; playerId: PlayerId; text: string }
  | { type: MessageType.Heartbeat; at: string }
  | { type: MessageType.Error; code: string; message: string };
