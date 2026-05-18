import type { Card, LevelRank } from '../game/cards.js';
import { dealCards } from '../game/deal.js';
import type { GameMode } from '../game/mode.js';
import { createPlayers, type GameState, type Player, type PlayingState } from '../game/state.js';
import type { ServerEvent } from '../realtime/messages.js';
import { runBotTurns, type BotTurnRecord } from './chain.js';

export interface StartBotRoundOptions {
  mode?: GameMode;
  levelRank?: LevelRank;
  deck: readonly Card[];
  botDifficulty?: NonNullable<Player['botDifficulty']>;
}

export interface BotRoundOptions {
  maxMoves?: number;
  random?: () => number;
}

export interface BotRoundResult {
  state: GameState;
  events: ServerEvent[];
  moves: BotTurnRecord[];
}

export function startBotRound({
  mode = '4',
  levelRank = '2',
  deck,
  botDifficulty = 'easy',
}: StartBotRoundOptions): PlayingState {
  const players = createPlayers(mode).map((player) => ({
    ...player,
    kind: 'bot' as const,
    botDifficulty,
  }));
  const deal = dealCards(mode, players, deck);
  const leader = players[0]!.id;

  return {
    phase: 'playing',
    mode,
    levelRank,
    players,
    hands: deal.hands,
    undealt: deal.undealt,
    finished: [],
    currentTurn: leader,
    currentTrick: { leader, passes: [] },
    version: 1,
  };
}

export function runBotRound(
  initialState: PlayingState,
  { maxMoves = 200, random = Math.random }: BotRoundOptions = {},
): BotRoundResult {
  let state: GameState = initialState;
  const events: ServerEvent[] = [];
  const moves: BotTurnRecord[] = [];

  while (moves.length < maxMoves) {
    if (state.phase === 'round-end') return { state, events, moves };
    if (state.phase !== 'playing') throw new Error('ERR_SELF_PLAY_NOT_PLAYING');

    const step = runBotTurns(state, { maxMoves: 1, random });
    if (step.moves.length === 0) throw new Error('ERR_BOT_ROUND_STUCK');

    state = step.state;
    events.push(...step.events);
    moves.push(...step.moves);
  }

  if (state.phase === 'round-end') return { state, events, moves };
  throw new Error('ERR_SELF_PLAY_MAX_MOVES');
}
