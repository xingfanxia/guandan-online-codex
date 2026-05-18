import { compareCardRanks, type Card } from './cards.js';
import { pickExchangeDirection, type ExchangeDirection } from './exchange.js';
import type {
  ExchangeSelectPendingState,
  ExchangeVotePendingState,
  GameState,
  PlayerId,
  PlayingState,
  ReturnPendingState,
  TributePendingState,
} from './state.js';
import {
  applyTributeExchange,
  validatePlayerReturnCard,
  validatePlayerTributeCard,
} from './tribute.js';
import { nextPlayerId } from './turn.js';
import { MessageType, type ServerEvent } from '../realtime/messages.js';
import type { RoomRules } from '../room/rules.js';

export type TributeFlowError =
  | 'ERR_NOT_TRIBUTE_PENDING'
  | 'ERR_NOT_TRIBUTE_PLAYER'
  | 'ERR_INVALID_TRIBUTE_CARD'
  | 'ERR_NOT_RETURN_PENDING'
  | 'ERR_NOT_RETURN_PLAYER'
  | 'ERR_INVALID_RETURN_CARD';

export type TributeFlowResult = { ok: true; state: GameState; events: ServerEvent[] } | { ok: false; error: TributeFlowError };

export function submitTributeSelection(
  state: TributePendingState,
  {
    playerId,
    card,
    rules,
    deadlineAt,
  }: {
    playerId: PlayerId;
    card: Card;
    rules: RoomRules;
    deadlineAt: string;
  },
): TributeFlowResult {
  if (state.phase !== 'tribute-pending') return { ok: false, error: 'ERR_NOT_TRIBUTE_PENDING' };
  const obligation = state.obligations.find((candidate) => candidate.from === playerId);
  if (!obligation) return { ok: false, error: 'ERR_NOT_TRIBUTE_PLAYER' };
  if (!validatePlayerTributeCard(card, state.hands[playerId] ?? [], state.levelRank)) {
    return { ok: false, error: 'ERR_INVALID_TRIBUTE_CARD' };
  }

  const selectedTributes = {
    ...cloneSelections(state.selectedTributes),
    [playerId]: cloneCard(card),
  };
  const complete = state.obligations.every((candidate) => selectedTributes[candidate.from]);
  if (!complete) {
    return {
      ok: true,
      state: {
        ...cloneTributeState(state),
        selectedTributes,
        version: state.version + 1,
      },
      events: [{ type: MessageType.StateResync, reason: `tribute:${playerId}` }],
    };
  }

  const exchanges = state.obligations.map((candidate) => ({
    from: candidate.from,
    to: candidate.to,
    tributeCard: cloneCard(selectedTributes[candidate.from]!),
  }));
  const firstLeader = resolveFirstLeaderAfterTribute(state, selectedTributes);
  return {
    ok: true,
    state: {
      phase: 'return-pending',
      mode: state.mode,
      levelRank: state.levelRank,
      players: state.players.map((player) => ({ ...player })),
      hands: cloneHands(state.hands),
      undealt: state.undealt.map(cloneCard),
      exchanges,
      selectedReturns: {},
      firstLeader,
      deadlineAt,
      ...(state.exchangeVotePassed !== undefined ? { exchangeVotePassed: state.exchangeVotePassed } : {}),
      ...(state.progression ? { progression: state.progression } : {}),
      version: state.version + 1,
    } satisfies ReturnPendingState,
    events: [
      {
        type: MessageType.TributeCompleted,
        exchanges: exchanges.map((exchange) => ({
          fromPlayerId: exchange.from,
          toPlayerId: exchange.to,
          card: cloneCard(exchange.tributeCard),
        })),
      },
      ...exchanges.map((exchange) => ({
        type: MessageType.ReturnRequired,
        playerId: exchange.to,
        toPlayerId: exchange.from,
        tributeCardReceived: cloneCard(exchange.tributeCard),
      }) satisfies ServerEvent),
    ],
  };
}

export function submitReturnSelection(
  state: ReturnPendingState,
  {
    playerId,
    card,
    rules,
    deadlineAt,
    exchangeDirection,
  }: {
    playerId: PlayerId;
    card: Card;
    rules: RoomRules;
    deadlineAt: string;
    exchangeDirection?: ExchangeDirection;
  },
): TributeFlowResult {
  if (state.phase !== 'return-pending') return { ok: false, error: 'ERR_NOT_RETURN_PENDING' };
  const exchange = state.exchanges.find((candidate) => candidate.to === playerId);
  if (!exchange) return { ok: false, error: 'ERR_NOT_RETURN_PLAYER' };
  if (!validatePlayerReturnCard(card, state.hands[playerId] ?? [], { returnCardCap: rules.returnCardCap })) {
    return { ok: false, error: 'ERR_INVALID_RETURN_CARD' };
  }

  const selectedReturns = {
    ...cloneSelections(state.selectedReturns),
    [playerId]: cloneCard(card),
  };
  const complete = state.exchanges.every((candidate) => selectedReturns[candidate.to]);
  if (!complete) {
    return {
      ok: true,
      state: {
        ...cloneReturnState(state),
        selectedReturns,
        version: state.version + 1,
      },
      events: [{ type: MessageType.StateResync, reason: `return:${playerId}` }],
    };
  }

  const resolved = state.exchanges.map((candidate) => ({
    fromPlayerId: candidate.from,
    toPlayerId: candidate.to,
    tributeCard: cloneCard(candidate.tributeCard),
    returnCard: cloneCard(selectedReturns[candidate.to]!),
  }));
  let hands = cloneHands(state.hands);
  for (const exchangeResult of resolved) {
    hands = applyTributeExchange(hands, {
      from: exchangeResult.fromPlayerId,
      to: exchangeResult.toPlayerId,
      tributeCard: exchangeResult.tributeCard,
      returnCard: exchangeResult.returnCard,
    });
  }

  const tributeResolved: ServerEvent = {
    type: MessageType.TributeResolved,
    exchanges: resolved,
    firstLeader: state.firstLeader,
  };
  if (state.exchangeVotePassed) {
    const selectState = exchangeSelectState(state, hands, deadlineAt, exchangeDirection ?? pickExchangeDirection(), rules);
    return {
      ok: true,
      state: selectState,
      events: [
        tributeResolved,
        ...selectState.players.map((player) => ({
          type: MessageType.ExchangeSelectRequired,
          playerId: player.id,
          cardCount: selectState.cardCount,
          direction: selectState.direction,
          deadlineAt,
        }) satisfies ServerEvent),
      ],
    };
  }
  if (state.exchangeVotePassed === false) {
    return {
      ok: true,
      state: playingState(state, hands),
      events: [tributeResolved],
    };
  }

  if (rules.cardExchange) {
    const voteState = exchangeVoteState(state, hands, deadlineAt);
    return {
      ok: true,
      state: voteState,
      events: [
        tributeResolved,
        {
          type: MessageType.ExchangeVoteRequired,
          voterIds: [...voteState.eligibleVoters],
          deadlineAt,
        },
      ],
    };
  }

  return {
    ok: true,
    state: playingState(state, hands),
    events: [tributeResolved],
  };
}

function playingState(state: ReturnPendingState, hands: Record<PlayerId, Card[]>): PlayingState {
  return {
    phase: 'playing',
    mode: state.mode,
    levelRank: state.levelRank,
    players: state.players.map((player) => ({ ...player })),
    hands,
    undealt: state.undealt.map(cloneCard),
    finished: [],
    currentTurn: state.firstLeader,
    currentTrick: { leader: state.firstLeader, passes: [] },
    ...(state.progression ? { progression: state.progression } : {}),
    version: state.version + 1,
  };
}

function exchangeVoteState(
  state: ReturnPendingState,
  hands: Record<PlayerId, Card[]>,
  deadlineAt: string,
): ExchangeVotePendingState {
  const winnerTeam = state.players.find((player) => player.id === state.exchanges[0]?.to)?.team;
  return {
    phase: 'exchange-vote-pending',
    mode: state.mode,
    levelRank: state.levelRank,
    players: state.players.map((player) => ({ ...player })),
    hands,
    undealt: state.undealt.map(cloneCard),
    eligibleVoters: state.players
      .filter((player) => player.team !== winnerTeam)
      .map((player) => player.id),
    votes: {},
    firstLeader: state.firstLeader,
    deadlineAt,
    ...(state.progression ? { progression: state.progression } : {}),
    version: state.version + 1,
  };
}

function exchangeSelectState(
  state: ReturnPendingState,
  hands: Record<PlayerId, Card[]>,
  deadlineAt: string,
  direction: ExchangeDirection,
  rules: RoomRules,
): ExchangeSelectPendingState {
  return {
    phase: 'exchange-select-pending',
    mode: state.mode,
    levelRank: state.levelRank,
    players: state.players.map((player) => ({ ...player })),
    hands,
    undealt: state.undealt.map(cloneCard),
    direction,
    cardCount: rules.exchangeCardCount,
    selections: {},
    firstLeader: state.firstLeader,
    deadlineAt,
    ...(state.progression ? { progression: state.progression } : {}),
    version: state.version + 1,
  };
}

function resolveFirstLeaderAfterTribute(
  state: TributePendingState,
  selectedTributes: Partial<Record<PlayerId, Card>>,
): PlayerId {
  if (state.obligations.length === 0) return state.firstLeader;
  if (state.obligations.length === 1) return state.obligations[0]!.from;

  let leadingTributer = state.obligations[0]!.from;
  let leadingCard = selectedTributes[leadingTributer]!;
  let topRankTied = false;

  for (const obligation of state.obligations.slice(1)) {
    const candidate = selectedTributes[obligation.from]!;
    const comparison = compareCardRanks(candidate.rank, leadingCard.rank, state.levelRank);
    if (comparison > 0) {
      leadingTributer = obligation.from;
      leadingCard = candidate;
      topRankTied = false;
    } else if (comparison === 0) {
      topRankTied = true;
    }
  }

  return topRankTied ? nextPlayerId(state.players, state.firstLeader) : leadingTributer;
}

function cloneTributeState(state: TributePendingState): TributePendingState {
  return {
    ...state,
    players: state.players.map((player) => ({ ...player })),
    hands: cloneHands(state.hands),
    undealt: state.undealt.map(cloneCard),
    obligations: state.obligations.map((obligation) => ({ ...obligation })),
    selectedTributes: cloneSelections(state.selectedTributes),
  };
}

function cloneReturnState(state: ReturnPendingState): ReturnPendingState {
  return {
    ...state,
    players: state.players.map((player) => ({ ...player })),
    hands: cloneHands(state.hands),
    undealt: state.undealt.map(cloneCard),
    exchanges: state.exchanges.map((exchange) => ({
      ...exchange,
      tributeCard: cloneCard(exchange.tributeCard),
    })),
    selectedReturns: cloneSelections(state.selectedReturns),
  };
}

function cloneHands(hands: Record<PlayerId, Card[]>): Record<PlayerId, Card[]> {
  return Object.fromEntries(Object.entries(hands).map(([playerId, hand]) => [playerId, hand.map(cloneCard)]));
}

function cloneSelections(selections: Partial<Record<PlayerId, Card>>): Partial<Record<PlayerId, Card>> {
  return Object.fromEntries(Object.entries(selections).map(([playerId, card]) => [playerId, card ? cloneCard(card) : card]));
}

function cloneCard(card: Card): Card {
  return { ...card };
}
