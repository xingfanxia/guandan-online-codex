import { type Card } from '../game/cards';
import type { ExchangeVoteChoice } from '../game/exchange';
import { type GameState, type Placement, type PlayerId } from '../game/state';
import type { TributeObligation } from '../game/tribute';
import { type ServerEvent } from './messages';

export interface PublicTrickView {
  leader?: PlayerId;
  currentPlay?: {
    playerId: PlayerId;
    cards: Card[];
    kind: string;
  };
  passes: PlayerId[];
}

export interface ClientTributeView {
  obligations?: TributeObligation[];
  exchanges?: Array<{ from: PlayerId; to: PlayerId; tributeCard: Card }>;
  deadlineAt: string;
}

export interface ClientExchangeView {
  eligibleVoters?: PlayerId[];
  votes?: Partial<Record<PlayerId, ExchangeVoteChoice>>;
  direction?: 'clockwise' | 'counterclockwise';
  cardCount?: number;
  deadlineAt: string;
}

export interface ClientStateView {
  phase: GameState['phase'];
  mode: GameState['mode'];
  levelRank: GameState['levelRank'];
  version: number;
  players: GameState['players'];
  currentTurn?: PlayerId;
  handCounts?: Record<PlayerId, number>;
  self?: {
    playerId: PlayerId;
    hand: Card[];
  };
  currentTrick?: PublicTrickView;
  finished?: unknown[];
  placements?: Placement[];
  tribute?: ClientTributeView;
  exchange?: ClientExchangeView;
}

export interface ClientPayload {
  type: ServerEvent['type'];
  event: ServerEvent;
  view: ClientStateView;
}

export function buildClientPayload(playerId: PlayerId, event: ServerEvent, fullState: GameState): ClientPayload {
  return {
    type: event.type,
    event: publicEvent(event),
    view: buildClientStateView(playerId, fullState),
  };
}

function buildClientStateView(playerId: PlayerId, state: GameState): ClientStateView {
  const base = {
    phase: state.phase,
    mode: state.mode,
    levelRank: state.levelRank,
    version: state.version,
    players: state.players.map((player) => ({ ...player })),
  };

  if (state.phase === 'waiting') {
    return base;
  }

  const handCounts = Object.fromEntries(
    state.players.map((player) => [player.id, state.hands[player.id]?.length ?? 0]),
  );
  const ownHand = state.hands[playerId];
  const self = ownHand ? { playerId, hand: ownHand.map(cloneCard) } : undefined;

  if (state.phase === 'round-end') {
    return {
      ...base,
      handCounts,
      ...(self ? { self } : {}),
      placements: state.placements.map((placement) => ({ ...placement })),
    };
  }

  if (state.phase === 'tribute-pending') {
    return {
      ...base,
      handCounts,
      ...(self ? { self } : {}),
      tribute: {
        obligations: state.obligations.map((obligation) => ({ ...obligation })),
        deadlineAt: state.deadlineAt,
      },
    };
  }

  if (state.phase === 'return-pending') {
    return {
      ...base,
      handCounts,
      ...(self ? { self } : {}),
      tribute: {
        exchanges: state.exchanges.map((exchange) => ({
          from: exchange.from,
          to: exchange.to,
          tributeCard: cloneCard(exchange.tributeCard),
        })),
        deadlineAt: state.deadlineAt,
      },
    };
  }

  if (state.phase === 'exchange-vote-pending') {
    return {
      ...base,
      handCounts,
      ...(self ? { self } : {}),
      exchange: {
        eligibleVoters: [...state.eligibleVoters],
        votes: { ...state.votes },
        deadlineAt: state.deadlineAt,
      },
    };
  }

  if (state.phase === 'exchange-select-pending') {
    return {
      ...base,
      handCounts,
      ...(self ? { self } : {}),
      exchange: {
        direction: state.direction,
        cardCount: state.cardCount,
        deadlineAt: state.deadlineAt,
      },
    };
  }

  return {
    ...base,
    currentTurn: state.currentTurn,
    handCounts,
    ...(self ? { self } : {}),
    currentTrick: {
      leader: state.currentTrick.leader,
      passes: [...state.currentTrick.passes],
      ...(state.currentTrick.currentPlay
        ? {
            currentPlay: {
              playerId: state.currentTrick.currentPlay.playerId,
              cards: state.currentTrick.currentPlay.cards.map(cloneCard),
              kind: state.currentTrick.currentPlay.pattern.kind,
            },
          }
        : {}),
    },
    finished: state.finished.map((placement) => ({ ...placement })),
  };
}

function publicEvent(event: ServerEvent): ServerEvent {
  switch (event.type) {
    case 'room_joined':
      return { ...event };
    case 'move_played':
      return { ...event, cards: event.cards.map(cloneCard) };
    case 'tribute_pending':
      return { ...event };
    case 'tribute_completed':
      return { ...event };
    case 'tribute_resolved':
      return { ...event };
    case 'anti_tribute':
      return { ...event };
    case 'return_required':
      return { ...event };
    case 'exchange_vote_required':
      return { ...event };
    case 'exchange_vote_resolved':
      return { ...event };
    case 'exchange_select_required':
      return { ...event };
    case 'exchange_completed':
      return { type: event.type, direction: event.direction };
    case 'round_end':
      return { ...event };
    case 'game_end':
      return { ...event };
    case 'state_resync':
      return { ...event };
    case 'player_dc':
      return { ...event };
    case 'player_reconnect':
      return { ...event };
    case 'bot_takeover':
      return { ...event };
    case 'chat_message':
      return { ...event };
    case 'heartbeat':
      return { ...event };
    case 'error':
      return { ...event };
    default:
      return assertNever(event);
  }
}

function cloneCard(card: Card): Card {
  return { ...card };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled server event: ${JSON.stringify(value)}`);
}
