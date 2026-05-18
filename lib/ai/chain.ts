import { applyMove, type MoveCommand } from '../game/move.js';
import type { Card } from '../game/cards.js';
import type { GameState, PlayerId, PlayingState } from '../game/state.js';
import { MessageType, type ServerEvent } from '../realtime/messages.js';
import { easyBotMove } from './bots/easy.js';
import { mediumBotMove } from './bots/medium.js';
import { buildPlayerView, type LegalMove } from './engine.js';

export interface BotTurnOptions {
  maxMoves?: number;
  random?: () => number;
}

export interface BotTurnRecord {
  playerId: PlayerId;
  command: { type: 'pass' } | { type: 'play'; cards: Card[] };
}

export interface BotTurnResult {
  state: GameState;
  events: ServerEvent[];
  moves: BotTurnRecord[];
}

export function runBotTurns(initialState: GameState, { maxMoves = 3, random = Math.random }: BotTurnOptions = {}): BotTurnResult {
  let state = initialState;
  const events: ServerEvent[] = [];
  const moves: BotTurnRecord[] = [];

  for (let index = 0; index < maxMoves; index++) {
    if (state.phase !== 'playing') break;
    const currentTurn = state.currentTurn;
    const player = state.players.find((candidate) => candidate.id === currentTurn);
    if (!player || player.kind !== 'bot') break;

    const legalMove = selectBotMove(state, player.id, random);
    const command = toMoveCommand(player.id, legalMove);
    const result = applyMove(state, command);
    if (!result.ok) break;

    moves.push({
      playerId: player.id,
      command: command.type === 'play'
        ? { type: 'play', cards: command.cards.map((card) => ({ ...card })) }
        : { type: 'pass' },
    });
    events.push(eventForCommand(command));
    if (result.state.phase === 'round-end') {
      events.push({ type: MessageType.RoundEnd, winnerTeam: result.state.winnerTeam });
    }
    if (result.state.phase === 'game-end') {
      events.push({ type: MessageType.GameEnd, winnerTeam: result.state.winnerTeam });
    }
    state = result.state;
  }

  return { state, events, moves };
}

function selectBotMove(state: PlayingState, playerId: PlayerId, random: () => number): LegalMove {
  const player = state.players.find((candidate) => candidate.id === playerId);
  const view = buildPlayerView(state, playerId);
  if (player?.botDifficulty === 'medium') return mediumBotMove(view);
  return easyBotMove(view, { random });
}

function toMoveCommand(playerId: PlayerId, move: LegalMove): MoveCommand {
  if (move.type === 'pass') return { type: 'pass', playerId };
  return {
    type: 'play',
    playerId,
    cards: move.cards.map((card) => ({ ...card })),
  };
}

function eventForCommand(command: MoveCommand): ServerEvent {
  if (command.type === 'play') {
    return {
      type: MessageType.MovePlayed,
      playerId: command.playerId,
      cards: command.cards.map((card) => ({ ...card })),
    };
  }
  return { type: MessageType.StateResync, reason: `${command.playerId}:bot-pass` };
}
