import { describe, expect, test } from 'vitest';
import { generateRoomCode } from '../../lib/room/code';

describe('room code generation', () => {
  test('generates ambiguity-safe alternating 3 letters + 3 digits code', () => {
    const code = generateRoomCode(() => 0);

    expect(code).toMatch(/^[A-Z][2-9][A-Z][2-9][A-Z][2-9]$/);
    expect(code).not.toMatch(/[01OIZ]/);
  });

  test('is deterministic with injected random source', () => {
    const randoms = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
    let i = 0;

    expect(generateRoomCode(() => randoms[i++ % randoms.length]!)).toBe('E4K6P7');
  });
});
