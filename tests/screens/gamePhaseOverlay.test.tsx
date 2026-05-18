// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { Card } from '../../lib/game/cards';
import type { ClientStateView } from '../../lib/realtime/payload';
import { GamePhaseOverlay } from '../../src/screens/GamePhaseOverlay';

function c(rank: Card['rank'], suit: Card['suit'] = 'spades'): Card {
  return { rank, suit, deck: 1 };
}

const baseView = {
  mode: '8',
  levelRank: '5',
  version: 7,
  players: [
    { id: 'p1', seat: 'seat1', team: 't1', displayName: '@阿祥' },
    { id: 'p8', seat: 'seat8', team: 't2', displayName: '@毛毛' },
  ],
} satisfies Pick<ClientStateView, 'mode' | 'levelRank' | 'version' | 'players'>;

describe('GamePhaseOverlay', () => {
  test('maps filtered tribute client view into the tribute modal with only self hand', () => {
    const onToggle = vi.fn();
    const view: ClientStateView = {
      ...baseView,
      phase: 'tribute-pending',
      handCounts: { p1: 3, p8: 3 },
      self: { playerId: 'p8', hand: [c('A'), c('5', 'hearts')] },
      tribute: {
        obligations: [{ from: 'p8', to: 'p1', fromPosition: 8, toPosition: 1 }],
        deadlineAt: '2026-05-18T00:00:15.000Z',
      },
    };

    render(
      <GamePhaseOverlay
        view={view}
        currentPlayerId="p8"
        selectedCardKeys={new Set()}
        selectedExchangeCards={[]}
        onTributeCardToggle={onToggle}
        onTributeConfirm={vi.fn()}
        onReturnCardToggle={vi.fn()}
        onReturnConfirm={vi.fn()}
        onExchangeVote={vi.fn()}
        onExchangeCardToggle={vi.fn()}
        onExchangeConfirm={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Tribute phase')).toBeInTheDocument();
    expect(screen.getByText('8 → 1')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('A of spades'));
    expect(onToggle).toHaveBeenCalledWith(c('A'));
  });

  test('maps exchange vote client view into voter actions', () => {
    const onVote = vi.fn();
    const view: ClientStateView = {
      ...baseView,
      phase: 'exchange-vote-pending',
      handCounts: { p1: 3, p8: 3 },
      self: { playerId: 'p8', hand: [c('A')] },
      exchange: {
        eligibleVoters: ['p8'],
        votes: {},
        deadlineAt: '2026-05-18T00:00:15.000Z',
      },
    };

    render(
      <GamePhaseOverlay
        view={view}
        currentPlayerId="p8"
        selectedCardKeys={new Set()}
        selectedExchangeCards={[]}
        onTributeCardToggle={vi.fn()}
        onTributeConfirm={vi.fn()}
        onReturnCardToggle={vi.fn()}
        onReturnConfirm={vi.fn()}
        onExchangeVote={onVote}
        onExchangeCardToggle={vi.fn()}
        onExchangeConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '同意换牌' }));
    expect(onVote).toHaveBeenCalledWith('yes');
  });

  test('returns no overlay for normal playing view', () => {
    const view: ClientStateView = {
      ...baseView,
      phase: 'playing',
      currentTurn: 'p1',
      handCounts: { p1: 3, p8: 3 },
      self: { playerId: 'p8', hand: [c('A')] },
      currentTrick: { leader: 'p1', passes: [] },
      finished: [],
    };

    const { container } = render(
      <GamePhaseOverlay
        view={view}
        currentPlayerId="p8"
        selectedCardKeys={new Set()}
        selectedExchangeCards={[]}
        onTributeCardToggle={vi.fn()}
        onTributeConfirm={vi.fn()}
        onReturnCardToggle={vi.fn()}
        onReturnConfirm={vi.fn()}
        onExchangeVote={vi.fn()}
        onExchangeCardToggle={vi.fn()}
        onExchangeConfirm={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
