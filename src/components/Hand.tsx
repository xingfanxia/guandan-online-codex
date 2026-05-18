import { cardKey, type Card, type LevelRank } from '../../lib/game/cards';
import { CardView } from './Card';

export interface HandProps {
  cards: Card[];
  levelRank: LevelRank;
  selectedKeys?: ReadonlySet<string>;
  onToggle?: (card: Card) => void;
}

export function Hand({
  cards,
  levelRank,
  selectedKeys = new Set<string>(),
  onToggle,
}: HandProps): React.ReactElement {
  return (
    <div className="gdo-hand" aria-label="Your hand">
      {cards.map((card) => (
        <CardView
          key={cardKey(card)}
          card={card}
          levelRank={levelRank}
          selected={selectedKeys.has(cardKey(card))}
          {...(onToggle ? { onToggle } : {})}
        />
      ))}
    </div>
  );
}
