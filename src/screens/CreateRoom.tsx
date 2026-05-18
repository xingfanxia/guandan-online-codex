import { useState } from 'react';
import type { GameMode } from '../../lib/game/mode';

export interface CreateRoomScreenProps {
  hostHandle: string;
  onCreate: (input: { hostHandle: string; mode: GameMode; rules: { cardExchange: boolean }; visibility: 'public' }) => void | Promise<void>;
}

export function CreateRoomScreen({ hostHandle, onCreate }: CreateRoomScreenProps): React.ReactElement {
  const [mode, setMode] = useState<GameMode>('4');
  const [cardExchange, setCardExchange] = useState(false);

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
        onClick={() => onCreate({ hostHandle, mode, rules: { cardExchange }, visibility: 'public' })}
      >
        创建房间
      </button>
    </section>
  );
}
