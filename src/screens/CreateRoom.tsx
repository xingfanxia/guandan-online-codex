import { useState } from 'react';

export interface CreateRoomScreenProps {
  hostHandle: string;
  onCreate: (input: { hostHandle: string; rules: { cardExchange: boolean }; visibility: 'public' }) => void | Promise<void>;
}

export function CreateRoomScreen({ hostHandle, onCreate }: CreateRoomScreenProps): React.ReactElement {
  const [cardExchange, setCardExchange] = useState(false);

  return (
    <section className="gdo-room-panel" aria-label="Create room">
      <div className="gdo-room-panel__header">
        <span className="gdo-room-panel__eyebrow">CREATE</span>
        <strong>4P 经典掼蛋</strong>
      </div>
      <div className="gdo-rule-grid" role="group" aria-label="Room rules">
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
        onClick={() => onCreate({ hostHandle, rules: { cardExchange }, visibility: 'public' })}
      >
        创建房间
      </button>
    </section>
  );
}
