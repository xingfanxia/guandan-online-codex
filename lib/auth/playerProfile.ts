import { normalizeHandle, validateHandle } from './handle';
import type { UpstashRedis } from '../realtime/upstashRest';

type MaybePromise<T> = T | Promise<T>;

export interface PlayerProfile {
  handle: string;
  createdAt: string;
  createIp: string;
}

export interface PlayerProfileStore {
  get(handle: string): MaybePromise<PlayerProfile | undefined>;
  create(profile: PlayerProfile): MaybePromise<boolean>;
}

export class MemoryPlayerProfileStore implements PlayerProfileStore {
  private readonly profiles = new Map<string, PlayerProfile>();

  get(handle: string): PlayerProfile | undefined {
    const profile = this.profiles.get(normalizeHandle(handle));
    return profile ? { ...profile } : undefined;
  }

  create(profile: PlayerProfile): boolean {
    const handle = normalizeHandle(profile.handle);
    if (this.profiles.has(handle)) return false;
    this.profiles.set(handle, { ...profile, handle });
    return true;
  }
}

export class UpstashPlayerProfileStore implements PlayerProfileStore {
  constructor(private readonly redis: UpstashRedis) {}

  async get(handle: string): Promise<PlayerProfile | undefined> {
    const normalized = normalizeHandle(handle);
    const raw = await this.redis.command<string | null>(['GET', playerProfileKey(normalized)]);
    return raw ? JSON.parse(raw) as PlayerProfile : undefined;
  }

  async create(profile: PlayerProfile): Promise<boolean> {
    const normalized = normalizeHandle(profile.handle);
    if (!validateHandle(normalized)) return false;
    const saved = await this.redis.command<string | null>([
      'SET',
      playerProfileKey(normalized),
      JSON.stringify({ ...profile, handle: normalized }),
      'NX',
    ]);
    return saved === 'OK';
  }
}

export function playerProfileKey(handle: string): string {
  return `go:player:${normalizeHandle(handle)}`;
}
