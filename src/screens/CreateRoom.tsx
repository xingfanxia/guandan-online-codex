import { useState } from 'react';
import type { GameMode, TeamStructure } from '../../lib/game/mode';

export interface CreateRoomScreenProps {
  hostHandle: string;
  onCreate: (input: { hostHandle: string; mode: GameMode; rules: { cardExchange: boolean; teamStructure: TeamStructure }; visibility: 'public' }) => void | Promise<void>;
}

export function CreateRoomScreen({ hostHandle, onCreate }: CreateRoomScreenProps): React.ReactElement {
  const [mode, setMode] = useState<GameMode>('4');
  const [teamStructure, setTeamStructure] = useState<TeamStructure>('2-teams-of-n');
  const [cardExchange, setCardExchange] = useState(false);
  const effectiveTeamStructure: TeamStructure = mode === '4' ? '2-teams-of-n' : teamStructure;

  return (
    <section className="gdo-room-panel" aria-label="Create room">
      <div className="gdo-room-panel__header">
        <span className="gdo-room-panel__eyebrow">CREATE</span>
        <strong>{mode}P 经典掼蛋</strong>
      </div>
      <div className="gdo-rule-grid" role="group" aria-label="Room rules">
        {(['4', '6', '8'] as const).map((option) => (
          <button
            key={option}
            className={['gdo-rule-chip', mode === option ? 'gdo-rule-chip--active' : ''].filter(Boolean).join(' ')}
            type="button"
            aria-pressed={mode === option}
            onClick={() => setMode(option)}
          >
            {option}P
          </button>
        ))}
        {mode !== '4' ? (
          <>
            <span className="gdo-rule-label">阵营</span>
            <button
              className={['gdo-rule-chip', effectiveTeamStructure === '2-teams-of-n' ? 'gdo-rule-chip--active' : ''].filter(Boolean).join(' ')}
              type="button"
              aria-label="两队模式"
              aria-pressed={effectiveTeamStructure === '2-teams-of-n'}
              onClick={() => setTeamStructure('2-teams-of-n')}
            >
              2队
            </button>
            <button
              className={['gdo-rule-chip', effectiveTeamStructure === 'teams-of-2' ? 'gdo-rule-chip--active' : ''].filter(Boolean).join(' ')}
              type="button"
              aria-label={mode === '6' ? '三队模式' : '四队模式'}
              aria-pressed={effectiveTeamStructure === 'teams-of-2'}
              onClick={() => setTeamStructure('teams-of-2')}
            >
              {mode === '6' ? '3队' : '4队'}
            </button>
          </>
        ) : null}
        <button className="gdo-rule-chip gdo-rule-chip--active" type="button">双副牌</button>
        <button className="gdo-rule-chip gdo-rule-chip--active" type="button">逢人配</button>
        <button
          className={['gdo-rule-chip', cardExchange ? 'gdo-rule-chip--active' : ''].filter(Boolean).join(' ')}
          type="button"
          aria-pressed={cardExchange}
          onClick={() => setCardExchange((value) => !value)}
        >
          换牌
        </button>
      </div>
      <button
        className="gdo-command gdo-command--primary"
        type="button"
        onClick={() => onCreate({ hostHandle, mode, rules: { cardExchange, teamStructure: effectiveTeamStructure }, visibility: 'public' })}
      >
        创建房间
      </button>
    </section>
  );
}
