export function generateOwnershipToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// SYNC: ../guandan-scorer/api/players/_utils.js validateOwnershipToken.
export async function validateOwnershipToken(provided: unknown, storedHash: unknown): Promise<boolean> {
  if (!provided || typeof provided !== 'string') return false;
  if (!storedHash || typeof storedHash !== 'string') return false;
  if (storedHash.length !== 64) return false;

  const providedHash = await hashToken(provided);
  if (providedHash.length !== storedHash.length) return false;

  let mismatch = 0;
  for (let i = 0; i < providedHash.length; i++) {
    mismatch |= providedHash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return mismatch === 0;
}

export function extractBearerToken(request: { headers: { get(name: string): string | null } }): string | null {
  const auth = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!auth) return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return match ? match[1]!.trim() : null;
}

export function sanitizePlayer<T extends Record<string, unknown> | null | undefined>(
  player: T,
): T extends null | undefined ? T : Omit<T, 'ownershipTokenHash'> {
  if (!player) return player as T extends null | undefined ? T : Omit<T, 'ownershipTokenHash'>;
  const { ownershipTokenHash: _ownershipTokenHash, ...rest } = player;
  return rest as T extends null | undefined ? T : Omit<T, 'ownershipTokenHash'>;
}
