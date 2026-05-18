// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { Hand } from '../../src/components/Hand';
import { Trick } from '../../src/components/Trick';
import type { Card } from '../../lib/game/cards';

function c(rank: Card['rank'], suit: Card['suit'] = 'spades', deck = 1): Card {
  return { rank, suit, deck: deck as 1 | 2 };
}

describe('Hand and Trick components', () => {
  test('renders selectable hand cards with stable selected state', () => {
    const onToggle = vi.fn();

    render(
      <Hand
        cards={[c('3'), c('4'), c('5', 'hearts')]}
        levelRank="5"
        selectedKeys={new Set(['1:spades:4'])}
        onToggle={onToggle}
      />,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    expect(screen.getByLabelText('4 of spades')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('4 of spades')).toHaveClass('gdo-card--lifted');

    fireEvent.click(screen.getByLabelText('3 of spades'));
    expect(onToggle).toHaveBeenCalledWith(c('3'));
  });

  test('renders trick metadata and played cards', () => {
    render(
      <Trick
        playerDisplayName="@fufu"
        patternLabel="单张"
        cards={[c('A', 'spades'), c('A', 'hearts')]}
        levelRank="2"
      />,
    );

    expect(screen.getByText('@fufu')).toBeInTheDocument();
    expect(screen.getByText('单张')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/A of/)).toHaveLength(2);
  });
});
