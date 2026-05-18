import { describe, expect, test } from 'vitest';
import type { Card, Rank, Suit } from '../../lib/game/cards';
import type { Placement, Player } from '../../lib/game/state';
import {
  applyTributeExchange,
  autoPickReturnCard,
  autoPickTributeCard,
  checkAntiTribute,
  computeTributePlan,
  validatePlayerReturnCard,
  validatePlayerTributeCard,
} from '../../lib/game/tribute';

function c(rank: Rank, suit: Suit = 'spades', deck = 1): Card {
  return { rank, suit, deck: deck as 1 | 2 };
}

function player(id: string, team: Player['team']): Player {
  return { id, team, seat: 'east' };
}

function placement(playerId: string, position: number, team: Player['team']): Placement {
  return { playerId, position, team };
}

describe('tribute planning', () => {
  test('can be disabled and rejects malformed placement input', () => {
    expect(
      computeTributePlan({
        mode: '4',
        teamStructure: '2-teams-of-n',
        tributeEnabled: false,
        placements: [placement('p1', 1, 't1')],
      }),
    ).toMatchObject({ kind: 'none', obligations: [] });

    expect(() => computeTributePlan({ mode: '4', teamStructure: '2-teams-of-n', placements: [] })).toThrow('ERR_NO_PLACEMENTS');
    expect(() => computeTributePlan({
      mode: '4',
      teamStructure: '2-teams-of-n',
      placements: [placement('p1', 1, 't1')],
    })).toThrow('ERR_INVALID_TRIBUTE_POSITIONS');
  });

  test('4P single tribute maps last place to first place', () => {
    expect(
      computeTributePlan({
        mode: '4',
        teamStructure: '2-teams-of-n',
        placements: [
          placement('p1', 1, 't1'),
          placement('p2', 2, 't2'),
          placement('p3', 3, 't1'),
          placement('p4', 4, 't2'),
        ],
      }),
    ).toMatchObject({
      kind: 'single',
      obligations: [{ from: 'p4', to: 'p1', fromPosition: 4, toPosition: 1 }],
      firstPlacePlayerId: 'p1',
    });
  });

  test('4P double tribute covers both losing players when winners finish 1-2', () => {
    const plan = computeTributePlan({
      mode: '4',
      teamStructure: '2-teams-of-n',
      placements: [
        placement('p1', 1, 't1'),
        placement('p3', 2, 't1'),
        placement('p2', 3, 't2'),
        placement('p4', 4, 't2'),
      ],
    });

    expect(plan.kind).toBe('double');
    expect(plan.obligations.map(({ from, to }) => `${from}->${to}`)).toEqual(['p2->p3', 'p4->p1']);
  });

  test('6P normal Path A uses single last-to-first tribute when top finishers are mixed', () => {
    expect(
      computeTributePlan({
        mode: '6',
        teamStructure: '2-teams-of-n',
        placements: [
          placement('p1', 1, 't1'),
          placement('p2', 2, 't2'),
          placement('p3', 3, 't1'),
          placement('p4', 4, 't2'),
          placement('p5', 5, 't1'),
          placement('p6', 6, 't2'),
        ],
      }),
    ).toMatchObject({
      kind: 'single',
      obligations: [{ from: 'p6', to: 'p1' }],
    });
  });

  test('6P sweep Path B creates rank-order 4->3, 5->2, 6->1 pairings only in 2-team mode', () => {
    const placements = [
      placement('p1', 1, 't1'),
      placement('p3', 2, 't1'),
      placement('p5', 3, 't1'),
      placement('p2', 4, 't2'),
      placement('p4', 5, 't2'),
      placement('p6', 6, 't2'),
    ];

    expect(computeTributePlan({ mode: '6', teamStructure: '2-teams-of-n', placements }).obligations.map(({ from, to }) => `${from}->${to}`)).toEqual([
      'p2->p5',
      'p4->p3',
      'p6->p1',
    ]);
    expect(computeTributePlan({ mode: '6', teamStructure: 'teams-of-2', placements }).obligations.map(({ from, to }) => `${from}->${to}`)).toEqual([
      'p6->p1',
    ]);
  });

  test('8P sweep Path B creates rank-order 5->4, 6->3, 7->2, 8->1 pairings', () => {
    const plan = computeTributePlan({
      mode: '8',
      teamStructure: '2-teams-of-n',
      placements: [
        placement('p1', 1, 't1'),
        placement('p3', 2, 't1'),
        placement('p5', 3, 't1'),
        placement('p7', 4, 't1'),
        placement('p2', 5, 't2'),
        placement('p4', 6, 't2'),
        placement('p6', 7, 't2'),
        placement('p8', 8, 't2'),
      ],
    });

    expect(plan.kind).toBe('sweep');
    expect(plan.obligations.map(({ from, to }) => `${from}->${to}`)).toEqual([
      'p2->p7',
      'p4->p5',
      'p6->p3',
      'p8->p1',
    ]);
  });
});

describe('tribute card rules', () => {
  test('anti-tribute checks dual red jokers by default and supports casual any-joker variant', () => {
    expect(checkAntiTribute([[c('RJ', 'joker', 1), c('RJ', 'joker', 2)]], 'dual_big_joker')).toMatchObject({
      triggered: true,
      declaredByIndexes: [0],
    });
    expect(checkAntiTribute([[c('RJ', 'joker'), c('BJ', 'joker')]], 'dual_big_joker').triggered).toBe(false);
    expect(checkAntiTribute([[c('RJ', 'joker'), c('BJ', 'joker')]], 'any_dual_joker').triggered).toBe(true);
    expect(checkAntiTribute([[c('RJ', 'joker', 1), c('RJ', 'joker', 2)]], 'disabled').triggered).toBe(false);
  });

  test('auto-picks highest non-exempt tribute card with deterministic suit tiebreak', () => {
    const hand = [c('5', 'hearts'), c('A', 'diamonds'), c('A', 'clubs'), c('RJ', 'joker')];

    expect(autoPickTributeCard(hand, '5')).toEqual(c('RJ', 'joker'));
    expect(autoPickTributeCard([c('5', 'hearts'), c('A', 'diamonds'), c('A', 'clubs')], '5')).toEqual(c('A', 'clubs'));
    expect(() => autoPickTributeCard([c('5', 'hearts')], '5')).toThrow('ERR_NO_TRIBUTE_CARD');
  });

  test('validates player-picked tribute cards against the highest non-exempt rank', () => {
    const hand = [c('5', 'hearts'), c('A', 'diamonds'), c('A', 'clubs'), c('K')];

    expect(validatePlayerTributeCard(c('A', 'diamonds'), hand, '5')).toBe(true);
    expect(validatePlayerTributeCard(c('K'), hand, '5')).toBe(false);
    expect(validatePlayerTributeCard(c('5', 'hearts'), hand, '5')).toBe(false);
  });

  test('auto-picks and validates return cards under the rank-10 cap', () => {
    expect(autoPickReturnCard([c('J'), c('9'), c('3')], { returnCardCap: 'rank_10' })).toEqual(c('3'));
    expect(autoPickReturnCard([c('J'), c('Q'), c('K')], { returnCardCap: 'rank_10' })).toEqual(c('J'));
    expect(autoPickReturnCard([c('J'), c('10')], { returnCardCap: 'rank_jack' })).toEqual(c('10'));
    expect(autoPickReturnCard([c('RJ', 'joker'), c('BJ', 'joker')], { returnCardCap: 'none' })).toEqual(c('BJ', 'joker'));
    expect(() => autoPickReturnCard([], { returnCardCap: 'rank_10' })).toThrow('ERR_NO_RETURN_CARD');
    expect(validatePlayerReturnCard(c('10'), [c('10'), c('Q')], { returnCardCap: 'rank_10' })).toBe(true);
    expect(validatePlayerReturnCard(c('J'), [c('J'), c('10')], { returnCardCap: 'rank_10' })).toBe(false);
    expect(validatePlayerReturnCard(c('J'), [c('J'), c('Q')], { returnCardCap: 'rank_10' })).toBe(true);
    expect(validatePlayerReturnCard(c('K'), [c('J'), c('Q')], { returnCardCap: 'rank_10' })).toBe(false);
  });

  test('applies tribute and return cards while preserving hand counts', () => {
    const hands = {
      loser: [c('A'), c('4')],
      winner: [c('3'), c('K')],
    };

    const result = applyTributeExchange(hands, {
      from: 'loser',
      to: 'winner',
      tributeCard: c('A'),
      returnCard: c('3'),
    });

    expect(result.loser).toEqual([c('4'), c('3')]);
    expect(result.winner).toEqual([c('K'), c('A')]);
  });

  test('rejects impossible tribute exchanges', () => {
    expect(() => applyTributeExchange({}, { from: 'loser', to: 'winner', tributeCard: c('A'), returnCard: c('3') })).toThrow('ERR_UNKNOWN_PLAYER');
    expect(() => applyTributeExchange({ loser: [c('4')], winner: [c('3')] }, {
      from: 'loser',
      to: 'winner',
      tributeCard: c('A'),
      returnCard: c('3'),
    })).toThrow('ERR_TRIBUTE_CARD_NOT_IN_HAND');
    expect(() => applyTributeExchange({ loser: [c('A')], winner: [c('4')] }, {
      from: 'loser',
      to: 'winner',
      tributeCard: c('A'),
      returnCard: c('3'),
    })).toThrow('ERR_RETURN_CARD_NOT_IN_HAND');
  });
});
