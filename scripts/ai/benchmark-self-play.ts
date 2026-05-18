import { runBotBenchmark } from '../../lib/ai/benchmark.ts';

const rounds = numberArg('ROUNDS', process.argv[2], 20);
const seed = numberArg('SEED', process.argv[3], 1);
const maxMovesPerRound = numberArg('MAX_MOVES', process.argv[4], 300);
const botDifficulty = process.env.BOT_DIFFICULTY === 'medium' ? 'medium' : 'easy';

const result = runBotBenchmark({
  rounds,
  seed,
  maxMovesPerRound,
  botDifficulty,
});

console.log(JSON.stringify(result, null, 2));
if (result.failed > 0) process.exitCode = 1;

function numberArg(envName: string, arg: string | undefined, fallback: number): number {
  const raw = process.env[envName] ?? arg;
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
