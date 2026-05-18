import type { Card } from '../../lib/game/cards';
import type { ExchangeVoteChoice } from '../../lib/game/exchange';
import type {
  ExchangeSelectPendingState,
  ExchangeVotePendingState,
  PlayerId,
  ReturnPendingState,
  TributePendingState,
} from '../../lib/game/state';
import type { ClientStateView } from '../../lib/realtime/payload';
import { ExchangeSelectModal } from './ExchangeSelectModal';
import { ExchangeVoteModal } from './ExchangeVoteModal';
import { TributeModal } from './TributeModal';

export interface GamePhaseOverlayProps {
  view: ClientStateView;
  currentPlayerId: PlayerId;
  selectedCardKeys: ReadonlySet<string>;
  selectedExchangeCards: readonly Card[];
  onTributeCardToggle: (card: Card) => void;
  onTributeConfirm: () => void;
  onReturnCardToggle: (card: Card) => void;
  onReturnConfirm: () => void;
  onExchangeVote: (choice: ExchangeVoteChoice) => void;
  onExchangeCardToggle: (card: Card) => void;
  onExchangeConfirm: () => void;
}

export function GamePhaseOverlay({
  view,
  currentPlayerId,
  selectedCardKeys,
  selectedExchangeCards,
  onTributeCardToggle,
  onTributeConfirm,
  onReturnCardToggle,
  onReturnConfirm,
  onExchangeVote,
  onExchangeCardToggle,
  onExchangeConfirm,
}: GamePhaseOverlayProps): React.ReactElement | null {
  if (view.phase === 'tribute-pending' && view.tribute?.obligations) {
    const state: TributePendingState = {
      phase: 'tribute-pending',
      mode: view.mode,
      levelRank: view.levelRank,
      players: view.players,
      hands: ownHand(view, currentPlayerId),
      undealt: [],
      obligations: view.tribute.obligations.map((obligation) => ({ ...obligation })),
      selectedTributes: {},
      firstLeader: view.tribute.obligations[0]?.to ?? currentPlayerId,
      deadlineAt: view.tribute.deadlineAt,
      version: view.version,
    };
    return (
      <TributeModal
        state={state}
        currentPlayerId={currentPlayerId}
        selectedCardKeys={selectedCardKeys}
        onToggleCard={onTributeCardToggle}
        onConfirm={onTributeConfirm}
      />
    );
  }

  if (view.phase === 'return-pending' && view.tribute?.exchanges) {
    const state: ReturnPendingState = {
      phase: 'return-pending',
      mode: view.mode,
      levelRank: view.levelRank,
      players: view.players,
      hands: ownHand(view, currentPlayerId),
      undealt: [],
      exchanges: view.tribute.exchanges.map((exchange) => ({
        from: exchange.from,
        to: exchange.to,
        tributeCard: { ...exchange.tributeCard },
      })),
      selectedReturns: {},
      firstLeader: view.tribute.exchanges[0]?.to ?? currentPlayerId,
      deadlineAt: view.tribute.deadlineAt,
      version: view.version,
    };
    return (
      <TributeModal
        state={state}
        currentPlayerId={currentPlayerId}
        selectedCardKeys={selectedCardKeys}
        onToggleCard={onReturnCardToggle}
        onConfirm={onReturnConfirm}
      />
    );
  }

  if (view.phase === 'exchange-vote-pending' && view.exchange?.eligibleVoters) {
    const state: ExchangeVotePendingState = {
      phase: 'exchange-vote-pending',
      mode: view.mode,
      levelRank: view.levelRank,
      players: view.players,
      hands: ownHand(view, currentPlayerId),
      undealt: [],
      eligibleVoters: [...view.exchange.eligibleVoters],
      votes: { ...(view.exchange.votes ?? {}) },
      firstLeader: currentPlayerId,
      deadlineAt: view.exchange.deadlineAt,
      version: view.version,
    };
    return <ExchangeVoteModal state={state} currentPlayerId={currentPlayerId} onVote={onExchangeVote} />;
  }

  if (view.phase === 'exchange-select-pending' && view.exchange?.direction && view.exchange.cardCount) {
    const state: ExchangeSelectPendingState = {
      phase: 'exchange-select-pending',
      mode: view.mode,
      levelRank: view.levelRank,
      players: view.players,
      hands: ownHand(view, currentPlayerId),
      undealt: [],
      direction: view.exchange.direction,
      cardCount: view.exchange.cardCount,
      selections: {},
      firstLeader: currentPlayerId,
      deadlineAt: view.exchange.deadlineAt,
      version: view.version,
    };
    return (
      <ExchangeSelectModal
        state={state}
        currentPlayerId={currentPlayerId}
        selectedCards={selectedExchangeCards}
        onToggleCard={onExchangeCardToggle}
        onConfirm={onExchangeConfirm}
      />
    );
  }

  return null;
}

function ownHand(view: ClientStateView, currentPlayerId: PlayerId): Record<PlayerId, Card[]> {
  if (view.self?.playerId !== currentPlayerId) return {};
  return { [currentPlayerId]: view.self.hand.map((card) => ({ ...card })) };
}
