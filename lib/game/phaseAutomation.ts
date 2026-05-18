import {
  autoPickExchangeCards,
  pickExchangeDirection,
  type ExchangeDirection,
} from './exchange.js';
import { submitExchangeSelection, submitExchangeVote } from './exchangeFlow.js';
import type { GameState, PlayerId } from './state.js';
import {
  autoPickReturnCard,
  autoPickTributeCard,
} from './tribute.js';
import { submitReturnSelection, submitTributeSelection } from './tributeFlow.js';
import type { ServerEvent } from '../realtime/messages.js';
import type { RoomRules } from '../room/rules.js';

export type AutomaticPhaseActionType =
  | 'tribute'
  | 'tribute-timeout'
  | 'return'
  | 'return-timeout'
  | 'exchange-vote'
  | 'exchange-vote-timeout'
  | 'exchange-select'
  | 'exchange-select-timeout';

export interface AutomaticPhaseAction {
  phase: GameState['phase'];
  playerId: PlayerId;
  type: AutomaticPhaseActionType;
}

export interface AutomaticPhaseActionOptions {
  rules: RoomRules;
  returnDeadlineAt: () => string;
  exchangeDeadlineAt: () => string;
  exchangeDirection?: () => ExchangeDirection;
  nowMs?: () => number;
  maxActions?: number;
}

export interface AutomaticPhaseActionResult {
  state: GameState;
  events: ServerEvent[];
  actions: AutomaticPhaseAction[];
}

export function runAutomaticPhaseActions(
  initialState: GameState,
  {
    rules,
    returnDeadlineAt,
    exchangeDeadlineAt,
    exchangeDirection = () => pickExchangeDirection(),
    nowMs,
    maxActions = Math.max(16, initialState.players.length * 4),
  }: AutomaticPhaseActionOptions,
): AutomaticPhaseActionResult {
  let state = initialState;
  const events: ServerEvent[] = [];
  const actions: AutomaticPhaseAction[] = [];

  for (let index = 0; index < maxActions; index++) {
    if (state.phase === 'tribute-pending') {
      const tributeState = state;
      const expired = nowMs ? deadlineExpired(tributeState.deadlineAt, nowMs()) : false;
      const obligation = tributeState.obligations.find((candidate) => (
        !tributeState.selectedTributes[candidate.from] && shouldAutoTribute(tributeState, candidate.from, rules, expired)
      ));
      if (!obligation) break;
      const hand = tributeState.hands[obligation.from] ?? [];
      const result = submitTributeSelection(tributeState, {
        playerId: obligation.from,
        card: autoPickTributeCard(hand, tributeState.levelRank),
        rules,
        deadlineAt: returnDeadlineAt(),
      });
      if (!result.ok) break;
      actions.push({
        phase: state.phase,
        playerId: obligation.from,
        type: isBot(tributeState, obligation.from) || rules.tributeSelection === 'auto_pick' ? 'tribute' : 'tribute-timeout',
      });
      events.push(...result.events);
      state = result.state;
      continue;
    }

    if (state.phase === 'return-pending') {
      const returnState = state;
      const expired = nowMs ? deadlineExpired(returnState.deadlineAt, nowMs()) : false;
      const exchange = returnState.exchanges.find((candidate) => (
        !returnState.selectedReturns[candidate.to] && shouldAutoReturn(returnState, candidate.to, rules, expired)
      ));
      if (!exchange) break;
      const hand = returnState.hands[exchange.to] ?? [];
      const result = submitReturnSelection(returnState, {
        playerId: exchange.to,
        card: autoPickReturnCard(hand, { returnCardCap: rules.returnCardCap }),
        rules,
        deadlineAt: exchangeDeadlineAt(),
      });
      if (!result.ok) break;
      actions.push({
        phase: state.phase,
        playerId: exchange.to,
        type: isBot(returnState, exchange.to) || rules.returnSelection === 'auto_pick_lowest' ? 'return' : 'return-timeout',
      });
      events.push(...result.events);
      state = result.state;
      continue;
    }

    if (state.phase === 'exchange-vote-pending') {
      const voteState = state;
      const expired = nowMs ? deadlineExpired(voteState.deadlineAt, nowMs()) : false;
      const playerId = voteState.eligibleVoters.find((candidate) => (
        !voteState.votes[candidate] && (isBot(voteState, candidate) || expired)
      ));
      if (!playerId) break;
      const bot = isBot(voteState, playerId);
      const result = submitExchangeVote(voteState, {
        playerId,
        choice: bot ? 'yes' : 'no',
        rules,
        direction: exchangeDirection(),
        deadlineAt: exchangeDeadlineAt(),
      });
      if (!result.ok) break;
      actions.push({ phase: state.phase, playerId, type: bot ? 'exchange-vote' : 'exchange-vote-timeout' });
      events.push(...result.events);
      state = result.state;
      continue;
    }

    if (state.phase === 'exchange-select-pending') {
      const selectState = state;
      const expired = nowMs ? deadlineExpired(selectState.deadlineAt, nowMs()) : false;
      const player = selectState.players.find((candidate) => (
        (isBot(selectState, candidate.id) || expired)
          && (selectState.selections[candidate.id]?.length ?? 0) !== selectState.cardCount
      ));
      if (!player) break;
      const hand = selectState.hands[player.id] ?? [];
      const result = submitExchangeSelection(selectState, {
        playerId: player.id,
        cards: autoPickExchangeCards(hand, selectState.cardCount),
      });
      if (!result.ok) break;
      actions.push({
        phase: state.phase,
        playerId: player.id,
        type: isBot(selectState, player.id) ? 'exchange-select' : 'exchange-select-timeout',
      });
      events.push(...result.events);
      state = result.state;
      continue;
    }

    break;
  }

  return { state, events, actions };
}

function shouldAutoTribute(state: GameState, playerId: PlayerId, rules: RoomRules, expired: boolean): boolean {
  return rules.tributeSelection === 'auto_pick' || isBot(state, playerId) || expired;
}

function shouldAutoReturn(state: GameState, playerId: PlayerId, rules: RoomRules, expired: boolean): boolean {
  return rules.returnSelection === 'auto_pick_lowest' || isBot(state, playerId) || expired;
}

function isBot(state: GameState, playerId: PlayerId): boolean {
  return state.players.find((player) => player.id === playerId)?.kind === 'bot';
}

function deadlineExpired(deadlineAt: string, nowMs: number): boolean {
  const deadlineMs = Date.parse(deadlineAt);
  return Number.isFinite(deadlineMs) && nowMs >= deadlineMs;
}
