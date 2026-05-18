import { describe, expect, test } from 'vitest';
import { botIdVerdict, enforceBotId, enforceBotIdHeader } from '../../lib/security/botId';

describe('Vercel BotID helper', () => {
  test('blocks explicit bot verdicts', async () => {
    const request = new Request('https://gdo.ax0x.ai/api/move', {
      headers: { 'x-vercel-bot-detection': 'bot' },
    });

    expect(botIdVerdict(request)).toBe('bot');
    const response = enforceBotIdHeader(request);
    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({ ok: false, error: 'ERR_BOT_DETECTED' });
  });

  test('allows likely bots for logging-only mode and friendly scheduled functions', async () => {
    expect(enforceBotIdHeader(new Request('https://gdo.ax0x.ai/api/move', {
      headers: { 'x-vercel-bot-detection': 'likely-bot' },
    }))).toBeUndefined();

    expect(await enforceBotId(new Request('https://gdo.ax0x.ai/api/tick', {
      headers: {
        'x-vercel-bot-detection': 'bot',
        'user-agent': 'vercel-cron/1.0',
      },
    }), { checkBotId: async () => ({ isBot: true }) })).toBeUndefined();
  });

  test('uses official BotID verification when header fallback does not block', async () => {
    const response = await enforceBotId(new Request('https://gdo.ax0x.ai/api/move'), {
      checkBotId: async () => ({ isBot: true }),
    });

    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({ ok: false, error: 'ERR_BOT_DETECTED' });
  });

  test('does not call official verification when header already blocks', async () => {
    let calls = 0;
    const response = await enforceBotId(new Request('https://gdo.ax0x.ai/api/move', {
      headers: { 'x-vercel-bot-detection': 'bot' },
    }), {
      checkBotId: async () => {
        calls += 1;
        return { isBot: false };
      },
    });

    expect(response?.status).toBe(403);
    expect(calls).toBe(0);
  });
});
