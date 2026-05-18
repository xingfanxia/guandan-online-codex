import { cardKey, type Card } from '../../lib/game/cards';
import type { Player, ReturnPendingState, TributePendingState } from '../../lib/game/state';
import { CardView } from '../components/Card';

export interface TributeModalProps {
  state: TributePendingState | ReturnPendingState;
  currentPlayerId: string;
  selectedCardKeys: ReadonlySet<string>;
  onToggleCard: (card: Card) => void;
  onConfirm: () => void;
}

export function TributeModal({
  state,
  currentPlayerId,
  selectedCardKeys,
  onToggleCard,
  onConfirm,
}: TributeModalProps): React.ReactElement {
  if (state.phase === 'return-pending') {
    return (
      <section className="gdo-phase-modal" aria-label="Tribute phase">
        <div className="gdo-phase-modal__head">
          <span className="gdo-phase-modal__eyebrow gdo-phase-modal__eyebrow--info">还贡阶段</span>
          <strong>还贡 ≤10</strong>
        </div>
        <ReturnBody
          state={state}
          currentPlayerId={currentPlayerId}
          selectedCardKeys={selectedCardKeys}
          onToggleCard={onToggleCard}
          onConfirm={onConfirm}
        />
      </section>
    );
  }

  const sweep = state.obligations.length > 1 && state.mode !== '4';
  const currentObligation = state.obligations.find((obligation) => obligation.from === currentPlayerId);
  const hand = state.hands[currentPlayerId] ?? [];

  return (
    <section className="gdo-phase-modal" aria-label="Tribute phase">
      <div className="gdo-phase-modal__head">
        <span className="gdo-phase-modal__eyebrow">进贡阶段</span>
        <strong>{sweep ? '一队全胜 · 按名次进贡' : '仅末游单笔进贡头游'}</strong>
      </div>

      <div className={sweep ? 'gdo-tribute-matrix gdo-tribute-matrix--sweep' : 'gdo-tribute-matrix'}>
        {state.obligations.map((obligation) => (
          <div className="gdo-tribute-pair" key={`${obligation.from}:${obligation.to}`}>
            <span>{displayName(state.players, obligation.from)}</span>
            <strong>{obligation.fromPosition} → {obligation.toPosition}</strong>
            <span>{displayName(state.players, obligation.to)}</span>
          </div>
        ))}
      </div>

      {currentObligation ? (
        <div className="gdo-phase-picker">
          <div className="gdo-phase-picker__meta">
            <span>{displayName(state.players, currentObligation.from)} 进贡给 {displayName(state.players, currentObligation.to)}</span>
            <span>{selectedCardKeys.size} / 1</span>
          </div>
          <div className="gdo-phase-hand" aria-label="Tribute hand">
            {hand.map((card) => (
              <CardView
                card={card}
                key={cardKey(card)}
                levelRank={state.levelRank}
                selected={selectedCardKeys.has(cardKey(card))}
                onToggle={onToggleCard}
              />
            ))}
          </div>
          <button className="gdo-command gdo-command--primary" type="button" disabled={selectedCardKeys.size !== 1} onClick={onConfirm}>
            确认进贡
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ReturnBody({
  state,
  currentPlayerId,
  selectedCardKeys,
  onToggleCard,
  onConfirm,
}: {
  state: ReturnPendingState;
  currentPlayerId: string;
  selectedCardKeys: ReadonlySet<string>;
  onToggleCard: (card: Card) => void;
  onConfirm: () => void;
}): React.ReactElement {
  const exchange = state.exchanges.find((candidate) => candidate.to === currentPlayerId);
  const hand = state.hands[currentPlayerId] ?? [];

  if (!exchange) {
    return (
      <div className="gdo-phase-picker">
        <div className="gdo-phase-picker__meta">
          <span>等待还贡玩家选择</span>
          <span>{state.exchanges.length} 笔</span>
        </div>
      </div>
    );
  }

  return (
    <div className="gdo-phase-picker">
      <div className="gdo-return-received">
        <span>收到 {displayName(state.players, exchange.from)} 的进贡</span>
        <CardView card={exchange.tributeCard} levelRank={state.levelRank} size="md" />
      </div>
      <div className="gdo-phase-hand" aria-label="Return hand">
        {hand.map((card) => (
          <CardView
            card={card}
            key={cardKey(card)}
            levelRank={state.levelRank}
            selected={selectedCardKeys.has(cardKey(card))}
            onToggle={onToggleCard}
          />
        ))}
      </div>
      <button className="gdo-command gdo-command--primary" type="button" disabled={selectedCardKeys.size !== 1} onClick={onConfirm}>
        确认还贡
      </button>
    </div>
  );
}

function displayName(players: readonly Player[], playerId: string): string {
  const player = players.find((candidate) => candidate.id === playerId);
  return player?.displayName ?? (player?.handle ? `@${player.handle}` : playerId);
}
