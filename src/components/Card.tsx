import { cardKey, isHeartLevelWildcard, type Card, type LevelRank } from '../../lib/game/cards';

export type CardSize = 'sm' | 'md' | 'lg';

export interface CardViewProps {
  card: Card;
  levelRank: LevelRank;
  size?: CardSize;
  selected?: boolean;
  faceDown?: boolean;
  onToggle?: (card: Card) => void;
}

const SUIT_SYMBOLS: Record<Card['suit'], string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
  joker: '★',
};

export function CardView({
  card,
  levelRank,
  size = 'sm',
  selected = false,
  faceDown = false,
  onToggle,
}: CardViewProps): React.ReactElement {
  const wildcard = !faceDown && isHeartLevelWildcard(card, levelRank);
  const red = card.suit === 'hearts' || card.suit === 'diamonds' || card.rank === 'RJ';
  const className = [
    'gdo-card',
    `gdo-card--${size}`,
    red ? 'gdo-card--red' : '',
    selected ? 'gdo-card--lifted' : '',
    wildcard ? 'gdo-card--wild' : '',
    faceDown ? 'gdo-card--back' : '',
  ].filter(Boolean).join(' ');
  const label = faceDown
    ? 'Face-down card'
    : `${card.rank} of ${card.suit}${wildcard ? ', wildcard' : ''}`;

  const contents = faceDown ? null : (
    <>
      <span className="gdo-card__rank">{card.rank}</span>
      <span className="gdo-card__suit" aria-hidden="true">{SUIT_SYMBOLS[card.suit]}</span>
      <span className="gdo-card__center" aria-hidden="true">{SUIT_SYMBOLS[card.suit]}</span>
    </>
  );

  if (onToggle) {
    return (
      <button
        type="button"
        className={className}
        aria-label={label}
        aria-pressed={selected}
        data-card-key={cardKey(card)}
        onClick={() => onToggle({ ...card })}
      >
        {contents}
      </button>
    );
  }

  return (
    <div className={className} aria-label={label} data-card-key={cardKey(card)}>
      {contents}
    </div>
  );
}
