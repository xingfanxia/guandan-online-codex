import { checkBotId as checkVercelBotId } from 'botid/server';

export type BotIdVerdict = 'none' | 'likely-bot' | 'bot';
export interface BotIdCheckResult {
  isBot: boolean;
}

export type BotIdChecker = (request: Request) => Promise<BotIdCheckResult>;

export interface EnforceBotIdOptions {
  checkBotId?: BotIdChecker;
}

const FRIENDLY_BOT_AGENTS = [
  'vercel-cron',
  'upstash-qstash',
  'uptimerobot',
  'better uptime',
];

export function botIdVerdict(request: Request): BotIdVerdict {
  const header = request.headers.get('x-vercel-bot-detection');
  if (header === 'bot' || header === 'likely-bot') return header;
  return 'none';
}

export function enforceBotIdHeader(request: Request): Response | undefined {
  if (botIdVerdict(request) !== 'bot') return undefined;
  if (isFriendlyAutomation(request.headers.get('user-agent'))) return undefined;
  return botDetectedResponse();
}

export async function enforceBotId(
  request: Request,
  { checkBotId = checkOfficialBotId }: EnforceBotIdOptions = {},
): Promise<Response | undefined> {
  if (isFriendlyAutomation(request.headers.get('user-agent'))) return undefined;
  const headerBlocked = enforceBotIdHeader(request);
  if (headerBlocked) return headerBlocked;

  const verification = await checkBotId(request);
  return verification.isBot ? botDetectedResponse() : undefined;
}

export async function checkOfficialBotId(request: Request): Promise<BotIdCheckResult> {
  const headers = Object.fromEntries(request.headers.entries());
  return checkVercelBotId({ advancedOptions: { headers } });
}

function isFriendlyAutomation(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const normalized = userAgent.toLowerCase();
  return FRIENDLY_BOT_AGENTS.some((agent) => normalized.includes(agent));
}

function botDetectedResponse(): Response {
  return new Response(JSON.stringify({ ok: false, error: 'ERR_BOT_DETECTED' }), {
    status: 403,
    headers: { 'content-type': 'application/json' },
  });
}
