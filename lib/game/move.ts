import { cardKey, type Card } from './cards.js';
import { expectedTeamRankCount, maxRankForMode } from './mode.js';
import { analyzeHand, canBeat } from './patterns.js';
import {
  buildRoundEndState,
  type GameState,
  type Placement,
  type PlayerId,
  type PlayingState,
} from './state.js';
import { activePlayerIds, nextLeaderAfterCompletedTrick, trickIsComplete } from './trick.js';
import { nextActivePlayer } from './turn.js';

export type MoveError =
  | 'ERR_NOT_PLAYING'
  | 'ERR_WRONG_TURN'
  | 'ERR_CARD_NOT_IN_HAND'
  | 'ERR_INVALID_COMBO'
  | 'ERR_DOESNT_BEAT_PREVIOUS'
  | 'ERR_CANNOT_PASS_ON_LEAD';

export type MoveCommand =
  | { type: 'play'; playerId: PlayerId; cards: Card[] }
  | { type: 'pass'; playerId: PlayerId };

export type MoveResult = { ok: true; state: GameState } | { ok: false; error: MoveError };

export function applyMove(state: GameState, move: MoveCommand): MoveResult {
  if (state.phase !== 'playing') return { ok: false, error: 'ERR_NOT_PLAYING' };
  if (move.playerId !== state.currentTurn) return { ok: false, error: 'ERR_WRONG_TURN' };

  if (move.type === 'pass') {
    return applyPass(state, move.playerId);
  }

  return applyPlay(state, move.playerId, move.cards);
}

function applyPlay(state: PlayingState, playerId: PlayerId, cards: readonly Card[]): MoveResult {
  if (!cardsAreInHand(state.hands[playerId] ?? [], cards)) {
    return { ok: false, error: 'ERR_CARD_NOT_IN_HAND' };
  }

  const pattern = analyzeHand(cards, state.levelRank);
  if (!pattern) return { ok: false, error: 'ERR_INVALID_COMBO' };

  const currentPlay = state.currentTrick.currentPlay;
  if (currentPlay && !canBeat(pattern, currentPlay.pattern, state.levelRank)) {
    return { ok: false, error: 'ERR_DOESNT_BEAT_PREVIOUS' };
  }

  const hands = cloneHands(state.hands);
  hands[playerId] = removeCards(hands[playerId] ?? [], cards);
  const finished = recordFinishIfNeeded(state, hands[playerId]!, playerId);
  const nextState: PlayingState = {
    ...state,
    hands,
    finished,
    currentTrick: {
      leader: state.currentTrick.leader,
      currentPlay: {
        playerId,
        cards: cards.map((card) => ({ ...card })),
        pattern,
      },
      passes: [],
    },
    version: state.version + 1,
  };

  if (roundShouldEnd(nextState)) {
    return { ok: true, state: buildRoundEndState(nextState, nextState.finished) };
  }

  nextState.currentTurn = nextActivePlayer(nextState.players, playerId, activePlayerIds(nextState));
  return { ok: true, state: nextState };
}

function applyPass(state: PlayingState, playerId: PlayerId): MoveResult {
  if (!state.currentTrick.currentPlay) {
    return { ok: false, error: 'ERR_CANNOT_PASS_ON_LEAD' };
  }

  const passes = state.currentTrick.passes.includes(playerId)
    ? state.currentTrick.passes
    : [...state.currentTrick.passes, playerId];
  const nextState: PlayingState = {
    ...state,
    currentTrick: {
      ...state.currentTrick,
      passes,
    },
    version: state.version + 1,
  };

  if (trickIsComplete(nextState)) {
    const leader = nextLeaderAfterCompletedTrick(nextState);
    nextState.currentTurn = leader;
    nextState.currentTrick = { leader, passes: [] };
    return { ok: true, state: nextState };
  }

  nextState.currentTurn = nextActivePlayer(nextState.players, playerId, activePlayerIds(nextState));
  return { ok: true, state: nextState };
}

function cardsAreInHand(hand: readonly Card[], cards: readonly Card[]): boolean {
  const counts = new Map<string, number>();
  for (const card of hand) counts.set(cardKey(card), (counts.get(cardKey(card)) ?? 0) + 1);
  for (const card of cards) {
    const key = cardKey(card);
    const count = counts.get(key) ?? 0;
    if (count <= 0) return false;
    counts.set(key, count - 1);
  }
  return true;
}

function removeCards(hand: readonly Card[], cards: readonly Card[]): Card[] {
  const toRemove = new Map<string, number>();
  for (const card of cards) toRemove.set(cardKey(card), (toRemove.get(cardKey(card)) ?? 0) + 1);

  const nextHand: Card[] = [];
  for (const card of hand) {
    const key = cardKey(card);
    const count = toRemove.get(key) ?? 0;
    if (count > 0) {
      toRemove.set(key, count - 1);
    } else {
      nextHand.push({ ...card });
    }
  }
  return nextHand;
}

function recordFinishIfNeeded(state: PlayingState, remainingHand: readonly Card[], playerId: PlayerId): Placement[] {
  if (remainingHand.length > 0 || state.finished.some((placement) => placement.playerId === playerId)) {
    return state.finished.map((placement) => ({ ...placement }));
  }

  const player = state.players.find((candidate) => candidate.id === playerId)!;
  return [
    ...state.finished.map((placement) => ({ ...placement })),
    {
      playerId,
      position: state.finished.length + 1,
      team: player.team,
    },
  ];
}

function roundShouldEnd(state: PlayingState): boolean {
  const first = state.finished[0];
  if (!first) return false;

  const firstPlaceTeamFinished = state.finished.filter((placement) => placement.team === first.team).length;
  if (firstPlaceTeamFinished >= expectedTeamRankCount(state.mode)) return true;

  return state.finished.length >= maxRankForMode(state.mode) - 1;
}

function cloneHands(hands: Record<PlayerId, Card[]>): Record<PlayerId, Card[]> {
  return Object.fromEntries(
    Object.entries(hands).map(([playerId, hand]) => [playerId, hand.map((card) => ({ ...card }))]),
  );
}
