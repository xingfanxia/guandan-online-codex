import { isHeartLevelWildcard, rankValue, type Card, type LevelRank } from '../game/cards';
import type { PlayerId, PlayingState } from '../game/state';
import { mediumBotMove } from './bots/medium';
import { buildPlayerView, type LegalMove } from './engine';

export interface SuggestedMove {
  move: LegalMove;
  description: string;
}

export function sortHand(hand: readonly Card[], levelRank: LevelRank): Card[] {
  return hand
    .map((card) => ({ ...card }))
    .sort((a, b) => sortValue(a, levelRank) - sortValue(b, levelRank) || suitOrder(a) - suitOrder(b));
}

export function suggestMove(state: PlayingState, playerId: PlayerId): SuggestedMove {
  const move = mediumBotMove(buildPlayerView(state, playerId));
  return {
    move,
    description: describeMove(move),
  };
}

function sortValue(card: Card, levelRank: LevelRank): number {
  if (isHeartLevelWildcard(card, levelRank)) return 1000;
  return rankValue(card.rank, levelRank);
}

function suitOrder(card: Card): number {
  switch (card.suit) {
    case 'hearts':
      return 1;
    case 'diamonds':
      return 2;
    case 'clubs':
      return 3;
    case 'spades':
      return 4;
    case 'joker':
      return card.rank === 'BJ' ? 5 : 6;
  }
}

function describeMove(move: LegalMove): string {
  if (move.type === 'pass') return '没有合适压牌';
  switch (move.pattern.kind) {
    case 'single':
      return '出最稳单张';
    case 'pair':
      return '对子压一手';
    case 'triple':
      return '三张抢节奏';
    case 'fullHouse':
      return '三带二清牌';
    case 'straight':
      return '顺子铺开';
    case 'straightFlush':
      return '同花顺压制';
    case 'threePairRun':
      return '连对提速';
    case 'twoTripleRun':
      return '钢板提速';
    case 'bomb':
      return '炸弹控场';
    case 'jokerBomb':
      return '王炸收口';
  }
}
