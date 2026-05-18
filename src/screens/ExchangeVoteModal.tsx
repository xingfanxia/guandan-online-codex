import type { ExchangeVoteChoice } from '../../lib/game/exchange';
import type { ExchangeVotePendingState, Player } from '../../lib/game/state';

export interface ExchangeVoteModalProps {
  state: ExchangeVotePendingState;
  currentPlayerId: string;
  onVote: (choice: ExchangeVoteChoice) => void;
}

export function ExchangeVoteModal({
  state,
  currentPlayerId,
  onVote,
}: ExchangeVoteModalProps): React.ReactElement {
  const yes = state.eligibleVoters.filter((playerId) => state.votes[playerId] === 'yes').length;
  const required = Math.floor(state.eligibleVoters.length / 2) + 1;
  const eligible = state.eligibleVoters.includes(currentPlayerId);

  return (
    <section className="gdo-phase-modal" aria-label="Exchange vote">
      <div className="gdo-phase-modal__head">
        <span className="gdo-phase-modal__eyebrow gdo-phase-modal__eyebrow--info">换牌投票</span>
        <strong>{yes} / {state.eligibleVoters.length} 投了换牌</strong>
      </div>
      <div className="gdo-vote-threshold">
        <span>需要 {required}</span>
        <div className="gdo-vote-threshold__track" aria-hidden="true">
          <div className="gdo-vote-threshold__bar" style={{ width: `${Math.min(100, (yes / required) * 100)}%` }} />
        </div>
      </div>
      <div className="gdo-voter-grid">
        {state.eligibleVoters.map((playerId) => (
          <div className="gdo-voter-card" key={playerId}>
            <span>{displayName(state.players, playerId)}</span>
            <strong>{voteGlyph(state.votes[playerId])}</strong>
          </div>
        ))}
      </div>
      <div className="gdo-phase-actions">
        <button className="gdo-command gdo-command--primary" type="button" disabled={!eligible} onClick={() => onVote('yes')}>
          同意换牌
        </button>
        <button className="gdo-command" type="button" disabled={!eligible} onClick={() => onVote('no')}>
          不换
        </button>
      </div>
    </section>
  );
}

function voteGlyph(choice: ExchangeVoteChoice | undefined): string {
  if (choice === 'yes') return '✓';
  if (choice === 'no') return '✗';
  return '待投';
}

function displayName(players: readonly Player[], playerId: string): string {
  const player = players.find((candidate) => candidate.id === playerId);
  return player?.displayName ?? (player?.handle ? `@${player.handle}` : playerId);
}
