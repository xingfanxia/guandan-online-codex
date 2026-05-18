// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { CardView } from '../../src/components/Card';
import type { Card } from '../../lib/game/cards';

function c(rank: Card['rank'], suit: Card['suit'] = 'spades', deck = 1): Card {
  return { rank, suit, deck: deck as 1 | 2 };
}

describe('CardView', () => {
  test('renders rank and suit with an accessible card label', () => {
    render(<CardView card={c('10', 'hearts')} levelRank="2" />);

    expect(screen.getByLabelText('10 of hearts')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getAllByText('♥')).toHaveLength(2);
  });

  test('marks current-level hearts as wildcards', () => {
    render(<CardView card={c('5', 'hearts')} levelRank="5" />);

    expect(screen.getByLabelText('5 of hearts, wildcard')).toHaveClass('gdo-card--wild');
  });

  test('renders card backs without leaking face text', () => {
    render(<CardView card={c('A', 'spades')} levelRank="2" faceDown />);

    expect(screen.getByLabelText('Face-down card')).toHaveClass('gdo-card--back');
    expect(screen.queryByText('A')).not.toBeInTheDocument();
  });
});
