import { useEffect, useRef, useState } from 'react';
import { cardKey, type Card } from '../lib/game/cards';
import { sortHand } from '../lib/ai/assist';
import { OrientationLock } from './components/OrientationLock';
import {
  suggestMove as requestSuggestedMove,
  type SuggestMoveInput,
  type SuggestMoveResult,
} from './lib/api/assist';
import {
  createRoom,
  getRoomStatus,
  joinRoom,
  kickPlayer,
  listRooms,
  reclaimPlayer,
  startRoom,
  type CreateRoomInput,
  type CreateRoomResult,
  type JoinRoomInput,
  type JoinRoomResult,
  type KickPlayerInput,
  type KickPlayerResult,
  type ListRoomsResult,
  type PublicRoomDto,
  type ReclaimPlayerInput,
  type ReclaimPlayerResult,
  type RoomStatusInput,
  type RoomStatusResult,
  type StartRoomInput,
  type StartRoomResult,
} from './lib/api/rooms';
import {
  createHandle,
  type CreateHandleInput,
  type CreateHandleResult,
} from './lib/api/profile';
import {
  banHandle,
  listLatency,
  listReports,
  resetStats,
  type BanHandleResult,
  type LatencyAggregateDto,
  type ListLatencyResult,
  type ListReportsResult,
  type ReportRecordDto,
  type ResetStatsResult,
} from './lib/api/moderation';
import {
  submitMove,
  type SubmitMoveInput,
  type SubmitMoveResult,
} from './lib/api/moves';
import {
  advanceRound,
  type AdvanceRoundInput,
  type AdvanceRoundResult,
} from './lib/api/rounds';
import {
  submitExchangeSelection,
  submitExchangeVote,
  submitTributeSelection,
  type ExchangeSelectionResult,
  type ExchangeVoteResult,
  type TributeSelectionResult,
} from './lib/api/phaseActions';
import type { GameEventSourceCtor } from './lib/realtime/gameStream';
import { useGameStream } from './lib/realtime/useGameStream';
import type { ClientStateView } from '../lib/realtime/payload';
import { AdminDashboard } from './screens/AdminDashboard';
import { CreateRoomScreen, type CreateRoomScreenProps } from './screens/CreateRoom';
import { GameTableScreen } from './screens/GameTable';
import { HandleSetupScreen } from './screens/HandleSetup';
import { RoomBrowserScreen } from './screens/RoomBrowser';
import { WaitingRoomScreen, type WaitingRoomScreenProps } from './screens/WaitingRoom';

const HAND: Card[] = [
  { rank: '3', suit: 'spades', deck: 1 },
  { rank: '3', suit: 'hearts', deck: 1 },
  { rank: '5', suit: 'hearts', deck: 1 },
  { rank: '7', suit: 'clubs', deck: 1 },
  { rank: '9', suit: 'diamonds', deck: 1 },
  { rank: 'J', suit: 'spades', deck: 1 },
  { rank: 'Q', suit: 'hearts', deck: 1 },
  { rank: 'A', suit: 'spades', deck: 1 },
  { rank: 'BJ', suit: 'joker', deck: 1 },
  { rank: 'RJ', suit: 'joker', deck: 1 },
];

const TRICK: Card[] = [
  { rank: 'A', suit: 'diamonds', deck: 2 },
];

export interface AppRoomApi {
  createRoom(input: CreateRoomInput): Promise<CreateRoomResult>;
  getRoomStatus(input: RoomStatusInput): Promise<RoomStatusResult>;
  joinRoom(input: JoinRoomInput): Promise<JoinRoomResult>;
  kickPlayer(input: KickPlayerInput): Promise<KickPlayerResult>;
  reclaimPlayer(input: ReclaimPlayerInput): Promise<ReclaimPlayerResult>;
  startRoom(input: StartRoomInput): Promise<StartRoomResult>;
  listRooms(): Promise<ListRoomsResult>;
}

export interface AppProfileApi {
  createHandle(input: CreateHandleInput): Promise<CreateHandleResult>;
}

export interface AppModerationApi {
  listReports(input: { adminToken: string }): Promise<ListReportsResult>;
  listLatency(input: { adminToken: string }): Promise<ListLatencyResult>;
  banHandle(input: { adminToken: string; handle: string; banned: boolean; reason?: string }): Promise<BanHandleResult>;
  resetStats(input: { adminToken: string; handle: string }): Promise<ResetStatsResult>;
}

export interface AppMoveApi {
  submitMove(input: SubmitMoveInput): Promise<SubmitMoveResult>;
}

export interface AppAssistApi {
  suggestMove(input: SuggestMoveInput): Promise<SuggestMoveResult>;
}

export interface AppPhaseApi {
  submitTributeSelection(input: Parameters<typeof submitTributeSelection>[0]): Promise<TributeSelectionResult>;
  submitExchangeVote(input: Parameters<typeof submitExchangeVote>[0]): Promise<ExchangeVoteResult>;
  submitExchangeSelection(input: Parameters<typeof submitExchangeSelection>[0]): Promise<ExchangeSelectionResult>;
}

export interface AppRoundApi {
  advanceRound(input: AdvanceRoundInput): Promise<AdvanceRoundResult>;
}

export interface AppStreamOptions {
  enabled?: boolean;
  baseUrl?: string;
  token?: string;
  EventSourceCtor?: GameEventSourceCtor;
}

export interface AppProps {
  playerHandle?: string;
  currentPlayerId?: string;
  gameView?: ClientStateView;
  roomApi?: AppRoomApi;
  profileApi?: AppProfileApi;
  moderationApi?: AppModerationApi;
  moveApi?: AppMoveApi;
  assistApi?: AppAssistApi;
  phaseApi?: AppPhaseApi;
  roundApi?: AppRoundApi;
  adminToken?: string;
  stream?: AppStreamOptions;
  waitingRoomPollMs?: number;
  createMoveId?: () => string;
  createTransitionId?: () => string;
}

type AppView = 'table' | 'create' | 'browser' | 'waiting' | 'admin';

const ACTIVE_ROOM_SESSION_KEY = 'gdo:active-room-session:v1';
const PLAYER_PROFILE_KEY = 'gdo:player-profile:v1';
const restorableViews = new Set<AppView>(['table', 'waiting']);

interface StoredPlayerProfile {
  handle: string;
  createdAt?: string;
}

interface StoredRoomSession {
  room: PublicRoomDto;
  hostToken?: string;
  playerToken?: string;
  activePlayerId: string;
  view: AppView;
}

interface StoredRoomSessionDraft {
  room?: PublicRoomDto | undefined;
  hostToken?: string | undefined;
  playerToken?: string | undefined;
  activePlayerId: string;
  view: AppView;
}

const defaultRoomApi: AppRoomApi = {
  createRoom,
  getRoomStatus,
  joinRoom,
  kickPlayer,
  reclaimPlayer,
  startRoom,
  listRooms,
};

const defaultProfileApi: AppProfileApi = {
  createHandle,
};

const defaultModerationApi: AppModerationApi = {
  listReports,
  listLatency,
  banHandle,
  resetStats,
};

const defaultMoveApi: AppMoveApi = {
  submitMove,
};

const defaultAssistApi: AppAssistApi = {
  suggestMove: requestSuggestedMove,
};

const defaultPhaseApi: AppPhaseApi = {
  submitTributeSelection,
  submitExchangeVote,
  submitExchangeSelection,
};

const defaultRoundApi: AppRoundApi = {
  advanceRound,
};

export function App({
  playerHandle,
  currentPlayerId = 'p1',
  gameView,
  roomApi = defaultRoomApi,
  profileApi = defaultProfileApi,
  moderationApi = defaultModerationApi,
  moveApi = defaultMoveApi,
  assistApi = defaultAssistApi,
  phaseApi = defaultPhaseApi,
  roundApi = defaultRoundApi,
  adminToken,
  stream,
  waitingRoomPollMs = 2_000,
  createMoveId = defaultMoveId,
  createTransitionId = defaultTransitionId,
}: AppProps): React.ReactElement {
  const [storedSession] = useState<StoredRoomSession | undefined>(() => readStoredRoomSession());
  const explicitPlayerHandle = playerHandle ? normalizeClientHandle(playerHandle) : undefined;
  const [storedProfile, setStoredProfile] = useState<StoredPlayerProfile | undefined>(() => (
    explicitPlayerHandle ? { handle: explicitPlayerHandle } : readStoredPlayerProfile()
  ));
  const activeHandle = explicitPlayerHandle ?? storedProfile?.handle;
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [view, setView] = useState<AppView>(() => storedSession?.view ?? 'table');
  const [activePlayerId, setActivePlayerId] = useState(() => storedSession?.activePlayerId ?? currentPlayerId);
  const [handOrder, setHandOrder] = useState<Card[] | undefined>();
  const [currentRoom, setCurrentRoom] = useState<PublicRoomDto | undefined>(() => storedSession?.room);
  const [serverGameView, setServerGameView] = useState<ClientStateView | undefined>();
  const [rooms, setRooms] = useState<PublicRoomDto[]>([]);
  const [reports, setReports] = useState<ReportRecordDto[]>([]);
  const [latencyAggregates, setLatencyAggregates] = useState<LatencyAggregateDto[]>([]);
  const [hostToken, setHostToken] = useState<string | undefined>(() => storedSession?.hostToken);
  const [playerToken, setPlayerToken] = useState<string | undefined>(() => storedSession?.playerToken);
  const reclaimAttemptKey = useRef<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const roomCode = currentRoom?.code ?? 'K7M2P9';
  const liveStream = useGameStream({
    baseUrl: stream?.baseUrl,
    roomId: currentRoom?.code,
    playerId: activePlayerId,
    token: stream?.token ?? playerToken,
    EventSourceCtor: stream?.EventSourceCtor,
    enabled: shouldConnectStream({
      configured: stream?.enabled,
      hasInjectedView: Boolean(gameView),
      room: currentRoom,
      appView: view,
      EventSourceCtor: stream?.EventSourceCtor,
    }),
  });
  const tableView = newestView(serverGameView, liveStream.view, gameView)
    ?? (currentRoom || !activeHandle ? undefined : demoGameView(activeHandle));
  const orderedTableView = tableView ? applyHandOrder(tableView, activePlayerId, handOrder) : undefined;
  const selectedCards = orderedTableView ? cardsFromSelection(orderedTableView, activePlayerId, selected) : [];

  useEffect(() => {
    if (!currentRoom) {
      setActivePlayerId(currentPlayerId);
    }
  }, [currentPlayerId, currentRoom]);

  useEffect(() => {
    writeStoredRoomSession({
      room: currentRoom,
      hostToken,
      playerToken,
      activePlayerId,
      view,
    });
  }, [currentRoom, hostToken, playerToken, activePlayerId, view]);

  useEffect(() => {
    setHandOrder(undefined);
  }, [activePlayerId, tableView?.version]);

  useEffect(() => {
    if (view !== 'waiting' || !currentRoom) return;
    let cancelled = false;
    const refresh = async () => {
      const result = await roomApi.getRoomStatus({
        code: currentRoom.code,
        ...(playerToken ? { playerId: activePlayerId, token: playerToken } : {}),
      });
      if (cancelled || !result.ok) return;
      setCurrentRoom(result.room);
      if (result.room.status === 'playing') {
        setNotice('游戏已开始');
        setView('table');
      }
    };
    const interval = globalThis.setInterval(() => { void refresh(); }, waitingRoomPollMs);
    return () => {
      cancelled = true;
      globalThis.clearInterval(interval);
    };
  }, [activePlayerId, currentRoom?.code, playerToken, roomApi, view, waitingRoomPollMs]);

  useEffect(() => {
    if (view !== 'table' || !currentRoom || !playerToken) return;
    const key = `${currentRoom.code}:${activePlayerId}:${playerToken}`;
    if (reclaimAttemptKey.current === key) return;
    reclaimAttemptKey.current = key;
    let cancelled = false;
    void (async () => {
      const result = await roomApi.reclaimPlayer({
        code: currentRoom.code,
        playerId: activePlayerId,
        token: playerToken,
      });
      if (cancelled || !result.ok) return;
      if (result.view) setServerGameView(viewWithResponseVersion(result.view, result.version));
      setCurrentRoom(result.room);
      if (result.reclaimed) setNotice('已恢复座位');
    })();
    return () => {
      cancelled = true;
    };
  }, [activePlayerId, currentRoom, playerToken, roomApi, view]);

  async function handleCreate(input: Parameters<CreateRoomScreenProps['onCreate']>[0]): Promise<void> {
    setBusy(true);
    setNotice(undefined);
    setError(undefined);
    try {
      if (!activeHandle) {
        setError('ERR_HANDLE_REQUIRED');
        return;
      }
      const result = await roomApi.createRoom({ ...input, hostHandle: activeHandle });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCurrentRoom(result.room);
      setServerGameView(undefined);
      setHostToken(result.hostToken);
      setPlayerToken(result.playerToken);
      setActivePlayerId(playerIdForHandle(result.room.players, activeHandle) ?? currentPlayerId);
      setNotice(`已创建房间 ${result.room.code}`);
      setView('waiting');
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenBrowser(): Promise<void> {
    setView('browser');
    setBusy(true);
    setNotice(undefined);
    setError(undefined);
    try {
      const result = await roomApi.listRooms();
      if (!result.ok) {
        setError(result.error);
        setRooms([]);
        return;
      }
      setRooms(result.rooms);
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin(code: string): Promise<void> {
    setBusy(true);
    setNotice(undefined);
    setError(undefined);
    try {
      if (!activeHandle) {
        setError('ERR_HANDLE_REQUIRED');
        return;
      }
      const result = await roomApi.joinRoom({ code, handle: activeHandle });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCurrentRoom(result.room);
      setServerGameView(undefined);
      setPlayerToken(result.playerToken);
      setActivePlayerId(result.player.id);
      setNotice(`已加入房间 ${result.room.code}`);
      setView('waiting');
    } finally {
      setBusy(false);
    }
  }

  async function handleKick(playerId: string): Promise<void> {
    if (!currentRoom || !hostToken) {
      setError('ERR_HOST_TOKEN_REQUIRED');
      return;
    }
    setBusy(true);
    setNotice(undefined);
    setError(undefined);
    try {
      const result = await roomApi.kickPlayer({
        code: currentRoom.code,
        hostToken,
        playerId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCurrentRoom(result.room);
      setNotice('已踢出玩家');
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenAdmin(): Promise<void> {
    setView('admin');
    setReports([]);
    setLatencyAggregates([]);
    setNotice(undefined);
    if (!adminToken) {
      setError('ERR_ADMIN_TOKEN_REQUIRED');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const [reportsResult, latencyResult] = await Promise.all([
        moderationApi.listReports({ adminToken }),
        moderationApi.listLatency({ adminToken }),
      ]);
      if (!reportsResult.ok) {
        setError(reportsResult.error);
        return;
      }
      if (!latencyResult.ok) {
        setError(latencyResult.error);
        return;
      }
      setReports(reportsResult.reports);
      setLatencyAggregates(latencyResult.aggregates);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateProfile(input: { handle: string }): Promise<void> {
    setBusy(true);
    setNotice(undefined);
    setError(undefined);
    try {
      const result = await profileApi.createHandle({ handle: input.handle });
      if (!result.ok) {
        if (result.error !== 'ERR_HANDLE_TAKEN' && result.error !== 'ERR_IP_THROTTLED') {
          setError(result.error);
          return;
        }
      }
      const profile = {
        handle: normalizeClientHandle(result.ok ? result.profile.handle : input.handle),
        ...(result.ok ? { createdAt: result.profile.createdAt } : {}),
      };
      setStoredProfile(profile);
      writeStoredPlayerProfile(profile);
      setNotice(`已设置 @${profile.handle}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleBan(handle: string): Promise<void> {
    if (!adminToken) {
      setError('ERR_ADMIN_TOKEN_REQUIRED');
      return;
    }
    setBusy(true);
    setNotice(undefined);
    setError(undefined);
    try {
      const result = await moderationApi.banHandle({
        adminToken,
        handle,
        banned: true,
        reason: 'confirmed report',
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(`已封禁 @${handle}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleResetStats(handle: string): Promise<void> {
    if (!adminToken) {
      setError('ERR_ADMIN_TOKEN_REQUIRED');
      return;
    }
    setBusy(true);
    setNotice(undefined);
    setError(undefined);
    try {
      const result = await moderationApi.resetStats({ adminToken, handle });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(`已重置 @${handle}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleStart(input: Parameters<WaitingRoomScreenProps['onStart']>[0]): Promise<void> {
    if (!currentRoom || !hostToken) {
      setError('ERR_HOST_TOKEN_REQUIRED');
      return;
    }
    setBusy(true);
    setNotice(undefined);
    setError(undefined);
    try {
      const result = await roomApi.startRoom({
        code: currentRoom.code,
        hostToken,
        fillBots: input.fillBots,
        botDifficulty: input.botDifficulty,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setServerGameView(viewWithResponseVersion(result.view, result.version));
      setCurrentRoom((room) => room ? { ...room, status: 'playing' } : room);
      setNotice('游戏已开始');
      setView('table');
    } finally {
      setBusy(false);
    }
  }

  async function handlePlaySelected(cards: Card[]): Promise<void> {
    if (!currentRoom) {
      setNotice(`出牌 · ${cards.length} 张`);
      setSelected(new Set());
      return;
    }
    await submitTableMove({ type: 'play', cards });
  }

  async function handlePass(): Promise<void> {
    if (!currentRoom) {
      setNotice('不要');
      return;
    }
    await submitTableMove({ type: 'pass' });
  }

  function handleSortHand(): void {
    if (!tableView) return;
    const hand = tableView.self?.playerId === activePlayerId ? tableView.self.hand : undefined;
    if (!hand) return;
    setHandOrder(sortHand(hand, tableView.levelRank));
    setNotice('已理牌');
  }

  async function handleSuggestMove(): Promise<void> {
    if (!currentRoom) {
      setNotice('提示仅对房间生效');
      return;
    }
    setBusy(true);
    setNotice(undefined);
    setError(undefined);
    try {
      const result = await assistApi.suggestMove({
        roomId: currentRoom.code,
        playerId: activePlayerId,
        ...(playerToken ? { token: playerToken } : {}),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.move.type === 'play') {
        setSelected(new Set(result.move.cards.map(cardKey)));
      } else {
        setSelected(new Set());
      }
      setNotice(result.description);
    } finally {
      setBusy(false);
    }
  }

  async function submitTableMove(command: SubmitMoveInput['command']): Promise<void> {
    if (!currentRoom) return;
    setBusy(true);
    setNotice(undefined);
    setError(undefined);
    try {
      const result = await moveApi.submitMove({
        roomId: currentRoom.code,
        playerId: activePlayerId,
        ...(playerToken ? { token: playerToken } : {}),
        moveId: createMoveId(),
        command,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSelected(new Set());
      setServerGameView(viewWithResponseVersion(result.view, result.version));
      setNotice(command.type === 'pass' ? '不要' : `出牌 · ${command.cards.length} 张`);
    } finally {
      setBusy(false);
    }
  }

  async function handleTributeConfirm(label: string): Promise<void> {
    const card = selectedCards[0];
    if (!card) {
      setError('ERR_SELECT_CARD_REQUIRED');
      return;
    }
    if (!currentRoom) {
      setNotice(label);
      setSelected(new Set());
      return;
    }
    setBusy(true);
    setNotice(undefined);
    setError(undefined);
    try {
      const result = await phaseApi.submitTributeSelection({
        roomId: currentRoom.code,
        playerId: activePlayerId,
        ...(playerToken ? { token: playerToken } : {}),
        card,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSelected(new Set());
      setServerGameView(viewWithResponseVersion(result.view, result.version));
      setNotice(label);
    } finally {
      setBusy(false);
    }
  }

  async function handleExchangeVote(choice: 'yes' | 'no'): Promise<void> {
    if (!currentRoom) {
      setNotice(choice === 'yes' ? '同意换牌' : '不换');
      return;
    }
    setBusy(true);
    setNotice(undefined);
    setError(undefined);
    try {
      const result = await phaseApi.submitExchangeVote({
        roomId: currentRoom.code,
        playerId: activePlayerId,
        ...(playerToken ? { token: playerToken } : {}),
        choice,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setServerGameView(viewWithResponseVersion(result.view, result.version));
      setNotice(choice === 'yes' ? '同意换牌' : '不换');
    } finally {
      setBusy(false);
    }
  }

  async function handleExchangeConfirm(): Promise<void> {
    if (!currentRoom) {
      setNotice('已确认换牌');
      setSelected(new Set());
      return;
    }
    setBusy(true);
    setNotice(undefined);
    setError(undefined);
    try {
      const result = await phaseApi.submitExchangeSelection({
        roomId: currentRoom.code,
        playerId: activePlayerId,
        ...(playerToken ? { token: playerToken } : {}),
        cards: selectedCards,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSelected(new Set());
      setServerGameView(viewWithResponseVersion(result.view, result.version));
      setNotice('已确认换牌');
    } finally {
      setBusy(false);
    }
  }

  async function handleAdvanceRound(): Promise<void> {
    if (!currentRoom) {
      setNotice('进入下一局');
      return;
    }
    setBusy(true);
    setNotice(undefined);
    setError(undefined);
    try {
      const result = await roundApi.advanceRound({
        roomId: currentRoom.code,
        playerId: activePlayerId,
        ...(playerToken ? { token: playerToken } : {}),
        transitionId: createTransitionId(),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSelected(new Set());
      setServerGameView(viewWithResponseVersion(result.view, result.version));
      setNotice('进入下一局');
    } finally {
      setBusy(false);
    }
  }

  function renderView(): React.ReactElement {
    if (!activeHandle) {
      return <HandleSetupScreen onCreateHandle={(input) => { void handleCreateProfile(input); }} />;
    }
    if (view === 'create') {
      return <CreateRoomScreen hostHandle={activeHandle} onCreate={(input) => { void handleCreate(input); }} />;
    }
    if (view === 'browser') {
      return <RoomBrowserScreen rooms={rooms} onJoin={(code) => { void handleJoin(code); }} />;
    }
    if (view === 'waiting' && currentRoom) {
      return (
        <WaitingRoomScreen
          code={currentRoom.code}
          players={currentRoom.players}
          maxPlayers={currentRoom.maxPlayers}
          onStart={(input) => { void handleStart(input); }}
          onKick={hostToken ? (playerId) => { void handleKick(playerId); } : undefined}
        />
      );
    }
    if (view === 'admin') {
      return (
        <AdminDashboard
          reports={reports}
          latencyAggregates={latencyAggregates}
          onBan={(handle) => { void handleBan(handle); }}
          onResetStats={(handle) => { void handleResetStats(handle); }}
        />
      );
    }
    return renderTable();
  }

  function renderTable(): React.ReactElement {
    if (!orderedTableView) {
      return (
        <section className="gdo-table gdo-table--loading" aria-label="Game loading">
          <div className="gdo-topbar">
            <div className="gdo-room-code">{roomCode}</div>
            <div className="gdo-level">等待同步</div>
            <div className="gdo-round">{liveStream.connected ? '已连接' : '连接中'}</div>
          </div>
          <div className="gdo-table-loading">
            <span className="gdo-table-loading__title">同步牌局中</span>
            <span className="gdo-table-loading__body">等待服务器下发你的手牌和当前局面</span>
          </div>
        </section>
      );
    }

    return (
      <GameTableScreen
        roomCode={roomCode}
        view={orderedTableView}
        currentPlayerId={activePlayerId}
        selectedCardKeys={selected}
        selectedExchangeCards={selectedCards}
        onToggleCard={toggleSelectedCard}
        onPlaySelected={(cards) => { void handlePlaySelected(cards); }}
        onPass={() => { void handlePass(); }}
        onSortHand={handleSortHand}
        onSuggestMove={() => { void handleSuggestMove(); }}
        onAdvanceRound={() => { void handleAdvanceRound(); }}
        onTributeCardToggle={toggleSelectedCard}
        onTributeConfirm={() => { void handleTributeConfirm('已确认进贡'); }}
        onReturnCardToggle={toggleSelectedCard}
        onReturnConfirm={() => { void handleTributeConfirm('已确认还贡'); }}
        onExchangeVote={(choice) => { void handleExchangeVote(choice); }}
        onExchangeCardToggle={toggleSelectedCard}
        onExchangeConfirm={() => { void handleExchangeConfirm(); }}
      />
    );
  }

  function toggleSelectedCard(card: Card): void {
    setSelected((current) => {
      const next = new Set(current);
      const key = cardKey(card);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <main className="gdo-app">
      <div className="gdo-shell">
        {activeHandle ? (
          <nav className="gdo-shell-nav" aria-label="App navigation">
            <button className={navClass(view === 'table')} type="button" onClick={() => setView('table')}>牌桌</button>
            <button className={navClass(view === 'create')} type="button" onClick={() => setView('create')}>开房</button>
            <button className={navClass(view === 'browser')} type="button" onClick={() => { void handleOpenBrowser(); }}>大厅</button>
            <button className={navClass(view === 'admin')} type="button" onClick={() => { void handleOpenAdmin(); }}>管理</button>
          </nav>
        ) : null}
        {(busy || notice || error) ? (
          <div className={['gdo-shell-status', error ? 'gdo-shell-status--error' : ''].filter(Boolean).join(' ')} role={error ? 'alert' : 'status'}>
            {busy ? '处理中' : error ?? notice}
          </div>
        ) : null}
        <OrientationLock>{renderView()}</OrientationLock>
      </div>
    </main>
  );
}

function shouldConnectStream({
  configured,
  hasInjectedView,
  room,
  appView,
  EventSourceCtor,
}: {
  configured: boolean | undefined;
  hasInjectedView: boolean;
  room: PublicRoomDto | undefined;
  appView: AppView;
  EventSourceCtor: GameEventSourceCtor | undefined;
}): boolean {
  if (configured === false || hasInjectedView || appView !== 'table' || !room) return false;
  if (EventSourceCtor) return true;
  return typeof globalThis.EventSource !== 'undefined';
}

function cardsFromSelection(
  view: ClientStateView,
  playerId: string,
  selected: ReadonlySet<string>,
): Card[] {
  if (view.self?.playerId !== playerId) return [];
  return view.self.hand.filter((card) => selected.has(cardKey(card))).map((card) => ({ ...card }));
}

function applyHandOrder(
  view: ClientStateView,
  playerId: string,
  handOrder: readonly Card[] | undefined,
): ClientStateView {
  if (!handOrder || view.self?.playerId !== playerId) return view;
  return {
    ...view,
    self: {
      playerId,
      hand: handOrder.map((card) => ({ ...card })),
    },
  };
}

function newestView(...views: Array<ClientStateView | undefined>): ClientStateView | undefined {
  return views.reduce<ClientStateView | undefined>((latest, candidate) => {
    if (!candidate) return latest;
    if (!latest || candidate.version > latest.version) return candidate;
    return latest;
  }, undefined);
}

function viewWithResponseVersion(view: ClientStateView | undefined, version: number | undefined): ClientStateView | undefined {
  if (!view || typeof version !== 'number' || version <= view.version) return view;
  return { ...view, version };
}

function playerIdForHandle(players: readonly PublicRoomDto['players'][number][], handle: string): string | undefined {
  const normalized = handle.startsWith('@') ? handle.slice(1).toLowerCase() : handle.toLowerCase();
  return players.find((player) => player.handle.toLowerCase() === normalized)?.id;
}

function defaultMoveId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `move_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function defaultTransitionId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `round_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function readStoredPlayerProfile(): StoredPlayerProfile | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return parseStoredPlayerProfile(window.localStorage.getItem(PLAYER_PROFILE_KEY));
  } catch {
    return undefined;
  }
}

function writeStoredPlayerProfile(profile: StoredPlayerProfile): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PLAYER_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // Storage is best-effort; the in-memory handle still works for this tab.
  }
}

function parseStoredPlayerProfile(value: string | null): StoredPlayerProfile | undefined {
  if (!value) return undefined;
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed)) return undefined;
  if (typeof parsed.handle !== 'string') return undefined;
  const handle = normalizeClientHandle(parsed.handle);
  if (!handle) return undefined;
  return {
    handle,
    ...(typeof parsed.createdAt === 'string' ? { createdAt: parsed.createdAt } : {}),
  };
}

function normalizeClientHandle(handle: string): string {
  return handle.trim().replace(/^@/, '').toLowerCase();
}

function readStoredRoomSession(): StoredRoomSession | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return parseStoredRoomSession(window.localStorage.getItem(ACTIVE_ROOM_SESSION_KEY));
  } catch {
    return undefined;
  }
}

function writeStoredRoomSession(session: StoredRoomSessionDraft): void {
  if (typeof window === 'undefined') return;
  try {
    if (!session.room) {
      window.localStorage.removeItem(ACTIVE_ROOM_SESSION_KEY);
      return;
    }
    window.localStorage.setItem(ACTIVE_ROOM_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage is best-effort; active room commands still work for the current tab.
  }
}

function parseStoredRoomSession(value: string | null): StoredRoomSession | undefined {
  if (!value) return undefined;
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed)) return undefined;
  const room = parsed.room;
  const activePlayerId = parsed.activePlayerId;
  const view = parsed.view;
  if (!isPublicRoomDto(room)) return undefined;
  if (typeof activePlayerId !== 'string' || activePlayerId.length === 0) return undefined;
  if (typeof view !== 'string' || !restorableViews.has(view as AppView)) return undefined;
  return {
    room,
    activePlayerId,
    view: view as AppView,
    ...(typeof parsed.hostToken === 'string' ? { hostToken: parsed.hostToken } : {}),
    ...(typeof parsed.playerToken === 'string' ? { playerToken: parsed.playerToken } : {}),
  };
}

function isPublicRoomDto(value: unknown): value is PublicRoomDto {
  if (!isRecord(value)) return false;
  return (
    typeof value.code === 'string' &&
    typeof value.hostHandle === 'string' &&
    Array.isArray(value.players) &&
    typeof value.mode === 'string' &&
    typeof value.maxPlayers === 'number' &&
    typeof value.visibility === 'string' &&
    typeof value.status === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function navClass(active: boolean): string {
  return ['gdo-shell-nav__button', active ? 'gdo-shell-nav__button--active' : ''].filter(Boolean).join(' ');
}

function demoGameView(playerHandle: string): ClientStateView {
  return {
    phase: 'playing',
    mode: '4',
    levelRank: '5',
    version: 3,
    players: [
      { id: 'p1', seat: 'east', team: 't1', displayName: `@${playerHandle}` },
      { id: 'p2', seat: 'south', team: 't2', displayName: '@豆豆' },
      { id: 'p3', seat: 'west', team: 't1', displayName: '@毛毛' },
      { id: 'p4', seat: 'north', team: 't2', displayName: '@小雨' },
    ],
    currentTurn: 'p4',
    handCounts: { p1: HAND.length, p2: 17, p3: 18, p4: 20 },
    self: { playerId: 'p1', hand: HAND },
    currentTrick: {
      leader: 'p2',
      currentPlay: { playerId: 'p2', cards: TRICK, kind: 'single' },
      passes: [],
    },
    finished: [],
  };
}
