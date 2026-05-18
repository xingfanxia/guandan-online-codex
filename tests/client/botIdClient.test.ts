import { describe, expect, test, vi } from 'vitest';
import {
  BOT_ID_PROTECTED_ROUTES,
  initGuandanBotId,
} from '../../src/lib/security/botIdClient';

describe('BotID client initialization', () => {
  test('protects high-value mutation routes from the browser session', () => {
    expect(BOT_ID_PROTECTED_ROUTES).toEqual([
      { path: '/api/move', method: 'POST' },
      { path: '/api/report', method: 'POST' },
    ]);
  });

  test('passes protected routes to initBotId exactly once', () => {
    const init = vi.fn();

    initGuandanBotId(init);
    initGuandanBotId(init);

    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith({ protect: BOT_ID_PROTECTED_ROUTES });
  });
});
