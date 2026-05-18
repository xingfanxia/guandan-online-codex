import { rankValue } from '../../game/cards';
import { isBombKind } from '../../game/bomb';
import {
  enumerateLegalMoves,
  removeCardsFromHand,
  type LegalMove,
  type PlayerView,
} from '../engine';

export function mediumBotMove(view: PlayerView): LegalMove {
  const legal = enumerateLegalMoves(view);
  const pass = legal.find((move) => move.type === 'pass');
  if (pass && view.currentPlay && view.teamByPlayer[view.currentPlay.playerId] === view.team) return pass;

  const plays = legal.filter((move): move is Extract<LegalMove, { type: 'play' }> => move.type === 'play');
  if (plays.length === 0) return pass ?? { type: 'pass' };

  return plays
    .map((move) => ({ move, score: scoreMediumMove(move, view) }))
    .sort((a, b) => a.score - b.score)[0]!.move;
}

function scoreMediumMove(move: Extract<LegalMove, { type: 'play' }>, view: PlayerView): number {
  const remaining = removeCardsFromHand(view.hand, move.cards);
  let score = estimateHandCost(remaining) * 100;
  score += rankValue(move.pattern.primaryRank, view.levelRank) * 0.1;
  score -= move.cards.length * 3;
  if (isBombKind(move.pattern) && !view.currentPlay) score += 100;
  return score;
}

function estimateHandCost(hand: readonly unknown[]): number {
  return hand.length;
}
