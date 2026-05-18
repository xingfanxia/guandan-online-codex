import type { Card, LevelRank } from '../../lib/game/cards';
import { CardView } from './Card';

export interface TrickProps {
  playerDisplayName: string;
  patternLabel: string;
  cards: Card[];
  levelRank: LevelRank;
}

export function Trick({
  playerDisplayName,
  patternLabel,
  cards,
  levelRank,
}: TrickProps): React.ReactElement {
  return (
    <section className="gdo-trick" aria-label="Current trick">
      <div className="gdo-trick__meta">
        <span className="gdo-trick__player">{playerDisplayName}</span>
        <span className="gdo-trick__pattern">{patternLabel}</span>
      </div>
      <div className="gdo-played-stack">
        {cards.map((card, index) => (
          <CardView key={`${card.deck}:${card.suit}:${card.rank}:${index}`} card={card} levelRank={levelRank} size="md" />
        ))}
      </div>
    </section>
  );
}
