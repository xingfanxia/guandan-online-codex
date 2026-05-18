import { runBotBenchmark } from '../../lib/ai/benchmark.ts';
import type { GameMode } from '../../lib/game/mode.ts';

const rounds = numberArg('ROUNDS', process.argv[2], 20);
const modeArg = process.env.MODE ?? process.argv[3];
const mode = gameModeArg(modeArg) ?? '4';
const seed = numberArg('SEED', gameModeArg(process.argv[3]) ? process.argv[4] : process.argv[3], 1);
const maxMovesPerRound = numberArg('MAX_MOVES', gameModeArg(process.argv[3]) ? process.argv[5] : process.argv[4], 300);
const botDifficulty = process.env.BOT_DIFFICULTY === 'medium' ? 'medium' : 'easy';

const result = runBotBenchmark({
  rounds,
  mode,
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

function gameModeArg(raw: string | undefined): GameMode | undefined {
  return raw === '4' || raw === '6' || raw === '8' ? raw : undefined;
}
