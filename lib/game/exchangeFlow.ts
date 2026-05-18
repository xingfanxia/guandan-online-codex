import type { Card } from './cards.js';
import {
  applyCardExchange,
  resolveExchangeVote,
  validateExchangeSelection,
  type ExchangeDirection,
  type ExchangeVoteChoice,
} from './exchange.js';
import type {
  ExchangeSelectPendingState,
  ExchangeVotePendingState,
  GameState,
  PendingTributeAfterExchangeVote,
  PlayerId,
  PlayingState,
  TributePendingState,
} from './state.js';
import { MessageType, type ServerEvent } from '../realtime/messages.js';
import type { RoomRules } from '../room/rules.js';

export type ExchangeFlowError =
  | 'ERR_NOT_EXCHANGE_VOTE_PENDING'
  | 'ERR_NOT_EXCHANGE_VOTER'
  | 'ERR_NOT_EXCHANGE_SELECT_PENDING'
  | 'ERR_NOT_EXCHANGE_PLAYER'
  | 'ERR_INVALID_EXCHANGE_SELECTION';

export type ExchangeFlowResult = { ok: true; state: GameState; events: ServerEvent[] } | { ok: false; error: ExchangeFlowError };

export function submitExchangeVote(
  state: ExchangeVotePendingState,
  {
    playerId,
    choice,
    rules,
    direction,
    deadlineAt,
  }: {
    playerId: PlayerId;
    choice: ExchangeVoteChoice;
    rules: RoomRules;
    direction: ExchangeDirection;
    deadlineAt: string;
  },
): ExchangeFlowResult {
  if (state.phase !== 'exchange-vote-pending') return { ok: false, error: 'ERR_NOT_EXCHANGE_VOTE_PENDING' };
  if (!state.eligibleVoters.includes(playerId)) return { ok: false, error: 'ERR_NOT_EXCHANGE_VOTER' };

  const votes = { ...state.votes, [playerId]: choice };
  const vote = resolveExchangeVote({
    eligibleVoters: state.eligibleVoters,
    votes,
    threshold: rules.exchangeVoteThreshold,
  });

  if (vote.passed) {
    if (state.pendingTribute) {
      return tributeStateAfterVote(state, state.pendingTribute, true, vote.yes, vote.required);
    }

    const selectState: ExchangeSelectPendingState = {
      phase: 'exchange-select-pending',
      mode: state.mode,
      levelRank: state.levelRank,
      players: state.players.map((player) => ({ ...player })),
      hands: cloneHands(state.hands),
      undealt: state.undealt.map(cloneCard),
      direction,
      cardCount: rules.exchangeCardCount,
      selections: {},
      firstLeader: state.firstLeader,
      deadlineAt,
      ...(state.progression ? { progression: state.progression } : {}),
      version: state.version + 1,
    };
    return {
      ok: true,
      state: selectState,
      events: [
        { type: MessageType.ExchangeVoteResolved, passed: true, yes: vote.yes, required: vote.required, direction },
        ...selectState.players.map((player) => ({
          type: MessageType.ExchangeSelectRequired,
          playerId: player.id,
          cardCount: selectState.cardCount,
          direction,
          deadlineAt,
        }) satisfies ServerEvent),
      ],
    };
  }

  if (vote.yes + vote.no === state.eligibleVoters.length) {
    if (state.pendingTribute) {
      return tributeStateAfterVote(state, state.pendingTribute, false, vote.yes, vote.required);
    }

    return {
      ok: true,
      state: playingState(state, cloneHands(state.hands)),
      events: [{ type: MessageType.ExchangeVoteResolved, passed: false, yes: vote.yes, required: vote.required }],
    };
  }

  return {
    ok: true,
    state: {
      ...cloneVoteState(state),
      votes,
      version: state.version + 1,
    },
    events: [{ type: MessageType.StateResync, reason: `exchange-vote:${playerId}` }],
  };
}

export function submitExchangeSelection(
  state: ExchangeSelectPendingState,
  {
    playerId,
    cards,
  }: {
    playerId: PlayerId;
    cards: readonly Card[];
  },
): ExchangeFlowResult {
  if (state.phase !== 'exchange-select-pending') return { ok: false, error: 'ERR_NOT_EXCHANGE_SELECT_PENDING' };
  const hand = state.hands[playerId];
  if (!hand || !state.players.some((player) => player.id === playerId)) {
    return { ok: false, error: 'ERR_NOT_EXCHANGE_PLAYER' };
  }
  if (!validateExchangeSelection(cards, hand, state.cardCount)) {
    return { ok: false, error: 'ERR_INVALID_EXCHANGE_SELECTION' };
  }

  const selections = {
    ...cloneCardSelections(state.selections),
    [playerId]: cards.map(cloneCard),
  };
  const playerOrder = state.players.map((player) => player.id);
  const complete = playerOrder.every((candidate) => selections[candidate]?.length === state.cardCount);
  if (!complete) {
    return {
      ok: true,
      state: {
        ...cloneSelectState(state),
        selections,
        version: state.version + 1,
      },
      events: [{ type: MessageType.StateResync, reason: `exchange-select:${playerId}` }],
    };
  }

  const result = applyCardExchange({
    playerOrder,
    hands: state.hands,
    selections: selections as Record<PlayerId, Card[]>,
    direction: state.direction,
    cardCount: state.cardCount,
  });
  return {
    ok: true,
    state: playingState(state, result.hands),
    events: [{ type: MessageType.ExchangeCompleted, direction: state.direction }],
  };
}

function playingState(
  state: ExchangeVotePendingState | ExchangeSelectPendingState,
  hands: Record<PlayerId, Card[]>,
): PlayingState {
  return {
    phase: 'playing',
    mode: state.mode,
    levelRank: state.levelRank,
    players: state.players.map((player) => ({ ...player })),
    hands: cloneHands(hands),
    undealt: state.undealt.map(cloneCard),
    finished: [],
    currentTurn: state.firstLeader,
    currentTrick: { leader: state.firstLeader, passes: [] },
    ...(state.progression ? { progression: state.progression } : {}),
    version: state.version + 1,
  };
}

function tributeStateAfterVote(
  state: ExchangeVotePendingState,
  pendingTribute: PendingTributeAfterExchangeVote,
  passed: boolean,
  yes: number,
  required: number,
): { ok: true; state: TributePendingState; events: ServerEvent[] } {
  const tributeState: TributePendingState = {
    phase: 'tribute-pending',
    mode: state.mode,
    levelRank: state.levelRank,
    players: state.players.map((player) => ({ ...player })),
    hands: cloneHands(state.hands),
    undealt: state.undealt.map(cloneCard),
    obligations: pendingTribute.obligations.map((obligation) => ({ ...obligation })),
    selectedTributes: {},
    firstLeader: pendingTribute.firstLeader,
    deadlineAt: pendingTribute.deadlineAt,
    exchangeVotePassed: passed,
    ...(state.progression ? { progression: state.progression } : {}),
    version: state.version + 1,
  };
  return {
    ok: true,
    state: tributeState,
    events: [
      { type: MessageType.ExchangeVoteResolved, passed, yes, required },
      ...tributeState.obligations.map((obligation) => ({
        type: MessageType.TributePending,
        playerId: obligation.from,
        toPlayerId: obligation.to,
      }) satisfies ServerEvent),
    ],
  };
}

function cloneVoteState(state: ExchangeVotePendingState): ExchangeVotePendingState {
  return {
    ...state,
    players: state.players.map((player) => ({ ...player })),
    hands: cloneHands(state.hands),
    undealt: state.undealt.map(cloneCard),
    eligibleVoters: [...state.eligibleVoters],
    votes: { ...state.votes },
    ...(state.pendingTribute
      ? {
          pendingTribute: {
            obligations: state.pendingTribute.obligations.map((obligation) => ({ ...obligation })),
            firstLeader: state.pendingTribute.firstLeader,
            deadlineAt: state.pendingTribute.deadlineAt,
          },
        }
      : {}),
  };
}

function cloneSelectState(state: ExchangeSelectPendingState): ExchangeSelectPendingState {
  return {
    ...state,
    players: state.players.map((player) => ({ ...player })),
    hands: cloneHands(state.hands),
    undealt: state.undealt.map(cloneCard),
    selections: cloneCardSelections(state.selections),
  };
}

function cloneHands(hands: Record<PlayerId, Card[]>): Record<PlayerId, Card[]> {
  return Object.fromEntries(Object.entries(hands).map(([playerId, hand]) => [playerId, hand.map(cloneCard)]));
}

function cloneCardSelections(selections: Partial<Record<PlayerId, Card[]>>): Partial<Record<PlayerId, Card[]>> {
  return Object.fromEntries(Object.entries(selections).map(([playerId, cards]) => [playerId, cards?.map(cloneCard)]));
}

function cloneCard(card: Card): Card {
  return { ...card };
}
