import type { Player } from '../game/state';

type BotDifficulty = NonNullable<Player['botDifficulty']>;

interface BotName {
  slug: string;
  displayName: string;
}

const BOT_NAMES: BotName[] = [
  { slug: 'xiaoli', displayName: '@小李' },
  { slug: 'doudou', displayName: '@豆豆' },
  { slug: 'maomao', displayName: '@毛毛' },
  { slug: 'xiaoyu', displayName: '@小雨' },
  { slug: 'laozhou', displayName: '@老周' },
  { slug: 'nannan', displayName: '@楠楠' },
  { slug: 'anqi', displayName: '@安琪' },
  { slug: 'pangzi', displayName: '@胖子' },
];

export interface BotIdentity {
  handle: string;
  displayName: string;
  botDifficulty: BotDifficulty;
}

export function botIdentityForSeat(seatIndex: number, botDifficulty: BotDifficulty): BotIdentity {
  const name = BOT_NAMES[((seatIndex % BOT_NAMES.length) + BOT_NAMES.length) % BOT_NAMES.length]!;
  return {
    handle: `bot_${name.slug}_${seatIndex + 1}`,
    displayName: name.displayName,
    botDifficulty,
  };
}
