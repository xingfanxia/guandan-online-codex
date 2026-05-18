import { describe, expect, test } from 'vitest';
import type { Card, Rank, Suit } from '../../lib/game/cards';
import type { RoundEndState } from '../../lib/game/state';
import { startNextRoundFlow } from '../../lib/game/roundFlow';
import { DEFAULT_ROOM_RULES } from '../../lib/room/rules';

function c(rank: Rank, suit: Suit = 'spades', deck = 1): Card {
  return { rank, suit, deck: deck as 1 | 2 };
}

function deck(cards: Card[]): Card[] {
  return cards;
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
      deck: deck([c('A'), c('2'), c('3'), c('4'), c('5'), c('6')]),
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
});
