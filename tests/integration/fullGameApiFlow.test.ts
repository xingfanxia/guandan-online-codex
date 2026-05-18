import { describe, expect, test } from 'vitest';
import { createJoinRoomHandler } from '../../api/room/[code]/join';
import { createStartRoomHandler } from '../../api/room/[code]/start';
import { createCreateRoomHandler } from '../../api/room/create';
import { createMoveHandler } from '../../api/move';
import { createNextRoundHandler } from '../../api/round/next';
import { createTributeSelectHandler } from '../../api/tribute/select';
import { generateDeckForMode, generateDoubleDeck, type Card, type Rank, type Suit } from '../../lib/game/cards';
import { autoPickReturnCard } from '../../lib/game/tribute';
import type { GameState, Player, PlayerId, PlayingState, ReturnPendingState } from '../../lib/game/state';
import { MemoryEventLog } from '../../lib/realtime/eventLog';
import { MemoryIdempotencyStore } from '../../lib/realtime/idempotency';
import { MessageType } from '../../lib/realtime/messages';
import { MemoryGameStateStore } from '../../lib/realtime/stateStore';
import type { RealtimePublisher } from '../../lib/realtime/upstash';
import { MemoryRoomStore } from '../../lib/room/lifecycle';
import { DEFAULT_ROOM_RULES } from '../../lib/room/rules';

function c(rank: Rank, suit: Suit = 'spades', deck = 1): Card {
  return { rank, suit, deck };
}

function jsonRequest(url: string, body: unknown, method = 'POST'): Request {
  const init: RequestInit = { method, headers: { 'content-type': 'application/json' } };
  if (method === 'POST') init.body = JSON.stringify(body);
  return new Request(url, init);
}

function monotonicRandom(): () => number {
  let value = 0;
  return () => {
    const next = value;
    value += 0.01;
    return next % 1;
  };
}

describe('full game API flow', () => {
  test('eight humans can complete a full 8P game through token-authorized APIs', async () => {
    const roomStore = new MemoryRoomStore();
    const stateStore = new MemoryGameStateStore();
    const idempotency = new MemoryIdempotencyStore();
    const eventLog = new MemoryEventLog();
    const publisher: RealtimePublisher = { async publish() {} };
    const createRoom = createCreateRoomHandler({
      store: roomStore,
      random: monotonicRandom(),
      nowIso: () => '2026-05-18T00:00:00.000Z',
    });
    const joinRoom = createJoinRoomHandler({ store: roomStore });
    const startRoom = createStartRoomHandler({
      roomStore,
      stateStore,
      eventLog,
      publisher,
      deckForRoom: () => generateDeckForMode('8'),
    });
    const move = createMoveHandler({
      stateStore,
      idempotency,
      eventLog,
      publisher,
      roomStore,
      botChain: false,
      nowMs: () => 1_000,
    });
    const nextRound = createNextRoundHandler({
      stateStore,
      idempotency,
      eventLog,
      publisher,
      roomStore,
      deckForRoom: () => plainDeck('8'),
      rulesForRoom: () => ({ ...DEFAULT_ROOM_RULES, antiTributeCondition: 'disabled' }),
      deadlineAt: () => '2026-05-18T00:00:15.000Z',
      exchangeDeadlineAt: () => '2026-05-18T00:00:30.000Z',
      nowMs: () => 1_000,
    });
    const tribute = createTributeSelectHandler({
      stateStore,
      eventLog,
      publisher,
      roomStore,
      rulesForRoom: () => ({ ...DEFAULT_ROOM_RULES, antiTributeCondition: 'disabled' }),
      returnDeadlineAt: () => '2026-05-18T00:00:15.000Z',
      exchangeDeadlineAt: () => '2026-05-18T00:00:30.000Z',
    });

    const created = await (await createRoom(jsonRequest('https://gdo.ax0x.ai/api/room/create', {
      hostHandle: '@Fufu',
      mode: '8',
    }))).json();
    const roomId = created.room.code as string;
    const tokens: Record<PlayerId, string> = { p1: created.playerToken as string };
    for (const [index, handle] of ['@Momo', '@Doudou', '@Xiaoyu', '@Abao', '@Mingming', '@Tiantian', '@Lele'].entries()) {
      const playerId = `p${index + 2}`;
      const joined = await (await joinRoom(jsonRequest(`https://gdo.ax0x.ai/api/room/${roomId}/join`, {
        handle,
      }), { code: roomId })).json();
      expect(joined).toMatchObject({ ok: true, player: { id: playerId } });
      tokens[playerId] = joined.playerToken as string;
    }
    expect((await startRoom(jsonRequest(`https://gdo.ax0x.ai/api/room/${roomId}/start`, {
      hostToken: created.hostToken,
      fillBots: false,
      botDifficulty: 'easy',
    }), { code: roomId })).status).toBe(200);

    let completedRounds = 0;
    for (let round = 1; round <= 4; round++) {
      const beforeRound = await requireState(stateStore.get(roomId));
      await stateStore.set(roomId, t1EightPlayerSweepState(beforeRound));

      const moveResponse = await move(jsonRequest('https://gdo.ax0x.ai/api/move', {
        roomId,
        moveId: `8-human-finish-round-${round}`,
        playerId: 'p1',
        token: tokens.p1,
        command: { type: 'play', cards: [c('3')] },
      }));
      const moveBody = await moveResponse.json();
      completedRounds += 1;
      if (moveBody.view?.phase === 'game-end') break;

      expect(moveBody).toMatchObject({ ok: true, view: { phase: 'round-end', mode: '8', winnerTeam: 't1' } });
      expect((await nextRound(jsonRequest('https://gdo.ax0x.ai/api/round/next', {
        roomId,
        transitionId: `8-human-next-round-${round}`,
        playerId: 'p1',
        token: tokens.p1,
      }))).status).toBe(200);
      await completeHumanReturns({ roomId, stateStore, tribute, tokens });
      expect((await requireState(stateStore.get(roomId))).phase).toBe('playing');
    }

    expect(completedRounds).toBe(4);
    expect(await requireState(stateStore.get(roomId))).toMatchObject({
      phase: 'game-end',
      mode: '8',
      winnerTeam: 't1',
    });
  });

  test('one human and seven bots can complete a full 8P sweep game through APIs', async () => {
    const roomStore = new MemoryRoomStore();
    const stateStore = new MemoryGameStateStore();
    const idempotency = new MemoryIdempotencyStore();
    const eventLog = new MemoryEventLog();
    const publisher: RealtimePublisher = { async publish() {} };
    const createRoom = createCreateRoomHandler({
      store: roomStore,
      random: monotonicRandom(),
      nowIso: () => '2026-05-18T00:00:00.000Z',
    });
    const startRoom = createStartRoomHandler({
      roomStore,
      stateStore,
      eventLog,
      publisher,
      deckForRoom: () => generateDeckForMode('8'),
    });
    const move = createMoveHandler({
      stateStore,
      idempotency,
      eventLog,
      publisher,
      roomStore,
      botChain: false,
      nowMs: () => 1_000,
    });
    const nextRound = createNextRoundHandler({
      stateStore,
      idempotency,
      eventLog,
      publisher,
      roomStore,
      deckForRoom: () => plainDeck('8'),
      rulesForRoom: () => ({ ...DEFAULT_ROOM_RULES, antiTributeCondition: 'disabled' }),
      deadlineAt: () => '2026-05-18T00:00:15.000Z',
      exchangeDeadlineAt: () => '2026-05-18T00:00:30.000Z',
      nowMs: () => 1_000,
    });
    const tribute = createTributeSelectHandler({
      stateStore,
      eventLog,
      publisher,
      roomStore,
      rulesForRoom: () => ({ ...DEFAULT_ROOM_RULES, antiTributeCondition: 'disabled' }),
      returnDeadlineAt: () => '2026-05-18T00:00:15.000Z',
      exchangeDeadlineAt: () => '2026-05-18T00:00:30.000Z',
    });

    const created = await (await createRoom(jsonRequest('https://gdo.ax0x.ai/api/room/create', {
      hostHandle: '@Fufu',
      mode: '8',
    }))).json();
    const roomId = created.room.code as string;
    const playerToken = created.playerToken as string;
    expect((await startRoom(jsonRequest(`https://gdo.ax0x.ai/api/room/${roomId}/start`, {
      hostToken: created.hostToken,
      fillBots: true,
      botDifficulty: 'medium',
    }), { code: roomId })).status).toBe(200);

    let completedRounds = 0;
    for (let round = 1; round <= 4; round++) {
      const beforeRound = await requireState(stateStore.get(roomId));
      await stateStore.set(roomId, t1EightPlayerSweepState(beforeRound));

      const moveResponse = await move(jsonRequest('https://gdo.ax0x.ai/api/move', {
        roomId,
        moveId: `8p-human-finish-round-${round}`,
        playerId: 'p1',
        token: playerToken,
        command: { type: 'play', cards: [c('3')] },
      }));
      const moveBody = await moveResponse.json();
      completedRounds += 1;

      if (moveBody.view?.phase === 'game-end') {
        expect(moveBody).toMatchObject({
          ok: true,
          view: { phase: 'game-end', winnerTeam: 't1', mode: '8', self: { playerId: 'p1' } },
          events: [MessageType.MovePlayed, MessageType.GameEnd],
        });
        break;
      }

      expect(moveBody).toMatchObject({
        ok: true,
        view: { phase: 'round-end', winnerTeam: 't1', mode: '8', self: { playerId: 'p1' } },
      });
      const transition = await nextRound(jsonRequest('https://gdo.ax0x.ai/api/round/next', {
        roomId,
        transitionId: `8p-next-round-${round}`,
        playerId: 'p1',
        token: playerToken,
      }));
      expect(transition.status).toBe(200);
      await completeHumanReturns({
        roomId,
        stateStore,
        tribute,
        tokens: { p1: playerToken },
      });
      const nextState = await requireState(stateStore.get(roomId));
      expect(nextState).toMatchObject({ phase: 'playing', mode: '8' });
    }

    const finalState = await requireState(stateStore.get(roomId));
    expect(completedRounds).toBe(4);
    expect(finalState).toMatchObject({
      phase: 'game-end',
      mode: '8',
      winnerTeam: 't1',
      progression: { levels: { t1: 'A' }, roundOwner: 't1' },
    });
    expect(eventLog.replayAfter(roomId, 'p1').map((entry) => entry.payload.type)).toContain(MessageType.GameEnd);
  });

  test('one human and three bots can complete a full 4P game with automated phase actions', async () => {
    const roomStore = new MemoryRoomStore();
    const stateStore = new MemoryGameStateStore();
    const idempotency = new MemoryIdempotencyStore();
    const eventLog = new MemoryEventLog();
    const publisher: RealtimePublisher = { async publish() {} };
    const createRoom = createCreateRoomHandler({
      store: roomStore,
      random: monotonicRandom(),
      nowIso: () => '2026-05-18T00:00:00.000Z',
    });
    const startRoom = createStartRoomHandler({
      roomStore,
      stateStore,
      eventLog,
      publisher,
      deckForRoom: () => generateDoubleDeck(),
    });
    const move = createMoveHandler({
      stateStore,
      idempotency,
      eventLog,
      publisher,
      roomStore,
      botChain: false,
      nowMs: () => 1_000,
    });
    const nextRound = createNextRoundHandler({
      stateStore,
      idempotency,
      eventLog,
      publisher,
      roomStore,
      deckForRoom: () => plainDeck(),
      rulesForRoom: () => ({ ...DEFAULT_ROOM_RULES, antiTributeCondition: 'disabled' }),
      deadlineAt: () => '2026-05-18T00:00:15.000Z',
      exchangeDeadlineAt: () => '2026-05-18T00:00:30.000Z',
      nowMs: () => 1_000,
    });
    const tribute = createTributeSelectHandler({
      stateStore,
      eventLog,
      publisher,
      roomStore,
      rulesForRoom: () => ({ ...DEFAULT_ROOM_RULES, antiTributeCondition: 'disabled' }),
      returnDeadlineAt: () => '2026-05-18T00:00:15.000Z',
      exchangeDeadlineAt: () => '2026-05-18T00:00:30.000Z',
    });

    const created = await (await createRoom(jsonRequest('https://gdo.ax0x.ai/api/room/create', {
      hostHandle: '@Fufu',
    }))).json();
    const roomId = created.room.code as string;
    const playerToken = created.playerToken as string;
    expect((await startRoom(jsonRequest(`https://gdo.ax0x.ai/api/room/${roomId}/start`, {
      hostToken: created.hostToken,
      fillBots: true,
      botDifficulty: 'easy',
    }), { code: roomId })).status).toBe(200);

    let completedRounds = 0;
    for (let round = 1; round <= 5; round++) {
      const beforeRound = await requireState(stateStore.get(roomId));
      await stateStore.set(roomId, t1HumanSecondState(beforeRound));

      const moveResponse = await move(jsonRequest('https://gdo.ax0x.ai/api/move', {
        roomId,
        moveId: `human-finish-round-${round}`,
        playerId: 'p1',
        token: playerToken,
        command: { type: 'play', cards: [c('3')] },
      }));
      const moveBody = await moveResponse.json();
      completedRounds += 1;

      if (moveBody.view?.phase === 'game-end') {
        expect(moveBody).toMatchObject({
          ok: true,
          view: { phase: 'game-end', winnerTeam: 't1', self: { playerId: 'p1' } },
          events: [MessageType.MovePlayed, MessageType.GameEnd],
        });
        break;
      }

      expect(moveBody).toMatchObject({
        ok: true,
        view: { phase: 'round-end', winnerTeam: 't1', self: { playerId: 'p1' } },
      });
      const transition = await nextRound(jsonRequest('https://gdo.ax0x.ai/api/round/next', {
        roomId,
        transitionId: `human-next-round-${round}`,
        playerId: 'p1',
        token: playerToken,
      }));
      expect(transition.status).toBe(200);
      await completeHumanReturns({
        roomId,
        stateStore,
        tribute,
        tokens: { p1: playerToken },
      });
      expect((await requireState(stateStore.get(roomId))).phase).toBe('playing');
    }

    const finalState = await requireState(stateStore.get(roomId));
    expect(completedRounds).toBe(5);
    expect(finalState).toMatchObject({
      phase: 'game-end',
      winnerTeam: 't1',
      progression: { levels: { t1: 'A' }, roundOwner: 't1' },
    });
    expect(eventLog.replayAfter(roomId, 'p1').map((entry) => entry.payload.type)).toContain(MessageType.GameEnd);
  });

  test('four humans can complete a full 4P game through room, move, tribute, and round APIs', async () => {
    const roomStore = new MemoryRoomStore();
    const stateStore = new MemoryGameStateStore();
    const idempotency = new MemoryIdempotencyStore();
    const eventLog = new MemoryEventLog();
    const published: Array<{ channel: string; payload: string }> = [];
    const publisher: RealtimePublisher = {
      async publish(channel, payload) {
        published.push({ channel, payload });
      },
    };
    const random = monotonicRandom();
    const createRoom = createCreateRoomHandler({
      store: roomStore,
      random,
      nowIso: () => '2026-05-18T00:00:00.000Z',
    });
    const joinRoom = createJoinRoomHandler({ store: roomStore });
    const startRoom = createStartRoomHandler({
      roomStore,
      stateStore,
      eventLog,
      publisher,
      deckForRoom: () => generateDoubleDeck(),
    });
    const move = createMoveHandler({
      stateStore,
      idempotency,
      eventLog,
      publisher,
      roomStore,
      botChain: false,
      nowMs: () => 1_000,
    });
    const nextRound = createNextRoundHandler({
      stateStore,
      idempotency,
      eventLog,
      publisher,
      roomStore,
      deckForRoom: () => plainDeck(),
      rulesForRoom: () => ({ ...DEFAULT_ROOM_RULES, antiTributeCondition: 'disabled' }),
      deadlineAt: () => '2026-05-18T00:00:15.000Z',
      exchangeDeadlineAt: () => '2026-05-18T00:00:30.000Z',
      nowMs: () => 1_000,
    });
    const tribute = createTributeSelectHandler({
      stateStore,
      eventLog,
      publisher,
      roomStore,
      rulesForRoom: () => ({ ...DEFAULT_ROOM_RULES, antiTributeCondition: 'disabled' }),
      returnDeadlineAt: () => '2026-05-18T00:00:15.000Z',
      exchangeDeadlineAt: () => '2026-05-18T00:00:30.000Z',
    });

    const created = await (await createRoom(jsonRequest('https://gdo.ax0x.ai/api/room/create', {
      hostHandle: '@Fufu',
    }))).json();
    const roomId = created.room.code as string;
    const tokens: Record<PlayerId, string> = { p1: created.playerToken as string };
    for (const [handle, playerId] of [
      ['@Momo', 'p2'],
      ['@Doudou', 'p3'],
      ['@Xiaoyu', 'p4'],
    ] as const) {
      const joined = await (await joinRoom(jsonRequest(`https://gdo.ax0x.ai/api/room/${roomId}/join`, {
        handle,
      }), { code: roomId })).json();
      expect(joined).toMatchObject({ ok: true, player: { id: playerId } });
      tokens[playerId] = joined.playerToken as string;
    }

    expect((await startRoom(jsonRequest(`https://gdo.ax0x.ai/api/room/${roomId}/start`, {
      hostToken: created.hostToken,
      fillBots: false,
      botDifficulty: 'easy',
    }), { code: roomId })).status).toBe(200);

    let completedRounds = 0;
    for (let round = 1; round <= 5; round++) {
      const beforeRound = await requireState(stateStore.get(roomId));
      await stateStore.set(roomId, t1DoubleOutState(beforeRound));

      const moveResponse = await move(jsonRequest('https://gdo.ax0x.ai/api/move', {
        roomId,
        moveId: `finish-round-${round}`,
        playerId: 'p3',
        token: tokens.p3,
        command: { type: 'play', cards: [c('3')] },
      }));
      const moveBody = await moveResponse.json();
      completedRounds += 1;

      if (moveBody.phase === 'game-end' || moveBody.view?.phase === 'game-end') {
        expect(moveBody).toMatchObject({
          ok: true,
          version: expect.any(Number),
          view: {
            phase: 'game-end',
            winnerTeam: 't1',
            self: { playerId: 'p3' },
          },
          events: [MessageType.MovePlayed, MessageType.GameEnd],
        });
        break;
      }

      expect(moveBody).toMatchObject({
        ok: true,
        view: {
          phase: 'round-end',
          winnerTeam: 't1',
          self: { playerId: 'p3' },
        },
        events: [MessageType.MovePlayed, MessageType.RoundEnd],
      });

      const transition = await nextRound(jsonRequest('https://gdo.ax0x.ai/api/round/next', {
        roomId,
        transitionId: `next-round-${round}`,
        playerId: 'p1',
        token: tokens.p1,
      }));
      expect(transition.status).toBe(200);
      await completeHumanReturns({
        roomId,
        stateStore,
        tribute,
        tokens,
      });
      const nextState = await requireState(stateStore.get(roomId));
      expect(nextState.phase).toBe('playing');
    }

    const finalState = await requireState(stateStore.get(roomId));
    expect(completedRounds).toBe(5);
    expect(finalState).toMatchObject({
      phase: 'game-end',
      winnerTeam: 't1',
      progression: {
        levels: { t1: 'A' },
        roundOwner: 't1',
      },
    });
    expect(eventLog.replayAfter(roomId, 'p1').map((entry) => entry.payload.type)).toContain(MessageType.GameEnd);
    expect(JSON.stringify(eventLog.replayAfter(roomId, 'p1'))).not.toContain('"p2":[{"rank"');
    expect(published.length).toBeGreaterThan(0);
  });
});

async function completeHumanReturns({
  roomId,
  stateStore,
  tribute,
  tokens,
}: {
  roomId: string;
  stateStore: MemoryGameStateStore;
  tribute: ReturnType<typeof createTributeSelectHandler>;
  tokens: Record<PlayerId, string>;
}): Promise<void> {
  for (let index = 0; index < 4; index++) {
    const state = await requireState(stateStore.get(roomId));
    if (state.phase !== 'return-pending') return;
    const nextReturn = state.exchanges.find((exchange) => !state.selectedReturns[exchange.to]);
    if (!nextReturn) return;
    const card = autoPickReturnCard(state.hands[nextReturn.to] ?? [], {
      returnCardCap: DEFAULT_ROOM_RULES.returnCardCap,
    });
    const response = await tribute(jsonRequest('https://gdo.ax0x.ai/api/tribute/select', {
      roomId,
      playerId: nextReturn.to,
      token: tokens[nextReturn.to],
      card,
    }));
    expect(response.status).toBe(200);
  }
}

function t1DoubleOutState(source: GameState): PlayingState {
  if (source.phase !== 'playing') throw new Error(`ERR_EXPECTED_PLAYING_${source.phase}`);
  return {
    phase: 'playing',
    mode: '4',
    levelRank: source.levelRank,
    players: source.players.map(clonePlayer),
    hands: {
      p1: [],
      p2: [c('4')],
      p3: [c('3')],
      p4: [c('5')],
    },
    undealt: [],
    finished: [{ playerId: 'p1', position: 1, team: 't1' }],
    currentTurn: 'p3',
    currentTrick: { leader: 'p3', passes: [] },
    ...(source.progression ? { progression: { ...source.progression, levels: { ...source.progression.levels }, aFails: { ...source.progression.aFails } } } : {}),
    version: source.version + 1,
  };
}

function t1HumanSecondState(source: GameState): PlayingState {
  if (source.phase !== 'playing') throw new Error(`ERR_EXPECTED_PLAYING_${source.phase}`);
  return {
    phase: 'playing',
    mode: '4',
    levelRank: source.levelRank,
    players: source.players.map(clonePlayer),
    hands: {
      p1: [c('3')],
      p2: [c('4')],
      p3: [],
      p4: [c('5')],
    },
    undealt: [],
    finished: [{ playerId: 'p3', position: 1, team: 't1' }],
    currentTurn: 'p1',
    currentTrick: { leader: 'p1', passes: [] },
    ...(source.progression ? { progression: { ...source.progression, levels: { ...source.progression.levels }, aFails: { ...source.progression.aFails } } } : {}),
    version: source.version + 1,
  };
}

function t1EightPlayerSweepState(source: GameState): PlayingState {
  if (source.phase !== 'playing') throw new Error(`ERR_EXPECTED_PLAYING_${source.phase}`);
  return {
    phase: 'playing',
    mode: '8',
    levelRank: source.levelRank,
    players: source.players.map(clonePlayer),
    hands: {
      p1: [c('3')],
      p2: [c('4')],
      p3: [],
      p4: [c('5')],
      p5: [],
      p6: [c('6')],
      p7: [],
      p8: [c('7')],
    },
    undealt: [],
    finished: [
      { playerId: 'p3', position: 1, team: 't1' },
      { playerId: 'p5', position: 2, team: 't1' },
      { playerId: 'p7', position: 3, team: 't1' },
    ],
    currentTurn: 'p1',
    currentTrick: { leader: 'p1', passes: [] },
    ...(source.progression ? { progression: { ...source.progression, levels: { ...source.progression.levels }, aFails: { ...source.progression.aFails } } } : {}),
    version: source.version + 1,
  };
}

async function requireState(state: GameState | undefined | Promise<GameState | undefined>): Promise<GameState> {
  const resolved = await state;
  if (!resolved) throw new Error('ERR_STATE_NOT_FOUND');
  return resolved;
}

function clonePlayer(player: Player): Player {
  return { ...player };
}

function plainDeck(mode: '4' | '6' | '8' = '4'): Card[] {
  const ranks: Rank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  return Array.from({ length: Number(mode) * 27 }, (_, index) => c(ranks[index % ranks.length]!, 'spades', index + 1));
}
