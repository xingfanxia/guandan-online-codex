import { initBotId } from 'botid/client/core';

export const BOT_ID_PROTECTED_ROUTES: Array<{ path: string; method: string }> = [
  { path: '/api/move', method: 'POST' },
  { path: '/api/report', method: 'POST' },
];

type InitBotId = (config: { protect: typeof BOT_ID_PROTECTED_ROUTES }) => void;

let initialized = false;

export function initGuandanBotId(init: InitBotId = initBotId): void {
  if (initialized) return;
  initialized = true;
  init({ protect: BOT_ID_PROTECTED_ROUTES });
}
