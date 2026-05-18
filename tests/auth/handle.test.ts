import { describe, expect, test } from 'vitest';
import { normalizeHandle, validateHandle } from '../../lib/auth/handle';

describe('handle normalization', () => {
  test('strips one leading at sign and lowercases handles', () => {
    expect(normalizeHandle('@Fufu_99')).toBe('fufu_99');
    expect(normalizeHandle('  AX0X  ')).toBe('ax0x');
  });

  test('validates the online handle contract', () => {
    expect(validateHandle('abc')).toBe(true);
    expect(validateHandle('ax')).toBe(true);
    expect(validateHandle('abc_123')).toBe(true);
    expect(validateHandle('a')).toBe(false);
    expect(validateHandle('a'.repeat(21))).toBe(false);
    expect(validateHandle('bad-handle')).toBe(false);
    expect(validateHandle('@abc')).toBe(false);
    expect(validateHandle(null)).toBe(false);
  });
});
