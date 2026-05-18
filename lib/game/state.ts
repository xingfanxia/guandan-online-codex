import type { Card, LevelRank } from './cards.js';
import { dealCards, selectFirstHandLeader } from './deal.js';
import type { ExchangeDirection } from './exchange.js';
import { DEFAULT_MODE_RULES, type GameMode, type TeamKey, type TeamStructure } from './mode.js';
import type { TributeObligation } from './tribute.js';
import { calculateUpgrade } from './upgrade.js';
import { applyRoundProgression } from './gameEnd.js';

export type TeamLevels = Record<'t1' | 't2', LevelRank> & Partial<Record<TeamKey, LevelRank>>;
export type TeamFailCounts = Record<'t1' | 't2', number> & Partial<Record<TeamKey, number>>;

export interface LevelProgression {
  levels: TeamLevels;
  aFails: TeamFailCounts;
  roundOwner: TeamKey | null;
  strictA: boolean;
}

export type PlayerId = string;
export type Seat = 'east' | 'south' | 'west' | 'north' | `seat${number}`;
export type PlayerConnectionStatus = 'online' | 'disconnected' | 'bot-takeover';

export interface Player {
  id: PlayerId;
  seat: Seat;
  team: TeamKey;
  handle?: string;
  displayName?: string;
  kind?: 'human' | 'bot';
  botDifficulty?: 'easy' | 'medium';
  connectionStatus?: PlayerConnectionStatus;
}

export interface PlayedCards {
  playerId: PlayerId;
  cards: Card[];
  pattern: import('./patterns.js').Pattern;
}

export interface TrickState {
  leader: PlayerId;
  currentPlay?: PlayedCards;
  passes: PlayerId[];
}

export interface Placement {
  playerId: PlayerId;
  position: number;
  team: TeamKey;
}

export interface WaitingState {
  phase: 'waiting';
  mode: GameMode;
  levelRank: LevelRank;
  progression?: LevelProgression;
  players: Player[];
  version: number;
}

export interface PlayingState {
  phase: 'playing';
  mode: GameMode;
  levelRank: LevelRank;
  players: Player[];
  hands: Record<PlayerId, Card[]>;
  undealt: Card[];
  finished: Placement[];
  currentTurn: PlayerId;
  currentTrick: TrickState;
  progression?: LevelProgression;
  version: number;
}

export interface RoundEndState {
  phase: 'round-end';
  mode: GameMode;
  levelRank: LevelRank;
  players: Player[];
  hands: Record<PlayerId, Card[]>;
  undealt: Card[];
  placements: Placement[];
  winnerTeam: TeamKey;
  upgrade: number;
  nextLevelRank?: LevelRank;
  progression?: LevelProgression;
  version: number;
}

export interface GameEndState {
  phase: 'game-end';
  mode: GameMode;
  levelRank: LevelRank;
  players: Player[];
  hands: Record<PlayerId, Card[]>;
  undealt: Card[];
  placements: Placement[];
  winnerTeam: TeamKey;
  progression: LevelProgression;
  version: number;
}

export interface TributePendingState {
  phase: 'tribute-pending';
  mode: GameMode;
  levelRank: LevelRank;
  players: Player[];
  hands: Record<PlayerId, Card[]>;
  undealt: Card[];
  obligations: TributeObligation[];
  selectedTributes: Partial<Record<PlayerId, Card>>;
  firstLeader: PlayerId;
  deadlineAt: string;
  exchangeVotePassed?: boolean;
  progression?: LevelProgression;
  version: number;
}

export interface ReturnPendingState {
  phase: 'return-pending';
  mode: GameMode;
  levelRank: LevelRank;
  players: Player[];
  hands: Record<PlayerId, Card[]>;
  undealt: Card[];
  exchanges: Array<{ from: PlayerId; to: PlayerId; tributeCard: Card }>;
  selectedReturns: Partial<Record<PlayerId, Card>>;
  firstLeader: PlayerId;
  deadlineAt: string;
  exchangeVotePassed?: boolean;
  progression?: LevelProgression;
  version: number;
}

export interface PendingTributeAfterExchangeVote {
  obligations: TributeObligation[];
  firstLeader: PlayerId;
  deadlineAt: string;
}

export interface ExchangeVotePendingState {
  phase: 'exchange-vote-pending';
  mode: GameMode;
  levelRank: LevelRank;
  players: Player[];
  hands: Record<PlayerId, Card[]>;
  undealt: Card[];
  eligibleVoters: PlayerId[];
  votes: Partial<Record<PlayerId, 'yes' | 'no'>>;
  firstLeader: PlayerId;
  deadlineAt: string;
  pendingTribute?: PendingTributeAfterExchangeVote;
  progression?: LevelProgression;
  version: number;
}

export interface ExchangeSelectPendingState {
  phase: 'exchange-select-pending';
  mode: GameMode;
  levelRank: LevelRank;
  players: Player[];
  hands: Record<PlayerId, Card[]>;
  undealt: Card[];
  direction: ExchangeDirection;
  cardCount: number;
  selections: Partial<Record<PlayerId, Card[]>>;
  firstLeader: PlayerId;
  deadlineAt: string;
  progression?: LevelProgression;
  version: number;
}

export type GameState =
  | WaitingState
  | PlayingState
  | RoundEndState
  | GameEndState
  | TributePendingState
  | ReturnPendingState
  | ExchangeVotePendingState
  | ExchangeSelectPendingState;

export function createPlayers(mode: GameMode, teamStructure: TeamStructure = '2-teams-of-n'): Player[] {
  if (mode === '4') {
    return [
      { id: 'p1', seat: 'east', team: 't1' },
      { id: 'p2', seat: 'south', team: 't2' },
      { id: 'p3', seat: 'west', team: 't1' },
      { id: 'p4', seat: 'north', team: 't2' },
    ];
  }

  const count = mode === '6' ? 6 : 8;
  if (teamStructure === 'teams-of-2') {
    const teams: TeamKey[] = mode === '6' ? ['t1', 't2', 't3'] : ['t1', 't2', 't3', 't4'];
    return Array.from({ length: count }, (_, index) => ({
      id: `p${index + 1}`,
      seat: `seat${index + 1}`,
      team: teams[index % teams.length]!,
    }));
  }

  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    seat: `seat${index + 1}`,
    team: index % 2 === 0 ? 't1' : 't2',
  }));
}

export function createInitialState({ mode, levelRank }: { mode: GameMode; levelRank: LevelRank }): WaitingState {
  return {
    phase: 'waiting',
    mode,
    levelRank,
    progression: createDefaultProgression(levelRank),
    players: createPlayers(mode),
    version: 0,
  };
}

export function startRound(state: WaitingState, deck: readonly Card[], firstLeaderRandom: () => number = Math.random): PlayingState {
  const deal = dealCards(state.mode, state.players, deck);
  const leader = selectFirstHandLeader(state.mode, state.players, firstLeaderRandom);
  return {
    phase: 'playing',
    mode: state.mode,
    levelRank: state.levelRank,
    players: state.players.map((player) => ({ ...player })),
    hands: deal.hands,
    undealt: deal.undealt,
    finished: [],
    currentTurn: leader,
    currentTrick: { leader, passes: [] },
    progression: cloneProgression(state.progression ?? createDefaultProgression(state.levelRank)),
    version: state.version + 1,
  };
}

export function buildRoundEndState(state: PlayingState, finished: readonly Placement[]): RoundEndState | GameEndState {
  const placements = completePlacements(state, finished);
  const winnerTeam = placements[0]!.team;
  const winnerRanks = placements.filter((placement) => placement.team === winnerTeam).map((placement) => placement.position);
  const winnerTeamSize = teamRankCountForPlayers(state.players, winnerTeam);
  const { upgrade } = calculateUpgrade(state.mode, winnerRanks, DEFAULT_MODE_RULES, DEFAULT_MODE_RULES.must1, winnerTeamSize);
  const progression = state.progression ?? createDefaultProgression(state.levelRank);
  const roundProgression = applyRoundProgression({
    mode: state.mode,
    winnerTeam,
    winnerRanks,
    teamRankCount: winnerTeamSize,
    levels: cloneProgression(progression).levels,
    aFails: cloneProgression(progression).aFails,
    roundOwner: progression.roundOwner,
    roundLevel: state.levelRank,
    strictA: progression.strictA,
  });
  const nextProgression: LevelProgression = {
    levels: roundProgression.levels,
    aFails: roundProgression.aFails,
    roundOwner: roundProgression.roundOwner,
    strictA: progression.strictA,
  };

  if (roundProgression.finalWin) {
    return {
      phase: 'game-end',
      mode: state.mode,
      levelRank: state.levelRank,
      players: state.players.map((player) => ({ ...player })),
      hands: cloneHands(state.hands),
      undealt: state.undealt.map((card) => ({ ...card })),
      placements,
      winnerTeam,
      progression: nextProgression,
      version: state.version + 1,
    };
  }

  return {
    phase: 'round-end',
    mode: state.mode,
    levelRank: state.levelRank,
    players: state.players.map((player) => ({ ...player })),
    hands: cloneHands(state.hands),
    undealt: state.undealt.map((card) => ({ ...card })),
    placements,
    winnerTeam,
    upgrade,
    nextLevelRank: roundProgression.roundLevel,
    progression: nextProgression,
    version: state.version + 1,
  };
}

function completePlacements(state: PlayingState, finished: readonly Placement[]): Placement[] {
  const placements = finished.map((placement) => ({ ...placement }));
  const placed = new Set(placements.map((placement) => placement.playerId));
  const remaining = state.players.filter((player) => !placed.has(player.id));

  for (const player of remaining) {
    placements.push({
      playerId: player.id,
      position: placements.length + 1,
      team: player.team,
    });
  }

  return placements;
}

function cloneHands(hands: Record<PlayerId, Card[]>): Record<PlayerId, Card[]> {
  return Object.fromEntries(
    Object.entries(hands).map(([playerId, hand]) => [playerId, hand.map((card) => ({ ...card }))]),
  );
}

export function createDefaultProgression(levelRank: LevelRank): LevelProgression {
  return {
    levels: { t1: levelRank, t2: levelRank, t3: levelRank, t4: levelRank },
    aFails: { t1: 0, t2: 0, t3: 0, t4: 0 },
    roundOwner: null,
    strictA: DEFAULT_MODE_RULES.strictA,
  };
}

function teamRankCountForPlayers(players: readonly Player[], team: TeamKey): number {
  return players.filter((player) => player.team === team).length;
}

export function cloneProgression(progression: LevelProgression): LevelProgression {
  return {
    levels: { ...progression.levels },
    aFails: { ...progression.aFails },
    roundOwner: progression.roundOwner,
    strictA: progression.strictA,
  };
}
