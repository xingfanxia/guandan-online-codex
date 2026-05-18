import type { RoomPlayerDto } from '../lib/api/rooms';

export interface WaitingRoomScreenProps {
  code: string;
  players: RoomPlayerDto[];
  maxPlayers: number;
  onStart: (input: { fillBots: true; botDifficulty: 'easy' }) => void | Promise<void>;
  onKick?: ((playerId: string) => void | Promise<void>) | undefined;
}

export function WaitingRoomScreen({
  code,
  players,
  maxPlayers,
  onStart,
  onKick,
}: WaitingRoomScreenProps): React.ReactElement {
  const slots = Array.from({ length: maxPlayers }, (_, index) => players[index]);

  return (
    <section className="gdo-room-panel" aria-label="Waiting room">
      <div className="gdo-room-panel__header">
        <span className="gdo-room-panel__eyebrow">ROOM</span>
        <strong>{code}</strong>
      </div>
      <div className="gdo-slot-grid">
        {slots.map((player, index) => (
          <div className="gdo-slot" key={player?.id ?? `bot-${index}`}>
            <span className="gdo-slot__seat">P{index + 1}</span>
            <span className="gdo-slot__name">{player ? `@${player.handle}` : 'BOT'}</span>
            {player && player.role !== 'host' && onKick ? (
              <button
                className="gdo-command gdo-command--compact"
                type="button"
                aria-label={`踢出 ${player.handle}`}
                onClick={() => onKick(player.id)}
              >
                踢出
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <button
        className="gdo-command gdo-command--primary"
        type="button"
        onClick={() => onStart({ fillBots: true, botDifficulty: 'easy' })}
      >
        开始
      </button>
    </section>
  );
}
