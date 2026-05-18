import type { RoomRecord, RoomStore } from './lifecycle';
import type { UpstashRedis } from '../realtime/upstashRest';

export class UpstashRoomStore implements RoomStore {
  constructor(private readonly redis: UpstashRedis) {}

  async get(code: string): Promise<RoomRecord | undefined> {
    const raw = await this.redis.command<string | null>(['GET', roomKey(code)]);
    return raw ? JSON.parse(raw) as RoomRecord : undefined;
  }

  async set(code: string, room: RoomRecord): Promise<void> {
    await this.redis.command<string>(['SET', roomKey(code), JSON.stringify(room)]);
  }

  async has(code: string): Promise<boolean> {
    const exists = await this.redis.command<number>(['EXISTS', roomKey(code)]);
    return exists === 1;
  }

  async delete(code: string): Promise<void> {
    await this.redis.command<number>(['DEL', roomKey(code)]);
  }

  async list(): Promise<RoomRecord[]> {
    const keys = await this.redis.command<string[]>(['KEYS', 'go:room:*']);
    if (keys.length === 0) return [];
    const rawRooms = await this.redis.command<Array<string | null>>(['MGET', ...keys]);
    return rawRooms.flatMap((raw) => (raw ? [JSON.parse(raw) as RoomRecord] : []));
  }
}

function roomKey(code: string): string {
  return `go:room:${code}`;
}
