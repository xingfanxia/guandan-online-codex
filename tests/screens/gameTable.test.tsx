// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { Card } from '../../lib/game/cards';
import type { ClientStateView } from '../../lib/realtime/payload';
import { GameTableScreen } from '../../src/screens/GameTable';

function c(rank: Card['rank'], suit: Card['suit'] = 'spades', deck: Card['deck'] = 1): Card {
  return { rank, suit, deck };
}

function playingView(overrides: Partial<ClientStateView> = {}): ClientStateView {
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
    handCounts: { p1: 3, p2: 12, p3: 8, p4: 10 },
    self: { playerId: 'p1', hand: [c('3'), c('5', 'hearts'), c('A', 'diamonds')] },
    currentTrick: {
      leader: 'p2',
      currentPlay: { playerId: 'p2', cards: [c('A', 'spades')], kind: 'single' },
      passes: ['p4'],
    },
    finished: [],
    ...overrides,
  };
}

describe('GameTableScreen', () => {
  test('renders the filtered live view instead of static demo values', () => {
    const view = playingView();
    view.players[1] = {
      ...view.players[1]!,
      kind: 'bot',
      botDifficulty: 'medium',
      connectionStatus: 'bot-takeover',
    };

    render(
      <GameTableScreen
        roomCode="LIVE77"
        view={view}
        currentPlayerId="p1"
        selectedCardKeys={new Set()}
        selectedExchangeCards={[]}
        onToggleCard={vi.fn()}
        onPlaySelected={vi.fn()}
        onPass={vi.fn()}
        onTributeCardToggle={vi.fn()}
        onTributeConfirm={vi.fn()}
        onReturnCardToggle={vi.fn()}
        onReturnConfirm={vi.fn()}
        onExchangeVote={vi.fn()}
        onExchangeCardToggle={vi.fn()}
        onExchangeConfirm={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Guandan table')).toBeInTheDocument();
    expect(screen.getByText('LIVE77')).toBeInTheDocument();
    expect(screen.getByText('打 5')).toBeInTheDocument();
    expect(screen.getByText('v9')).toBeInTheDocument();
    expect(screen.getAllByText('@momo')).toHaveLength(2);
    expect(screen.getByText('12 张')).toBeInTheDocument();
    expect(screen.getByLabelText('p2 bot takeover')).toHaveTextContent('代打');
    expect(screen.getByText('@doudou')).toBeInTheDocument();
    expect(screen.getByText('8 张')).toBeInTheDocument();
    expect(screen.getByText('single')).toBeInTheDocument();
    expect(screen.getByLabelText('A of spades')).toBeInTheDocument();
    expect(screen.getByLabelText('3 of spades')).toBeInTheDocument();
  });

  test('submits selected cards and pass commands from the live hand', () => {
    const onToggle = vi.fn();
    const onPlay = vi.fn();
    const onPass = vi.fn();
    const onSort = vi.fn();
    const onSuggest = vi.fn();
    render(
      <GameTableScreen
        roomCode="LIVE77"
        view={playingView({ currentTurn: 'p1' })}
        currentPlayerId="p1"
        selectedCardKeys={new Set(['1:spades:3'])}
        selectedExchangeCards={[]}
        onToggleCard={onToggle}
        onPlaySelected={onPlay}
        onPass={onPass}
        onSortHand={onSort}
        onSuggestMove={onSuggest}
        onTributeCardToggle={vi.fn()}
        onTributeConfirm={vi.fn()}
        onReturnCardToggle={vi.fn()}
        onReturnConfirm={vi.fn()}
        onExchangeVote={vi.fn()}
        onExchangeCardToggle={vi.fn()}
        onExchangeConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('A of diamonds'));
    fireEvent.click(screen.getByRole('button', { name: '理牌' }));
    fireEvent.click(screen.getByRole('button', { name: '提示' }));
    fireEvent.click(screen.getByRole('button', { name: '出牌 · 1 张' }));
    fireEvent.click(screen.getByRole('button', { name: '不要' }));

    expect(onToggle).toHaveBeenCalledWith(c('A', 'diamonds'));
    expect(onSort).toHaveBeenCalledTimes(1);
    expect(onSuggest).toHaveBeenCalledTimes(1);
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPass).toHaveBeenCalledTimes(1);
  });

  test('disables play actions while another player is active', () => {
    const onPlay = vi.fn();
    const onPass = vi.fn();
    const onSuggest = vi.fn();

    render(
      <GameTableScreen
        roomCode="LIVE77"
        view={playingView({ currentTurn: 'p2' })}
        currentPlayerId="p1"
        selectedCardKeys={new Set(['1:spades:3'])}
        selectedExchangeCards={[]}
        onToggleCard={vi.fn()}
        onPlaySelected={onPlay}
        onPass={onPass}
        onSuggestMove={onSuggest}
        onTributeCardToggle={vi.fn()}
        onTributeConfirm={vi.fn()}
        onReturnCardToggle={vi.fn()}
        onReturnConfirm={vi.fn()}
        onExchangeVote={vi.fn()}
        onExchangeCardToggle={vi.fn()}
        onExchangeConfirm={vi.fn()}
      />,
    );

    const suggest = screen.getByRole('button', { name: '提示' });
    const pass = screen.getByRole('button', { name: '不要' });
    const play = screen.getByRole('button', { name: '出牌 · 1 张' });

    expect(suggest).toBeDisabled();
    expect(pass).toBeDisabled();
    expect(play).toBeDisabled();

    fireEvent.click(suggest);
    fireEvent.click(pass);
    fireEvent.click(play);

    expect(onSuggest).not.toHaveBeenCalled();
    expect(onPass).not.toHaveBeenCalled();
    expect(onPlay).not.toHaveBeenCalled();
  });

  test('renders phase overlays from the filtered live view', () => {
    const view: ClientStateView = {
      ...playingView(),
      phase: 'exchange-vote-pending',
      exchange: {
        eligibleVoters: ['p1', 'p2'],
        votes: { p2: 'yes' },
        deadlineAt: '2026-05-18T00:00:15.000Z',
      },
    };

    render(
      <GameTableScreen
        roomCode="LIVE77"
        view={view}
        currentPlayerId="p1"
        selectedCardKeys={new Set()}
        selectedExchangeCards={[]}
        onToggleCard={vi.fn()}
        onPlaySelected={vi.fn()}
        onPass={vi.fn()}
        onTributeCardToggle={vi.fn()}
        onTributeConfirm={vi.fn()}
        onReturnCardToggle={vi.fn()}
        onReturnConfirm={vi.fn()}
        onExchangeVote={vi.fn()}
        onExchangeCardToggle={vi.fn()}
        onExchangeConfirm={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Exchange vote')).toBeInTheDocument();
    expect(screen.getByText('1 / 2 投了换牌')).toBeInTheDocument();
  });

  test('renders round-end placements and exposes the next-round command', () => {
    const onAdvance = vi.fn();
    const view: ClientStateView = {
      ...playingView(),
      phase: 'round-end',
      placements: [
        { playerId: 'p1', position: 1, team: 't1' },
        { playerId: 'p3', position: 2, team: 't1' },
        { playerId: 'p2', position: 3, team: 't2' },
        { playerId: 'p4', position: 4, team: 't2' },
      ],
    };

    render(
      <GameTableScreen
        roomCode="LIVE77"
        view={view}
        currentPlayerId="p1"
        selectedCardKeys={new Set()}
        selectedExchangeCards={[]}
        onToggleCard={vi.fn()}
        onPlaySelected={vi.fn()}
        onPass={vi.fn()}
        onAdvanceRound={onAdvance}
        onTributeCardToggle={vi.fn()}
        onTributeConfirm={vi.fn()}
        onReturnCardToggle={vi.fn()}
        onReturnConfirm={vi.fn()}
        onExchangeVote={vi.fn()}
        onExchangeCardToggle={vi.fn()}
        onExchangeConfirm={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Round end')).toBeInTheDocument();
    expect(screen.getByText('#1 @fufu')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一局' }));

    expect(onAdvance).toHaveBeenCalledTimes(1);
  });
});
