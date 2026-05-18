import { describe, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';

describe('hidden-state grep guard', () => {
  test('passes on the current tree', () => {
    expect(() => execFileSync('bash', ['scripts/security/grep-no-leak.sh'], { stdio: 'pipe' })).not.toThrow();
  });
});
