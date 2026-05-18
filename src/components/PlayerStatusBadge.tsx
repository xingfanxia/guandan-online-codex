import type { PlayerConnectionStatus, PlayerId } from '../../lib/game/state';
import { connectionStatusLabel } from '../../lib/room/botTakeover';

export interface PlayerStatusBadgeProps {
  playerId: PlayerId;
  status?: PlayerConnectionStatus | undefined;
}

export function PlayerStatusBadge({ playerId, status }: PlayerStatusBadgeProps): React.ReactElement | null {
  const label = connectionStatusLabel(status);
  if (!label) return null;
  return (
    <span className="gdo-status-badge" aria-label={`${playerId} ${statusLabelForAria(status)}`}>
      {label}
    </span>
  );
}

function statusLabelForAria(status: PlayerConnectionStatus | undefined): string {
  switch (status) {
    case 'bot-takeover':
      return 'bot takeover';
    case 'disconnected':
      return 'disconnected';
    case 'online':
    case undefined:
      return 'online';
  }
}
