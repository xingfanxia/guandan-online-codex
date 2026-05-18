import { rankValue } from '../../game/cards';
import { isBombKind } from '../../game/bomb';
import {
  enumerateLegalMoves,
  moveSortValue,
  type LegalMove,
  type PlayerView,
} from '../engine';

export interface EasyBotOptions {
  random?: () => number;
  noise?: number;
}

export function easyBotMove(view: PlayerView, { random = Math.random, noise = 0.3 }: EasyBotOptions = {}): LegalMove {
  const legal = enumerateLegalMoves(view);
  const plays = legal.filter((move): move is Extract<LegalMove, { type: 'play' }> => move.type === 'play');
  if (plays.length === 0) return { type: 'pass' };

  const scored = plays
    .map((move) => ({ move, score: scoreEasyMove(move, view) }))
    .sort((a, b) => b.score - a.score || moveSortValue(a.move, view.levelRank) - moveSortValue(b.move, view.levelRank));

  if (scored.length > 1 && random() < noise) {
    const pool = scored.slice(1);
    return pool[Math.floor(random() * pool.length)]!.move;
  }

  return scored[0]!.move;
}

function scoreEasyMove(move: Extract<LegalMove, { type: 'play' }>, view: PlayerView): number {
  let score = 100 - rankValue(move.pattern.primaryRank, view.levelRank);
  score += move.cards.length * 2;
  if (isBombKind(move.pattern)) score -= 80;
  if (view.currentPlay && view.teamByPlayer[view.currentPlay.playerId] === view.team) score -= 30;
  return score;
}
