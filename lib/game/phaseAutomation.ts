import {
  autoPickExchangeCards,
  pickExchangeDirection,
  type ExchangeDirection,
} from './exchange';
import { submitExchangeSelection, submitExchangeVote } from './exchangeFlow';
import type { GameState, PlayerId } from './state';
import {
  autoPickReturnCard,
  autoPickTributeCard,
} from './tribute';
import { submitReturnSelection, submitTributeSelection } from './tributeFlow';
import type { ServerEvent } from '../realtime/messages';
import type { RoomRules } from '../room/rules';

export type AutomaticPhaseActionType =
  | 'tribute'
  | 'return'
  | 'exchange-vote'
  | 'exchange-select';

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
    maxActions = Math.max(16, initialState.players.length * 4),
  }: AutomaticPhaseActionOptions,
): AutomaticPhaseActionResult {
  let state = initialState;
  const events: ServerEvent[] = [];
  const actions: AutomaticPhaseAction[] = [];

  for (let index = 0; index < maxActions; index++) {
    if (state.phase === 'tribute-pending') {
      const tributeState = state;
      const obligation = tributeState.obligations.find((candidate) => (
        !tributeState.selectedTributes[candidate.from] && shouldAutoTribute(tributeState, candidate.from, rules)
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
      actions.push({ phase: state.phase, playerId: obligation.from, type: 'tribute' });
      events.push(...result.events);
      state = result.state;
      continue;
    }

    if (state.phase === 'return-pending') {
      const returnState = state;
      const exchange = returnState.exchanges.find((candidate) => (
        !returnState.selectedReturns[candidate.to] && shouldAutoReturn(returnState, candidate.to, rules)
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
      actions.push({ phase: state.phase, playerId: exchange.to, type: 'return' });
      events.push(...result.events);
      state = result.state;
      continue;
    }

    if (state.phase === 'exchange-vote-pending') {
      const voteState = state;
      const playerId = voteState.eligibleVoters.find((candidate) => (
        !voteState.votes[candidate] && isBot(voteState, candidate)
      ));
      if (!playerId) break;
      const result = submitExchangeVote(voteState, {
        playerId,
        choice: 'yes',
        rules,
        direction: exchangeDirection(),
        deadlineAt: exchangeDeadlineAt(),
      });
      if (!result.ok) break;
      actions.push({ phase: state.phase, playerId, type: 'exchange-vote' });
      events.push(...result.events);
      state = result.state;
      continue;
    }

    if (state.phase === 'exchange-select-pending') {
      const selectState = state;
      const player = selectState.players.find((candidate) => (
        isBot(selectState, candidate.id) && (selectState.selections[candidate.id]?.length ?? 0) !== selectState.cardCount
      ));
      if (!player) break;
      const hand = selectState.hands[player.id] ?? [];
      const result = submitExchangeSelection(selectState, {
        playerId: player.id,
        cards: autoPickExchangeCards(hand, selectState.cardCount),
      });
      if (!result.ok) break;
      actions.push({ phase: state.phase, playerId: player.id, type: 'exchange-select' });
      events.push(...result.events);
      state = result.state;
      continue;
    }

    break;
  }

  return { state, events, actions };
}

function shouldAutoTribute(state: GameState, playerId: PlayerId, rules: RoomRules): boolean {
  return rules.tributeSelection === 'auto_pick' || isBot(state, playerId);
}

function shouldAutoReturn(state: GameState, playerId: PlayerId, rules: RoomRules): boolean {
  return rules.returnSelection === 'auto_pick_lowest' || isBot(state, playerId);
}

function isBot(state: GameState, playerId: PlayerId): boolean {
  return state.players.find((player) => player.id === playerId)?.kind === 'bot';
}
