import { describe, expect, test } from 'vitest';
import { generateDoubleDeck } from '../../lib/game/cards';
import { createPlayers, type PlayingState } from '../../lib/game/state';
import { startBotRound, runBotRound } from '../../lib/ai/selfPlay';

describe('bot self-play integration', () => {
  test('four Easy bots can complete a 4P round without illegal moves', () => {
    const initial = startBotRound({
      deck: generateDoubleDeck(),
      botDifficulty: 'easy',
    });

    const result = runBotRound(initial, { maxMoves: 300, random: () => 0.9 });

    expect(result.state).toMatchObject({ phase: 'round-end' });
    expect(result.moves.length).toBeGreaterThan(0);
    expect(result.events.at(-1)).toMatchObject({ type: 'round_end' });
  });

  test('throws if the self-play round exceeds the move budget', () => {
    const players = createPlayers('4').map((player) => ({ ...player, kind: 'bot' as const, botDifficulty: 'easy' as const }));
    const stuck: PlayingState = {
      phase: 'playing',
      mode: '4',
      levelRank: '2',
      players,
      hands: {
        p1: [],
        p2: [],
        p3: [],
        p4: [],
      },
      undealt: [],
      finished: [],
      currentTurn: 'p1',
      currentTrick: { leader: 'p1', passes: [] },
      version: 1,
    };

    expect(() => runBotRound(stuck, { maxMoves: 1 })).toThrow('ERR_BOT_ROUND_STUCK');
  });
});
