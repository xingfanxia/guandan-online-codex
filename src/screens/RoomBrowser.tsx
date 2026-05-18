import type { PublicRoomDto } from '../lib/api/rooms';

export interface RoomBrowserScreenProps {
  rooms: PublicRoomDto[];
  onJoin: (code: string) => void | Promise<void>;
}

export function RoomBrowserScreen({ rooms, onJoin }: RoomBrowserScreenProps): React.ReactElement {
  return (
    <section className="gdo-room-panel" aria-label="Room browser">
      <div className="gdo-room-panel__header">
        <span className="gdo-room-panel__eyebrow">PUBLIC</span>
        <strong>房间列表</strong>
      </div>
      <div className="gdo-room-list">
        {rooms.map((room) => (
          <article className="gdo-room-row" key={room.code}>
            <div>
              <strong>{room.code}</strong>
              <span>@{room.hostHandle}</span>
            </div>
            <span className="gdo-room-row__count">{room.players.length}/{room.maxPlayers}</span>
            <button className="gdo-command" type="button" aria-label={`加入 ${room.code}`} onClick={() => onJoin(room.code)}>
              加入
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
