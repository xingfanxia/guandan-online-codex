import { generateDoubleDeck, shuffleDeck } from '../game/cards.js';
import type { TeamKey } from '../game/mode.js';
import type { Player } from '../game/state.js';
import { createDeterministicRandom } from './timing.js';
import { runBotRound, startBotRound } from './selfPlay.js';

export interface BotBenchmarkOptions {
  rounds?: number;
  seed?: number;
  botDifficulty?: NonNullable<Player['botDifficulty']>;
  maxMovesPerRound?: number;
}

export interface BotBenchmarkFailure {
  round: number;
  error: string;
}

export interface BotBenchmarkResult {
  rounds: number;
  completed: number;
  failed: number;
  botDifficulty: NonNullable<Player['botDifficulty']>;
  totalMoves: number;
  averageMoves: number;
  winnerTeams: Record<TeamKey, number>;
  failures: BotBenchmarkFailure[];
}

export function runBotBenchmark({
  rounds = 20,
  seed = 1,
  botDifficulty = 'easy',
  maxMovesPerRound = 300,
}: BotBenchmarkOptions = {}): BotBenchmarkResult {
  const safeRounds = Math.max(1, Math.floor(rounds));
  const winnerTeams: Record<TeamKey, number> = { t1: 0, t2: 0, t3: 0, t4: 0 };
  const failures: BotBenchmarkFailure[] = [];
  let completed = 0;
  let totalMoves = 0;

  for (let index = 0; index < safeRounds; index++) {
    const random = createDeterministicRandom(seed + index);
    const deck = shuffleDeck(generateDoubleDeck(), random);
    const initial = startBotRound({ deck, botDifficulty });

    try {
      const result = runBotRound(initial, { maxMoves: maxMovesPerRound, random });
      if (result.state.phase !== 'round-end') throw new Error('ERR_BENCHMARK_NOT_ROUND_END');
      completed += 1;
      totalMoves += result.moves.length;
      winnerTeams[result.state.winnerTeam] += 1;
    } catch (error) {
      failures.push({
        round: index + 1,
        error: error instanceof Error ? error.message : 'ERR_UNKNOWN_BENCHMARK_FAILURE',
      });
    }
  }

  return {
    rounds: safeRounds,
    completed,
    failed: failures.length,
    botDifficulty,
    totalMoves,
    averageMoves: completed === 0 ? 0 : Math.round((totalMoves / completed) * 100) / 100,
    winnerTeams,
    failures,
  };
}
