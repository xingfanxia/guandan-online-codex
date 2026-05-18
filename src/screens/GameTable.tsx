import { cardKey, type Card } from '../../lib/game/cards';
import type { ExchangeVoteChoice } from '../../lib/game/exchange';
import type { Placement, Player } from '../../lib/game/state';
import type { ClientStateView } from '../../lib/realtime/payload';
import { Avatar } from '../components/Avatar';
import { Hand } from '../components/Hand';
import { PlayerStatusBadge } from '../components/PlayerStatusBadge';
import { Trick } from '../components/Trick';
import { GamePhaseOverlay } from './GamePhaseOverlay';

export interface GameTableScreenProps {
  roomCode: string;
  view: ClientStateView;
  currentPlayerId: string;
  selectedCardKeys: ReadonlySet<string>;
  selectedExchangeCards: readonly Card[];
  onToggleCard: (card: Card) => void;
  onPlaySelected: (cards: Card[]) => void;
  onPass: () => void;
  onSortHand?: (() => void) | undefined;
  onSuggestMove?: (() => void) | undefined;
  onAdvanceRound?: (() => void) | undefined;
  onTributeCardToggle: (card: Card) => void;
  onTributeConfirm: () => void;
  onReturnCardToggle: (card: Card) => void;
  onReturnConfirm: () => void;
  onExchangeVote: (choice: ExchangeVoteChoice) => void;
  onExchangeCardToggle: (card: Card) => void;
  onExchangeConfirm: () => void;
}

export function GameTableScreen({
  roomCode,
  view,
  currentPlayerId,
  selectedCardKeys,
  selectedExchangeCards,
  onToggleCard,
  onPlaySelected,
  onPass,
  onSortHand,
  onSuggestMove,
  onAdvanceRound,
  onTributeCardToggle,
  onTributeConfirm,
  onReturnCardToggle,
  onReturnConfirm,
  onExchangeVote,
  onExchangeCardToggle,
  onExchangeConfirm,
}: GameTableScreenProps): React.ReactElement {
  const self = view.self?.playerId === currentPlayerId ? view.self : undefined;
  const selectedCards = self?.hand.filter((card) => selectedCardKeys.has(cardKey(card))) ?? [];
  const seats = seatLayout(view.players, currentPlayerId);

  return (
    <section className="gdo-table" aria-label="Guandan table">
      <div className="gdo-topbar">
        <div className="gdo-room-code">{roomCode}</div>
        <div className="gdo-level">打 {view.levelRank}</div>
        <div className="gdo-round">v{view.version}</div>
      </div>

      <div className="gdo-seat-map">
        <div className="gdo-seat-map__top">
          {seats.top ? <SeatAvatar player={seats.top} view={view} /> : null}
        </div>
        <div className="gdo-seat-map__left">
          {seats.left ? <SeatAvatar player={seats.left} view={view} /> : null}
        </div>
        <div className="gdo-seat-map__center">
          <CurrentTrick view={view} />
        </div>
        <div className="gdo-seat-map__right">
          {seats.right ? <SeatAvatar player={seats.right} view={view} /> : null}
        </div>
      </div>

      {view.players.length > 4 ? (
        <div className="gdo-seat-rail" aria-label="Additional seats">
          {view.players
            .filter((player) => player.id !== currentPlayerId && ![seats.top?.id, seats.left?.id, seats.right?.id].includes(player.id))
            .map((player) => <SeatAvatar key={player.id} player={player} view={view} compact />)}
        </div>
      ) : null}

      <div className="gdo-actionbar">
        <button className="gdo-actionbar__button" type="button" onClick={onSortHand}>理牌</button>
        <button className="gdo-actionbar__button" type="button" onClick={onSuggestMove}>提示</button>
        <button className="gdo-actionbar__button" type="button" onClick={onPass}>不要</button>
        <button
          className="gdo-actionbar__button gdo-actionbar__button--primary"
          type="button"
          disabled={selectedCards.length === 0}
          onClick={() => onPlaySelected(selectedCards.map((card) => ({ ...card })))}
        >
          出牌 · {selectedCards.length} 张
        </button>
      </div>

      <div className="gdo-my-hand">
        <SeatAvatar player={view.players.find((player) => player.id === currentPlayerId)} view={view} self />
        <Hand
          cards={self?.hand ?? []}
          levelRank={view.levelRank}
          selectedKeys={selectedCardKeys}
          onToggle={onToggleCard}
        />
      </div>

      <div className="gdo-table-overlay">
        {view.phase === 'round-end' ? (
          <RoundEndPanel view={view} onAdvanceRound={onAdvanceRound} />
        ) : null}
        {view.phase === 'game-end' ? (
          <GameEndPanel view={view} />
        ) : null}
        <GamePhaseOverlay
          view={view}
          currentPlayerId={currentPlayerId}
          selectedCardKeys={selectedCardKeys}
          selectedExchangeCards={selectedExchangeCards}
          onTributeCardToggle={onTributeCardToggle}
          onTributeConfirm={onTributeConfirm}
          onReturnCardToggle={onReturnCardToggle}
          onReturnConfirm={onReturnConfirm}
          onExchangeVote={onExchangeVote}
          onExchangeCardToggle={onExchangeCardToggle}
          onExchangeConfirm={onExchangeConfirm}
        />
      </div>
    </section>
  );
}

function RoundEndPanel({
  view,
  onAdvanceRound,
}: {
  view: ClientStateView;
  onAdvanceRound?: (() => void) | undefined;
}): React.ReactElement {
  const placements = view.placements ?? [];
  return (
    <section className="gdo-round-end" aria-label="Round end">
      <div className="gdo-round-end__head">
        <span>本局结束</span>
        <strong>下一局打 {view.nextLevelRank ?? view.levelRank}</strong>
      </div>
      <div className="gdo-round-end__placements">
        {placements.map((placement) => (
          <span key={placement.playerId}>
            #{placement.position} {displayName(view.players.find((player) => player.id === placement.playerId))}
          </span>
        ))}
      </div>
      <button className="gdo-command gdo-command--primary" type="button" onClick={onAdvanceRound}>
        下一局
      </button>
    </section>
  );
}

function GameEndPanel({ view }: { view: ClientStateView }): React.ReactElement {
  const placements = view.placements ?? [];
  const winnerTeam = view.winnerTeam ?? placements[0]?.team;
  return (
    <section className="gdo-round-end gdo-round-end--victory" aria-label="Game end">
      <div className="gdo-round-end__head">
        <span>比赛结束</span>
        <strong>{winnerTeam ? `胜方 ${winnerTeam.toUpperCase()}` : '胜负已定'}</strong>
      </div>
      <div className="gdo-round-end__placements">
        {placements.map((placement) => (
          <span key={placement.playerId}>
            #{placement.position} {displayName(view.players.find((player) => player.id === placement.playerId))}
          </span>
        ))}
      </div>
    </section>
  );
}

function CurrentTrick({ view }: { view: ClientStateView }): React.ReactElement {
  const play = view.currentTrick?.currentPlay;
  if (!play) {
    return (
      <section className="gdo-trick gdo-trick--empty" aria-label="Current trick">
        <div className="gdo-trick__meta">
          <span className="gdo-trick__player">等待出牌</span>
          <span className="gdo-trick__pattern">{view.phase}</span>
        </div>
      </section>
    );
  }

  return (
    <Trick
      playerDisplayName={displayName(view.players.find((player) => player.id === play.playerId))}
      patternLabel={play.kind}
      cards={play.cards}
      levelRank={view.levelRank}
    />
  );
}

function SeatAvatar({
  player,
  view,
  self = false,
  compact = false,
}: {
  player: Player | undefined;
  view: ClientStateView;
  self?: boolean;
  compact?: boolean;
}): React.ReactElement | null {
  if (!player) return null;
  const count = view.handCounts?.[player.id] ?? 0;
  return (
    <Avatar
      displayName={displayName(player)}
      team={player.team}
      active={view.currentTurn === player.id}
      detail={`${self ? '我 · ' : ''}${count} 张${compact ? ' · 旁座' : ''}`}
      badge={<PlayerStatusBadge playerId={player.id} status={player.connectionStatus} />}
    />
  );
}

function seatLayout(players: readonly Player[], currentPlayerId: string): {
  left: Player | undefined;
  top: Player | undefined;
  right: Player | undefined;
} {
  const others = players.filter((player) => player.id !== currentPlayerId);
  if (others.length <= 3) {
    return { left: others[0], top: others[1], right: others[2] };
  }
  return {
    left: others.at(-1),
    top: others[Math.floor(others.length / 2)],
    right: others[0],
  };
}

function displayName(player: Player | Pick<Placement, 'playerId'> | undefined): string {
  if (player && 'playerId' in player) return player.playerId;
  return player?.displayName ?? (player?.handle ? `@${player.handle}` : player?.id ?? 'unknown');
}
