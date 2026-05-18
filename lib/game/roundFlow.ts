import type { Card } from './cards.js';
import { dealCards } from './deal.js';
import type { TeamStructure } from './tribute.js';
import { checkAntiTribute, computeTributePlan } from './tribute.js';
import type {
  ExchangeVotePendingState,
  GameState,
  PlayingState,
  RoundEndState,
  TributePendingState,
} from './state.js';
import type { ServerEvent } from '../realtime/messages.js';
import { MessageType } from '../realtime/messages.js';
import type { RoomRules } from '../room/rules.js';

export interface StartNextRoundFlowInput {
  roundEnd: RoundEndState;
  deck: readonly Card[];
  rules: RoomRules;
  deadlineAt: string;
  exchangeDeadlineAt?: string;
  teamStructure?: TeamStructure;
}

export interface StartNextRoundFlowResult {
  state: GameState;
  events: ServerEvent[];
}

export function startNextRoundFlow({
  roundEnd,
  deck,
  rules,
  deadlineAt,
  exchangeDeadlineAt = deadlineAt,
  teamStructure = rules.teamStructure,
}: StartNextRoundFlowInput): StartNextRoundFlowResult {
  const deal = dealCards(roundEnd.mode, roundEnd.players, deck);
  const base = {
    mode: roundEnd.mode,
    levelRank: roundEnd.nextLevelRank ?? roundEnd.levelRank,
    players: roundEnd.players.map((player) => ({ ...player })),
    hands: deal.hands,
    undealt: deal.undealt,
    ...(roundEnd.progression ? { progression: roundEnd.progression } : {}),
    version: roundEnd.version + 1,
  };
  const tributePlan = computeTributePlan({
    mode: roundEnd.mode,
    teamStructure,
    placements: roundEnd.placements,
    tributeEnabled: rules.tributeEnabled,
  });
  const events: ServerEvent[] = [];

  if (tributePlan.obligations.length > 0) {
    const antiTribute = checkAntiTribute(
      tributePlan.obligations.map((obligation) => deal.hands[obligation.from] ?? []),
      rules.antiTributeCondition,
    );
    if (antiTribute.triggered) {
      events.push({
        type: MessageType.AntiTribute,
        team: tributeTeam(roundEnd, tributePlan.obligations.map((obligation) => obligation.from)),
        declaredBy: antiTribute.declaredByIndexes.map((index) => tributePlan.obligations[index]!.from),
        firstLeader: tributePlan.firstPlacePlayerId,
      });
    } else {
      const state: TributePendingState = {
        phase: 'tribute-pending',
        ...base,
        obligations: tributePlan.obligations.map((obligation) => ({ ...obligation })),
        selectedTributes: {},
        firstLeader: tributePlan.firstPlacePlayerId,
        deadlineAt,
      };
      events.push(...tributePlan.obligations.map((obligation) => ({
        type: MessageType.TributePending,
        playerId: obligation.from,
        toPlayerId: obligation.to,
      } satisfies ServerEvent)));
      return { state, events };
    }
  }

  if (rules.cardExchange) {
    const state: ExchangeVotePendingState = {
      phase: 'exchange-vote-pending',
      ...base,
      eligibleVoters: roundEnd.placements
        .filter((placement) => placement.team !== roundEnd.winnerTeam)
        .sort((a, b) => a.position - b.position)
        .map((placement) => placement.playerId),
      votes: {},
      firstLeader: tributePlan.firstPlacePlayerId,
      deadlineAt: exchangeDeadlineAt,
    };
    events.push({
      type: MessageType.ExchangeVoteRequired,
      voterIds: [...state.eligibleVoters],
      deadlineAt: exchangeDeadlineAt,
    });
    return { state, events };
  }

  return {
    state: playingState({
      ...base,
      leader: tributePlan.firstPlacePlayerId,
    }),
    events,
  };
}

function playingState({
  mode,
  levelRank,
  players,
  hands,
  undealt,
  progression,
  version,
  leader,
}: Omit<PlayingState, 'phase' | 'finished' | 'currentTurn' | 'currentTrick'> & { leader: string }): PlayingState {
  return {
    phase: 'playing',
    mode,
    levelRank,
    players,
    hands,
    undealt,
    finished: [],
    currentTurn: leader,
    currentTrick: { leader, passes: [] },
    ...(progression ? { progression } : {}),
    version,
  };
}

function tributeTeam(roundEnd: RoundEndState, playerIds: readonly string[]): RoundEndState['winnerTeam'] {
  const playerId = playerIds[0];
  return roundEnd.players.find((player) => player.id === playerId)?.team
    ?? (roundEnd.winnerTeam === 't1' ? 't2' : 't1');
}
