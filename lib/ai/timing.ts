export interface BotMoveDelayOptions {
  random?: () => number;
  minMs?: number;
  maxMs?: number;
}

export function botMoveDelayMs({
  random = Math.random,
  minMs = 800,
  maxMs = 5_500,
}: BotMoveDelayOptions = {}): number {
  const clampedMin = Math.max(0, Math.floor(minMs));
  const clampedMax = Math.max(clampedMin, Math.floor(maxMs));
  const humanSkew = (random() + random() + random()) / 3;
  const value = clampedMin + humanSkew * (clampedMax - clampedMin);
  return Math.min(clampedMax, Math.max(clampedMin, Math.round(value)));
}

export function createDeterministicRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
