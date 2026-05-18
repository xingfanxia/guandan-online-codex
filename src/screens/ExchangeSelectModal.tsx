import { cardKey, type Card } from '../../lib/game/cards';
import type { ExchangeDirection } from '../../lib/game/exchange';
import type { ExchangeSelectPendingState, Player } from '../../lib/game/state';
import { CardView } from '../components/Card';

export interface ExchangeSelectModalProps {
  state: ExchangeSelectPendingState;
  currentPlayerId: string;
  selectedCards: readonly Card[];
  onToggleCard: (card: Card) => void;
  onConfirm: () => void;
}

export function ExchangeSelectModal({
  state,
  currentPlayerId,
  selectedCards,
  onToggleCard,
  onConfirm,
}: ExchangeSelectModalProps): React.ReactElement {
  const selectedKeys = new Set(selectedCards.map(cardKey));
  const hand = state.hands[currentPlayerId] ?? [];
  const recipient = exchangeRecipient(state.players, currentPlayerId, state.direction);

  return (
    <section className="gdo-phase-modal" aria-label="Exchange selection">
      <div className="gdo-phase-modal__head">
        <span className="gdo-phase-modal__eyebrow gdo-phase-modal__eyebrow--info">换牌阶段</span>
        <strong>{directionLabel(state.direction)}</strong>
      </div>
      <div className="gdo-exchange-diagram">
        <span>{displayName(state.players, currentPlayerId)}</span>
        <strong>{state.direction === 'clockwise' ? 'CW' : 'CCW'}</strong>
        <span>传给 {recipient ? displayName(state.players, recipient.id) : '下一家'}</span>
      </div>
      <div className="gdo-phase-picker__meta">
        <span>选 {state.cardCount} 张传给邻座</span>
        <span>已选 {selectedCards.length} / {state.cardCount}</span>
      </div>
      <div className="gdo-phase-hand" aria-label="Exchange hand">
        {hand.map((card) => (
          <CardView
            card={card}
            key={cardKey(card)}
            levelRank={state.levelRank}
            selected={selectedKeys.has(cardKey(card))}
            onToggle={onToggleCard}
          />
        ))}
      </div>
      <button
        className="gdo-command gdo-command--primary gdo-command--info"
        type="button"
        disabled={selectedCards.length !== state.cardCount}
        onClick={onConfirm}
      >
        确认换牌
      </button>
    </section>
  );
}

function exchangeRecipient(
  players: readonly Player[],
  currentPlayerId: string,
  direction: ExchangeDirection,
): Player | undefined {
  const index = players.findIndex((player) => player.id === currentPlayerId);
  if (index < 0) return undefined;
  const offset = direction === 'clockwise' ? 1 : -1;
  return players[(index + offset + players.length) % players.length];
}

function directionLabel(direction: ExchangeDirection): string {
  return direction === 'clockwise' ? '顺时针' : '逆时针';
}

function displayName(players: readonly Player[], playerId: string): string {
  const player = players.find((candidate) => candidate.id === playerId);
  return player?.displayName ?? (player?.handle ? `@${player.handle}` : playerId);
}
