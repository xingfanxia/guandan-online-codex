import { describe, expect, test } from 'vitest';
import { type Card, type Rank, type Suit } from '../../lib/game/cards';
import type { GameMode } from '../../lib/game/mode';
import type { RoundEndState } from '../../lib/game/state';
import { startNextRoundFlow } from '../../lib/game/roundFlow';
import { DEFAULT_ROOM_RULES } from '../../lib/room/rules';

function c(rank: Rank, suit: Suit = 'spades', deck = 1): Card {
  return { rank, suit, deck };
}

function deck(cards: Card[], mode: GameMode = '4'): Card[] {
  const fillerRanks: Rank[] = ['8', '9', '10', 'J', 'Q', 'K'];
  const targetLength = Number(mode) * 27;
  return [
    ...cards,
    ...Array.from(
      { length: Math.max(0, targetLength - cards.length) },
      (_, index) => c(fillerRanks[index % fillerRanks.length]!, 'clubs', 1_000 + index),
    ),
  ];
}

function roundEnd(overrides: Partial<RoundEndState> = {}): RoundEndState {
  return {
    phase: 'round-end',
    mode: '4',
    levelRank: '5',
    players: [
      { id: 'p1', seat: 'east', team: 't1' },
      { id: 'p2', seat: 'south', team: 't2' },
      { id: 'p3', seat: 'west', team: 't1' },
      { id: 'p4', seat: 'north', team: 't2' },
    ],
    hands: {},
    undealt: [],
    placements: [
      { playerId: 'p1', position: 1, team: 't1' },
      { playerId: 'p3', position: 2, team: 't1' },
      { playerId: 'p2', position: 3, team: 't2' },
      { playerId: 'p4', position: 4, team: 't2' },
    ],
    winnerTeam: 't1',
    upgrade: 3,
    version: 9,
    ...overrides,
  };
}

describe('post-round flow', () => {
  test('deals the next hand and opens tribute-pending when tribute is required', () => {
    const result = startNextRoundFlow({
      roundEnd: roundEnd(),
      deck: deck([
        c('A'), c('2'), c('3'), c('4'),
        c('K'), c('5'), c('6'), c('7'),
      ]),
      rules: { ...DEFAULT_ROOM_RULES, exchangeCardCount: 2 },
      deadlineAt: '2026-05-18T00:00:15.000Z',
    });

    expect(result.state).toMatchObject({
      phase: 'tribute-pending',
      deadlineAt: '2026-05-18T00:00:15.000Z',
      obligations: [
        { from: 'p2', to: 'p3' },
        { from: 'p4', to: 'p1' },
      ],
      version: 10,
    });
    expect(result.events.map((event) => event.type)).toEqual(['tribute_pending', 'tribute_pending']);
  });

  test('opens exchange vote before tribute selection when exchange is enabled', () => {
    const result = startNextRoundFlow({
      roundEnd: roundEnd(),
      deck: deck([
        c('A'), c('2'), c('3'), c('4'),
        c('K'), c('5'), c('6'), c('7'),
      ]),
      rules: { ...DEFAULT_ROOM_RULES, cardExchange: true },
      deadlineAt: '2026-05-18T00:00:15.000Z',
      exchangeDeadlineAt: '2026-05-18T00:00:30.000Z',
    });

    expect(result.state).toMatchObject({
      phase: 'exchange-vote-pending',
      eligibleVoters: ['p2', 'p4'],
      pendingTribute: {
        obligations: [
          { from: 'p2', to: 'p3' },
          { from: 'p4', to: 'p1' },
        ],
        deadlineAt: '2026-05-18T00:00:15.000Z',
      },
      deadlineAt: '2026-05-18T00:00:30.000Z',
    });
    expect(result.events).toEqual([
      { type: 'exchange_vote_required', voterIds: ['p2', 'p4'], deadlineAt: '2026-05-18T00:00:30.000Z' },
    ]);
  });

  test('anti-tribute skips tribute and starts exchange vote when exchange is enabled', () => {
    const result = startNextRoundFlow({
      roundEnd: roundEnd(),
      deck: deck([
        c('3'), c('RJ', 'joker', 1), c('4'), c('RJ', 'joker', 2),
        c('5'), c('6'), c('7'), c('8'),
      ]),
      rules: { ...DEFAULT_ROOM_RULES, cardExchange: true },
      deadlineAt: '2026-05-18T00:00:15.000Z',
      exchangeDeadlineAt: '2026-05-18T00:00:30.000Z',
    });

    expect(result.events).toEqual([
      { type: 'anti_tribute', team: 't2', declaredBy: ['p2', 'p4'], firstLeader: 'p1' },
      { type: 'exchange_vote_required', voterIds: ['p2', 'p4'], deadlineAt: '2026-05-18T00:00:30.000Z' },
    ]);
    expect(result.state).toMatchObject({
      phase: 'exchange-vote-pending',
      eligibleVoters: ['p2', 'p4'],
      votes: {},
      deadlineAt: '2026-05-18T00:00:30.000Z',
    });
  });

  test('starts normal playing when tribute and exchange are disabled', () => {
    const result = startNextRoundFlow({
      roundEnd: roundEnd(),
      deck: deck([c('A'), c('2'), c('3'), c('4')]),
      rules: { ...DEFAULT_ROOM_RULES, tributeEnabled: false, cardExchange: false },
      deadlineAt: '2026-05-18T00:00:15.000Z',
    });

    expect(result.state).toMatchObject({
      phase: 'playing',
      currentTurn: 'p1',
      currentTrick: { leader: 'p1', passes: [] },
      version: 10,
    });
    expect(result.events).toEqual([]);
  });

  test('deals the next hand at the upgraded level after a round win', () => {
    const result = startNextRoundFlow({
      roundEnd: roundEnd({
        levelRank: '5',
        upgrade: 2,
        nextLevelRank: '7',
      }),
      deck: deck([c('A'), c('2'), c('3'), c('4')]),
      rules: { ...DEFAULT_ROOM_RULES, tributeEnabled: false, cardExchange: false },
      deadlineAt: '2026-05-18T00:00:15.000Z',
    });

    expect(result.state).toMatchObject({
      phase: 'playing',
      levelRank: '7',
    });
  });

  test('preserves level progression when the next hand starts directly', () => {
    const result = startNextRoundFlow({
      roundEnd: roundEnd({
        progression: {
          levels: { t1: '7', t2: '5' },
          aFails: { t1: 1, t2: 0 },
          roundOwner: 't1',
          strictA: true,
        },
      }),
      deck: deck([c('A'), c('2'), c('3'), c('4')]),
      rules: { ...DEFAULT_ROOM_RULES, tributeEnabled: false, cardExchange: false },
      deadlineAt: '2026-05-18T00:00:15.000Z',
    });

    expect(result.state).toMatchObject({
      phase: 'playing',
      progression: {
        levels: { t1: '7', t2: '5' },
        aFails: { t1: 1, t2: 0 },
        roundOwner: 't1',
        strictA: true,
      },
    });
  });

  test('6P sweep round opens multi-pair tribute pending', () => {
    const result = startNextRoundFlow({
      roundEnd: roundEnd({
        mode: '6',
        players: Array.from({ length: 6 }, (_, index) => ({
          id: `p${index + 1}`,
          seat: `seat${index + 1}` as const,
          team: index % 2 === 0 ? 't1' : 't2',
        })),
        placements: [
          { playerId: 'p1', position: 1, team: 't1' },
          { playerId: 'p3', position: 2, team: 't1' },
          { playerId: 'p5', position: 3, team: 't1' },
          { playerId: 'p2', position: 4, team: 't2' },
          { playerId: 'p4', position: 5, team: 't2' },
          { playerId: 'p6', position: 6, team: 't2' },
        ],
      }),
      deck: deck([c('A'), c('2'), c('3'), c('4'), c('5'), c('6')], '6'),
      rules: DEFAULT_ROOM_RULES,
      deadlineAt: '2026-05-18T00:00:15.000Z',
    });

    expect(result.state.phase).toBe('tribute-pending');
    expect(result.state.phase === 'tribute-pending' ? result.state.obligations.map(({ from, to }) => `${from}->${to}`) : []).toEqual([
      'p2->p5',
      'p4->p3',
      'p6->p1',
    ]);
  });

  test('6P teams-of-2 uses normal last-to-first tribute instead of sweep tribute', () => {
    const result = startNextRoundFlow({
      roundEnd: roundEnd({
        mode: '6',
        players: [
          { id: 'p1', seat: 'seat1', team: 't1' },
          { id: 'p2', seat: 'seat2', team: 't2' },
          { id: 'p3', seat: 'seat3', team: 't3' },
          { id: 'p4', seat: 'seat4', team: 't1' },
          { id: 'p5', seat: 'seat5', team: 't2' },
          { id: 'p6', seat: 'seat6', team: 't3' },
        ],
        placements: [
          { playerId: 'p1', position: 1, team: 't1' },
          { playerId: 'p4', position: 2, team: 't1' },
          { playerId: 'p2', position: 3, team: 't2' },
          { playerId: 'p5', position: 4, team: 't2' },
          { playerId: 'p3', position: 5, team: 't3' },
          { playerId: 'p6', position: 6, team: 't3' },
        ],
      }),
      deck: deck([c('A'), c('2'), c('3'), c('4'), c('5'), c('6')], '6'),
      rules: { ...DEFAULT_ROOM_RULES, teamStructure: 'teams-of-2' },
      deadlineAt: '2026-05-18T00:00:15.000Z',
    });

    expect(result.state.phase).toBe('tribute-pending');
    expect(result.state.phase === 'tribute-pending' ? result.state.obligations : []).toMatchObject([
      { from: 'p6', to: 'p1', fromPosition: 6, toPosition: 1 },
    ]);
  });
});
