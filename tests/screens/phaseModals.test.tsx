// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { cardKey, type Card } from '../../lib/game/cards';
import type {
  ExchangeSelectPendingState,
  ExchangeVotePendingState,
  Player,
  ReturnPendingState,
  TributePendingState,
} from '../../lib/game/state';
import { ExchangeSelectModal } from '../../src/screens/ExchangeSelectModal';
import { ExchangeVoteModal } from '../../src/screens/ExchangeVoteModal';
import { TributeModal } from '../../src/screens/TributeModal';

function c(rank: Card['rank'], suit: Card['suit'] = 'spades', deck: Card['deck'] = 1): Card {
  return { rank, suit, deck };
}

const players8: Player[] = [
  { id: 'p1', seat: 'seat1', team: 't1', displayName: '@阿祥' },
  { id: 'p2', seat: 'seat2', team: 't1', displayName: '@泉酱' },
  { id: 'p3', seat: 'seat3', team: 't1', displayName: '@小武' },
  { id: 'p4', seat: 'seat4', team: 't1', displayName: '@小雨' },
  { id: 'p5', seat: 'seat5', team: 't2', displayName: '@饭团' },
  { id: 'p6', seat: 'seat6', team: 't2', displayName: '@小李' },
  { id: 'p7', seat: 'seat7', team: 't2', displayName: '@王王' },
  { id: 'p8', seat: 'seat8', team: 't2', displayName: '@毛毛' },
];

function hands(players: Player[]): Record<string, Card[]> {
  return Object.fromEntries(players.map((player) => [player.id, [c('A'), c('5', 'hearts'), c('3', 'clubs')]]));
}

describe('phase modals', () => {
  test('renders normal 6/8P tribute as a single last-to-first obligation', () => {
    const onToggle = vi.fn();
    const state: TributePendingState = {
      phase: 'tribute-pending',
      mode: '8',
      levelRank: '5',
      players: players8,
      hands: hands(players8),
      undealt: [],
      obligations: [{ from: 'p8', to: 'p1', fromPosition: 8, toPosition: 1 }],
      selectedTributes: {},
      firstLeader: 'p1',
      deadlineAt: '2026-05-18T00:00:15.000Z',
      version: 1,
    };

    render(<TributeModal state={state} currentPlayerId="p8" selectedCardKeys={new Set()} onToggleCard={onToggle} onConfirm={vi.fn()} />);

    expect(screen.getByLabelText('Tribute phase')).toBeInTheDocument();
    expect(screen.getByText('@毛毛')).toBeInTheDocument();
    expect(screen.getByText('@阿祥')).toBeInTheDocument();
    expect(screen.getByText('8 → 1')).toBeInTheDocument();
    expect(screen.getByText('仅末游单笔进贡头游')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('A of spades'));
    expect(onToggle).toHaveBeenCalledWith(c('A'));
  });

  test('renders 6/8P sweep tribute as rank-paired obligations', () => {
    const state: TributePendingState = {
      phase: 'tribute-pending',
      mode: '8',
      levelRank: '5',
      players: players8,
      hands: hands(players8),
      undealt: [],
      obligations: [
        { from: 'p5', to: 'p4', fromPosition: 5, toPosition: 4 },
        { from: 'p6', to: 'p3', fromPosition: 6, toPosition: 3 },
        { from: 'p7', to: 'p2', fromPosition: 7, toPosition: 2 },
        { from: 'p8', to: 'p1', fromPosition: 8, toPosition: 1 },
      ],
      selectedTributes: {},
      firstLeader: 'p1',
      deadlineAt: '2026-05-18T00:00:15.000Z',
      version: 1,
    };

    render(<TributeModal state={state} currentPlayerId="p8" selectedCardKeys={new Set()} onToggleCard={vi.fn()} onConfirm={vi.fn()} />);

    expect(screen.getByText('一队全胜 · 按名次进贡')).toBeInTheDocument();
    for (const pair of ['5 → 4', '6 → 3', '7 → 2', '8 → 1']) {
      expect(screen.getByText(pair)).toBeInTheDocument();
    }
  });

  test('renders return tribute with received card and return-card cap', () => {
    const selected = c('3', 'clubs');
    const state: ReturnPendingState = {
      phase: 'return-pending',
      mode: '8',
      levelRank: '5',
      players: players8,
      hands: { ...hands(players8), p1: [selected, c('K')] },
      undealt: [],
      exchanges: [{ from: 'p8', to: 'p1', tributeCard: c('A') }],
      selectedReturns: {},
      firstLeader: 'p1',
      deadlineAt: '2026-05-18T00:00:15.000Z',
      version: 2,
    };

    render(
      <TributeModal
        state={state}
        currentPlayerId="p1"
        selectedCardKeys={new Set([cardKey(selected)])}
        onToggleCard={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText('还贡阶段')).toBeInTheDocument();
    expect(screen.getByText('收到 @毛毛 的进贡')).toBeInTheDocument();
    expect(screen.getByText('还贡 ≤10')).toBeInTheDocument();
    expect(screen.getByLabelText('A of spades')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认还贡' })).toBeEnabled();
  });

  test('renders return tribute as waiting for players who do not owe a return', () => {
    const state: ReturnPendingState = {
      phase: 'return-pending',
      mode: '8',
      levelRank: '5',
      players: players8,
      hands: hands(players8),
      undealt: [],
      exchanges: [{ from: 'p8', to: 'p1', tributeCard: c('A') }],
      selectedReturns: {},
      firstLeader: 'p1',
      deadlineAt: '2026-05-18T00:00:15.000Z',
      version: 2,
    };

    render(
      <TributeModal
        state={state}
        currentPlayerId="p2"
        selectedCardKeys={new Set([cardKey(c('3', 'clubs'))])}
        onToggleCard={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText('还贡阶段')).toBeInTheDocument();
    expect(screen.getByText('等待还贡玩家选择')).toBeInTheDocument();
    expect(screen.queryByLabelText('Return hand')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '确认还贡' })).not.toBeInTheDocument();
  });

  test('renders exchange vote tally and voter-only actions', () => {
    const onVote = vi.fn();
    const state: ExchangeVotePendingState = {
      phase: 'exchange-vote-pending',
      mode: '8',
      levelRank: '5',
      players: players8,
      hands: hands(players8),
      undealt: [],
      eligibleVoters: ['p5', 'p6', 'p7', 'p8'],
      votes: { p5: 'yes', p6: 'yes', p7: 'no', p8: 'yes' },
      firstLeader: 'p1',
      deadlineAt: '2026-05-18T00:00:15.000Z',
      version: 3,
    };

    render(<ExchangeVoteModal state={state} currentPlayerId="p8" onVote={onVote} />);

    expect(screen.getByLabelText('Exchange vote')).toBeInTheDocument();
    expect(screen.getByText('3 / 4 投了换牌')).toBeInTheDocument();
    expect(screen.getByText('需要 3')).toBeInTheDocument();
    expect(screen.getByText('@饭团')).toBeInTheDocument();
    expect(screen.getByText('✗')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '同意换牌' }));
    expect(onVote).toHaveBeenCalledWith('yes');
  });

  test('renders exchange selection direction, neighbor pairing, and card count', () => {
    const onToggle = vi.fn();
    const state: ExchangeSelectPendingState = {
      phase: 'exchange-select-pending',
      mode: '4',
      levelRank: '5',
      players: players8.slice(0, 4),
      hands: hands(players8.slice(0, 4)),
      undealt: [],
      direction: 'clockwise',
      cardCount: 3,
      selections: {},
      firstLeader: 'p1',
      deadlineAt: '2026-05-18T00:00:15.000Z',
      version: 4,
    };

    render(
      <ExchangeSelectModal
        state={state}
        currentPlayerId="p1"
        selectedCards={[c('A'), c('5', 'hearts')]}
        onToggleCard={onToggle}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Exchange selection')).toBeInTheDocument();
    expect(screen.getByText('顺时针')).toBeInTheDocument();
    expect(screen.getByText('传给 @泉酱')).toBeInTheDocument();
    expect(screen.getByText('已选 2 / 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认换牌' })).toBeDisabled();

    fireEvent.click(screen.getByLabelText('A of spades'));
    expect(onToggle).toHaveBeenCalledWith(c('A'));
  });
});
