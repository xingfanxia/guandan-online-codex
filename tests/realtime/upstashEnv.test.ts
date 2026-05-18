import { describe, expect, test } from 'vitest';
import { resolveUpstashRestConfig } from '../../lib/realtime/upstashEnv';

describe('Upstash REST env resolver', () => {
  test('uses explicit Upstash env names first', () => {
    expect(resolveUpstashRestConfig({
      UPSTASH_REDIS_REST_URL: 'https://upstash.example',
      UPSTASH_REDIS_REST_TOKEN: 'upstash-token',
      KV_REST_API_URL: 'https://kv.example',
      KV_REST_API_TOKEN: 'kv-token',
    })).toEqual({
      url: 'https://upstash.example',
      token: 'upstash-token',
    });
  });

  test('falls back to Vercel Marketplace KV env names', () => {
    expect(resolveUpstashRestConfig({
      KV_REST_API_URL: 'https://kv.example',
      KV_REST_API_TOKEN: 'kv-token',
    })).toEqual({
      url: 'https://kv.example',
      token: 'kv-token',
    });
  });

  test('requires both URL and token', () => {
    expect(resolveUpstashRestConfig({ KV_REST_API_URL: 'https://kv.example' })).toBeUndefined();
    expect(resolveUpstashRestConfig({ KV_REST_API_TOKEN: 'kv-token' })).toBeUndefined();
  });
});
