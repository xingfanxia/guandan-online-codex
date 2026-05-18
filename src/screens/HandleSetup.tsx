import { useId, useState } from 'react';

export interface HandleSetupScreenProps {
  onCreateHandle: (input: { handle: string }) => void | Promise<void>;
}

export function HandleSetupScreen({ onCreateHandle }: HandleSetupScreenProps): React.ReactElement {
  const inputId = useId();
  const [handle, setHandle] = useState('');
  const trimmed = handle.trim();

  return (
    <section className="gdo-room-panel gdo-handle-panel" aria-label="Player setup">
      <div className="gdo-room-panel__header">
        <span className="gdo-room-panel__eyebrow">PLAYER</span>
        <strong>{trimmed ? `@${trimmed.replace(/^@/, '')}` : '@'}</strong>
      </div>
      <label className="gdo-field gdo-field--handle" htmlFor={inputId}>
        <span>玩家名</span>
        <span className="gdo-handle-input">
          <span>@</span>
          <input
            id={inputId}
            aria-label="玩家名"
            autoComplete="nickname"
            maxLength={24}
            value={handle}
            onChange={(event) => setHandle(event.currentTarget.value)}
          />
        </span>
      </label>
      <button
        className="gdo-command gdo-command--primary"
        type="button"
        disabled={!trimmed}
        onClick={() => onCreateHandle({ handle: trimmed })}
      >
        进入大厅
      </button>
    </section>
  );
}
