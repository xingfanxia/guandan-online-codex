// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { App } from '../../src/App';
import type { AppAssistApi, AppModerationApi, AppMoveApi, AppPhaseApi, AppRoomApi, AppRoundApi } from '../../src/App';
import type { PublicRoomDto, RoomPlayerDto } from '../../src/lib/api/rooms';
import type { ReportRecordDto } from '../../src/lib/api/moderation';
import type { Card } from '../../lib/game/cards';
import type { ClientStateView } from '../../lib/realtime/payload';

function c(rank: Card['rank'], suit: Card['suit'] = 'spades', deck: Card['deck'] = 1): Card {
  return { rank, suit, deck };
}

function room(overrides: Partial<PublicRoomDto> = {}): PublicRoomDto {
  return { ...baseRoom(), ...overrides };
}

function baseRoom(): PublicRoomDto {
  return {
    code: 'K7M2P9',
    hostHandle: 'fufu',
    players: [{ id: 'p1', handle: 'fufu', role: 'host' as const }],
    mode: '4',
    maxPlayers: 4,
    visibility: 'public' as const,
    updatedAt: '2026-05-18T00:00:00.000Z',
  };
}

function roomApi(overrides: Partial<AppRoomApi> = {}): AppRoomApi {
  const joinedPlayers: RoomPlayerDto[] = [
    { id: 'p1', handle: 'fufu', role: 'host' },
    { id: 'p2', handle: 'momo', role: 'player' },
  ];
  return {
    createRoom: async () => ({ ok: true, room: room(), hostToken: 'host-token', joinToken: 'join-token', playerToken: 'player-token-p1' }),
    joinRoom: async () => ({ ok: true, room: room({ players: joinedPlayers }), player: joinedPlayers[1]!, playerToken: 'player-token-p2' }),
    kickPlayer: async () => ({ ok: true, room: room() }),
    startRoom: async () => ({ ok: true, phase: 'playing', version: 1, players: [] }),
    listRooms: async () => ({ ok: true, rooms: [room()] }),
    ...overrides,
  };
}

function report(overrides: Partial<ReportRecordDto> = {}): ReportRecordDto {
  return {
    id: 'report:fufu:momo:K7M2P9',
    reporterHandle: 'fufu',
    targetHandle: 'momo',
    gameId: 'K7M2P9',
    reason: 'cheat',
    status: 'open',
    createdAt: '2026-05-18T00:00:00.000Z',
    ...overrides,
  };
}

function moderationApi(overrides: Partial<AppModerationApi> = {}): AppModerationApi {
  return {
    listReports: async () => ({ ok: true, reports: [report()] }),
    listLatency: async () => ({
      ok: true,
      aggregates: [{ route: '/api/move', region: 'US', count: 7, p50: 110, p95: 240, p99: 300 }],
    }),
    banHandle: async () => ({ ok: true, player: { handle: 'momo', banned: true } }),
    resetStats: async () => ({ ok: true, player: { handle: 'momo', statsResetAt: '2026-05-18T00:05:00.000Z' } }),
    ...overrides,
  };
}

function playingView(): ClientStateView {
  return {
    phase: 'playing',
    mode: '4',
    levelRank: '5',
    version: 9,
    players: [
      { id: 'p1', seat: 'east', team: 't1', displayName: '@fufu' },
      { id: 'p2', seat: 'south', team: 't2', displayName: '@momo' },
      { id: 'p3', seat: 'west', team: 't1', displayName: '@doudou' },
      { id: 'p4', seat: 'north', team: 't2', displayName: '@xiaoyu' },
    ],
    currentTurn: 'p2',
    handCounts: { p1: 10, p2: 17, p3: 18, p4: 20 },
    self: {
      playerId: 'p1',
      hand: [
        c('3'),
        c('3', 'hearts'),
        c('5', 'hearts'),
        c('7', 'clubs'),
        c('9', 'diamonds'),
        c('J'),
        c('Q', 'hearts'),
        c('A'),
        c('BJ', 'joker'),
        c('RJ', 'joker'),
      ],
    },
    currentTrick: {
      leader: 'p2',
      currentPlay: { playerId: 'p2', cards: [c('A', 'diamonds', 2)], kind: 'single' },
      passes: [],
    },
    finished: [],
  };
}

function tributeView(): ClientStateView {
  return {
    phase: 'tribute-pending',
    mode: '4',
    levelRank: '5',
    version: 10,
    players: [
      { id: 'p1', seat: 'east', team: 't1', displayName: '@fufu' },
      { id: 'p2', seat: 'south', team: 't2', displayName: '@momo' },
      { id: 'p3', seat: 'west', team: 't1', displayName: '@doudou' },
      { id: 'p4', seat: 'north', team: 't2', displayName: '@xiaoyu' },
    ],
    handCounts: { p1: 1, p2: 12, p3: 8, p4: 10 },
    self: { playerId: 'p1', hand: [c('A')] },
    tribute: {
      obligations: [{ from: 'p1', to: 'p2', fromPosition: 4, toPosition: 1 }],
      deadlineAt: '2026-05-18T00:00:15.000Z',
    },
  };
}

function roundEndView(): ClientStateView {
  return {
    phase: 'round-end',
    mode: '4',
    levelRank: '5',
    version: 10,
    players: [
      { id: 'p1', seat: 'east', team: 't1', displayName: '@fufu' },
      { id: 'p2', seat: 'south', team: 't2', displayName: '@momo' },
      { id: 'p3', seat: 'west', team: 't1', displayName: '@doudou' },
      { id: 'p4', seat: 'north', team: 't2', displayName: '@xiaoyu' },
    ],
    handCounts: { p1: 0, p2: 4, p3: 0, p4: 3 },
    self: { playerId: 'p1', hand: [] },
    placements: [
      { playerId: 'p1', position: 1, team: 't1' },
      { playerId: 'p3', position: 2, team: 't1' },
      { playerId: 'p2', position: 3, team: 't2' },
      { playerId: 'p4', position: 4, team: 't2' },
    ],
  };
}

describe('App shell', () => {
  test('renders the game table as the first screen and supports card selection', () => {
    render(<App />);

    expect(screen.getByLabelText('Guandan table')).toBeInTheDocument();
    expect(screen.getByText('K7M2P9')).toBeInTheDocument();
    expect(screen.getByText('打 5')).toBeInTheDocument();
    expect(screen.getByText('出牌 · 0 张')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('3 of spades'));

    expect(screen.getByText('出牌 · 1 张')).toBeInTheDocument();
    expect(screen.getByLabelText('3 of spades')).toHaveAttribute('aria-pressed', 'true');
  });

  test('creates a room through the app shell and opens the waiting room', async () => {
    const api = roomApi({
      createRoom: async (input) => {
        expect(input).toMatchObject({ hostHandle: 'fufu', mode: '4', rules: { cardExchange: true }, visibility: 'public' });
        return { ok: true, room: room(), hostToken: 'host-token', joinToken: 'join-token', playerToken: 'player-token-p1' };
      },
    });

    render(<App roomApi={api} playerHandle="fufu" />);

    fireEvent.click(screen.getByRole('button', { name: '开房' }));
    fireEvent.click(screen.getByRole('button', { name: '换牌' }));
    fireEvent.click(screen.getByRole('button', { name: '创建房间' }));

    expect(await screen.findByLabelText('Waiting room')).toBeInTheDocument();
    expect(screen.getByText('K7M2P9')).toBeInTheDocument();
    expect(screen.getByText('已创建房间 K7M2P9')).toBeInTheDocument();
  });

  test('starts the current room with the stored host token and waits for live state', async () => {
    const started: unknown[] = [];
    const api = roomApi({
      startRoom: async (input) => {
        started.push(input);
        return { ok: true, phase: 'playing', version: 1, players: [] };
      },
    });

    render(<App roomApi={api} playerHandle="fufu" />);
    fireEvent.click(screen.getByRole('button', { name: '开房' }));
    fireEvent.click(screen.getByRole('button', { name: '创建房间' }));
    fireEvent.click(await screen.findByRole('button', { name: '开始' }));

    await waitFor(() => expect(started).toEqual([
      { code: 'K7M2P9', hostToken: 'host-token', fillBots: true, botDifficulty: 'easy' },
    ]));
    expect(screen.getByLabelText('Game loading')).toBeInTheDocument();
    expect(screen.getByText('同步牌局中')).toBeInTheDocument();
    expect(screen.queryByText('打 5')).not.toBeInTheDocument();
  });

  test('hydrates the table from the start-room response when a filtered view is returned', async () => {
    const api = roomApi({
      startRoom: async () => ({ ok: true, phase: 'playing', mode: '4', version: 9, players: [], view: playingView() }),
    });

    render(<App roomApi={api} playerHandle="fufu" />);
    fireEvent.click(screen.getByRole('button', { name: '开房' }));
    fireEvent.click(screen.getByRole('button', { name: '创建房间' }));
    fireEvent.click(await screen.findByRole('button', { name: '开始' }));

    expect(await screen.findByLabelText('Guandan table')).toBeInTheDocument();
    expect(screen.queryByLabelText('Game loading')).not.toBeInTheDocument();
    expect(screen.getByText('打 5')).toBeInTheDocument();
    expect(screen.getByLabelText('3 of spades')).toBeInTheDocument();
  });

  test('lets the host kick a waiting-room player', async () => {
    const kicks: unknown[] = [];
    const players: RoomPlayerDto[] = [
      { id: 'p1', handle: 'fufu', role: 'host' },
      { id: 'p2', handle: 'momo', role: 'player' },
    ];
    const api = roomApi({
      createRoom: async () => ({
        ok: true,
        room: room({ players }),
        hostToken: 'host-token',
        joinToken: 'join-token',
        playerToken: 'player-token-p1',
      }),
      kickPlayer: async (input) => {
        kicks.push(input);
        return { ok: true, room: room() };
      },
    });

    render(<App roomApi={api} playerHandle="fufu" />);
    fireEvent.click(screen.getByRole('button', { name: '开房' }));
    fireEvent.click(screen.getByRole('button', { name: '创建房间' }));
    fireEvent.click(await screen.findByRole('button', { name: '踢出 momo' }));

    await waitFor(() => expect(kicks).toEqual([{
      code: 'K7M2P9',
      hostToken: 'host-token',
      playerId: 'p2',
    }]));
    expect(screen.queryByText('@momo')).not.toBeInTheDocument();
  });

  test('submits selected live-table cards through the move API after room start', async () => {
    const moves: unknown[] = [];
    const moveApi: AppMoveApi = {
      submitMove: async (input) => {
        moves.push(input);
        return { ok: true, version: 2, events: ['move_played'], view: playingView() };
      },
    };

    render(
      <App
        roomApi={roomApi()}
        moveApi={moveApi}
        gameView={playingView()}
        playerHandle="fufu"
        createMoveId={() => 'move-fixed'}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '开房' }));
    fireEvent.click(screen.getByRole('button', { name: '创建房间' }));
    fireEvent.click(await screen.findByRole('button', { name: '开始' }));
    fireEvent.click(await screen.findByLabelText('3 of spades'));
    fireEvent.click(screen.getByRole('button', { name: '出牌 · 1 张' }));

    await waitFor(() => expect(moves).toEqual([{
      roomId: 'K7M2P9',
      playerId: 'p1',
      token: 'player-token-p1',
      moveId: 'move-fixed',
      command: { type: 'play', cards: [c('3')] },
    }]));
    expect(screen.getByLabelText('Guandan table')).toBeInTheDocument();
  });

  test('uses assistance APIs to sort and select a suggested move', async () => {
    const assistApi: AppAssistApi = {
      suggestMove: async (input) => {
        expect(input).toEqual({ roomId: 'K7M2P9', playerId: 'p1', token: 'player-token-p1' });
        return {
          ok: true,
          move: {
            type: 'play',
            cards: [c('7', 'clubs')],
            pattern: { kind: 'single', length: 1, primaryRank: '7', wildcardsUsed: 0 },
          },
          description: '出最稳单张',
        };
      },
    };

    render(<App roomApi={roomApi()} assistApi={assistApi} gameView={playingView()} playerHandle="fufu" />);
    fireEvent.click(screen.getByRole('button', { name: '开房' }));
    fireEvent.click(screen.getByRole('button', { name: '创建房间' }));
    fireEvent.click(await screen.findByRole('button', { name: '开始' }));

    fireEvent.click(await screen.findByRole('button', { name: '理牌' }));
    const firstCardAfterSort = screen.getAllByRole('button', { name: /of/ })[0];
    expect(firstCardAfterSort).toHaveAttribute('aria-label', '3 of hearts');

    fireEvent.click(screen.getByRole('button', { name: '提示' }));
    await waitFor(() => expect(screen.getByLabelText('7 of clubs')).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByText('出最稳单张')).toBeInTheDocument();
  });

  test('submits tribute selections through the phase API for an active room', async () => {
    const selections: unknown[] = [];
    const phaseApi: AppPhaseApi = {
      submitTributeSelection: async (input) => {
        selections.push(input);
        return { ok: true, phase: 'playing', version: 11, view: playingView() };
      },
      submitExchangeVote: async () => ({ ok: true, phase: 'exchange-select-pending' }),
      submitExchangeSelection: async () => ({ ok: true, completed: false }),
    };

    render(
      <App
        roomApi={roomApi()}
        phaseApi={phaseApi}
        gameView={tributeView()}
        playerHandle="fufu"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '开房' }));
    fireEvent.click(screen.getByRole('button', { name: '创建房间' }));
    fireEvent.click(await screen.findByRole('button', { name: '开始' }));
    const tributeCards = await screen.findAllByLabelText('A of spades');
    fireEvent.click(tributeCards.at(-1)!);
    fireEvent.click(screen.getByRole('button', { name: '确认进贡' }));

    await waitFor(() => expect(selections).toEqual([{
      roomId: 'K7M2P9',
      playerId: 'p1',
      token: 'player-token-p1',
      card: c('A'),
    }]));
    expect(screen.queryByLabelText('Tribute phase')).not.toBeInTheDocument();
  });

  test('advances a completed round through the round API with the stored player token', async () => {
    const advances: unknown[] = [];
    const roundApi: AppRoundApi = {
      advanceRound: async (input) => {
        advances.push(input);
        return { ok: true, phase: 'tribute-pending', version: 11, view: tributeView() };
      },
    };

    render(
      <App
        roomApi={roomApi()}
        roundApi={roundApi}
        gameView={roundEndView()}
        playerHandle="fufu"
        createTransitionId={() => 'round-fixed'}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '开房' }));
    fireEvent.click(screen.getByRole('button', { name: '创建房间' }));
    fireEvent.click(await screen.findByRole('button', { name: '开始' }));
    fireEvent.click(await screen.findByRole('button', { name: '下一局' }));

    await waitFor(() => expect(advances).toEqual([{
      roomId: 'K7M2P9',
      playerId: 'p1',
      token: 'player-token-p1',
      transitionId: 'round-fixed',
    }]));
    expect(screen.getByLabelText('Tribute phase')).toBeInTheDocument();
  });

  test('loads public rooms and joins without a token from the browser', async () => {
    const joined: unknown[] = [];
    const api = roomApi({
      joinRoom: async (input) => {
        joined.push(input);
        const players: RoomPlayerDto[] = [
          { id: 'p1', handle: 'fufu', role: 'host' },
          { id: 'p2', handle: 'momo', role: 'player' },
        ];
        return {
          ok: true,
          room: room({ players }),
          player: players[1]!,
          playerToken: 'player-token-p2',
        };
      },
    });

    render(<App roomApi={api} playerHandle="momo" />);
    fireEvent.click(screen.getByRole('button', { name: '大厅' }));

    expect(await screen.findByLabelText('加入 K7M2P9')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('加入 K7M2P9'));

    await waitFor(() => expect(joined).toEqual([{ code: 'K7M2P9', handle: 'momo' }]));
    expect(await screen.findByLabelText('Waiting room')).toBeInTheDocument();
    expect(screen.getByText('@momo')).toBeInTheDocument();
  });

  test('loads admin reports and sends moderation actions with the injected token', async () => {
    const bans: unknown[] = [];
    const resets: unknown[] = [];
    const api = moderationApi({
      banHandle: async (input) => {
        bans.push(input);
        return { ok: true, player: { handle: 'momo', banned: true } };
      },
      resetStats: async (input) => {
        resets.push(input);
        return { ok: true, player: { handle: 'momo', statsResetAt: '2026-05-18T00:05:00.000Z' } };
      },
    });

    render(<App moderationApi={api} adminToken="secret" />);
    fireEvent.click(screen.getByRole('button', { name: '管理' }));

    expect(await screen.findByLabelText('Admin dashboard')).toBeInTheDocument();
    expect(screen.getByText('@momo')).toBeInTheDocument();
    expect(screen.getByText('p95 240ms')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '封禁 momo' }));
    fireEvent.click(screen.getByRole('button', { name: '重置 momo' }));

    await waitFor(() => expect(bans).toEqual([{ adminToken: 'secret', handle: 'momo', banned: true, reason: 'confirmed report' }]));
    await waitFor(() => expect(resets).toEqual([{ adminToken: 'secret', handle: 'momo' }]));
  });

  test('does not call admin APIs without an injected admin token', async () => {
    const calls: unknown[] = [];
    const api = moderationApi({
      listReports: async (input) => {
        calls.push(input);
        return { ok: true, reports: [] };
      },
    });

    render(<App moderationApi={api} />);
    fireEvent.click(screen.getByRole('button', { name: '管理' }));

    expect(screen.getByRole('alert')).toHaveTextContent('ERR_ADMIN_TOKEN_REQUIRED');
    expect(calls).toEqual([]);
  });
});
