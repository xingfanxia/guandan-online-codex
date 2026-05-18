import { describe, expect, test } from 'vitest';
import {
  extractBearerToken,
  generateOwnershipToken,
  hashToken,
  sanitizePlayer,
  validateOwnershipToken,
} from '../../lib/auth/ownershipToken';

function mockRequest(auth?: string) {
  return {
    headers: {
      get(name: string) {
        if (name.toLowerCase() !== 'authorization') return null;
        return auth ?? null;
      },
    },
  };
}

describe('ownership tokens', () => {
  test('generates and verifies hashed bearer tokens without storing raw tokens', async () => {
    const token = generateOwnershipToken();
    const otherToken = generateOwnershipToken();

    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(otherToken).not.toBe(token);

    const hash = await hashToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(token);
    expect(await validateOwnershipToken(token, hash)).toBe(true);
    expect(await validateOwnershipToken(otherToken, hash)).toBe(false);
  });

  test('rejects malformed token inputs and corrupted stored hashes', async () => {
    const token = generateOwnershipToken();

    expect(await validateOwnershipToken('', 'a'.repeat(64))).toBe(false);
    expect(await validateOwnershipToken(token, '')).toBe(false);
    expect(await validateOwnershipToken(token, 'a'.repeat(63))).toBe(false);
    expect(await validateOwnershipToken(token, 'a'.repeat(65))).toBe(false);
    expect(await validateOwnershipToken(123, 'a'.repeat(64))).toBe(false);
    expect(await validateOwnershipToken(token, 123)).toBe(false);
  });

  test('extracts bearer tokens and strips ownershipTokenHash from public records', () => {
    expect(extractBearerToken(mockRequest('Bearer abc123'))).toBe('abc123');
    expect(extractBearerToken(mockRequest('  bearer   xyz  '))).toBe('xyz');
    expect(extractBearerToken(mockRequest('Basic abc123'))).toBeNull();
    expect(extractBearerToken(mockRequest())).toBeNull();

    const player = {
      handle: 'fufu',
      displayName: 'Fufu',
      ownershipTokenHash: 'a'.repeat(64),
      stats: { sessionsPlayed: 0 },
    };

    expect(sanitizePlayer(player)).toEqual({
      handle: 'fufu',
      displayName: 'Fufu',
      stats: { sessionsPlayed: 0 },
    });
    expect(player.ownershipTokenHash).toBe('a'.repeat(64));
  });
});
