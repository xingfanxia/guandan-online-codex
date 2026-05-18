import type { ReactNode } from 'react';
import type { TeamKey } from '../../lib/game/mode';

export interface AvatarProps {
  displayName: string;
  team: TeamKey;
  active?: boolean;
  detail?: string;
  badge?: ReactNode;
}

export function Avatar({ displayName, team, active = false, detail, badge }: AvatarProps): React.ReactElement {
  return (
    <div className={['gdo-seat', `gdo-seat--${team}`, active ? 'gdo-seat--active' : ''].filter(Boolean).join(' ')}>
      <div className="gdo-avatar" aria-hidden="true">{initials(displayName)}</div>
      <div className="gdo-seat__copy">
        <span className="gdo-seat__name">{displayName}</span>
        {detail ? <span className="gdo-seat__detail">{detail}</span> : null}
        {badge}
      </div>
    </div>
  );
}

function initials(displayName: string): string {
  return displayName.replace(/^@/, '').slice(0, 2).toUpperCase();
}
