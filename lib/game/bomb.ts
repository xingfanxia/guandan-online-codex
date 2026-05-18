import type { Pattern } from './patterns.js';

export function isBombKind(pattern: Pattern): boolean {
  return pattern.kind === 'bomb' || pattern.kind === 'straightFlush' || pattern.kind === 'jokerBomb';
}

export function bombPower(pattern: Pattern): number {
  if (pattern.kind === 'jokerBomb') return 1000;
  if (pattern.kind === 'straightFlush') return 450;
  if (pattern.kind === 'bomb') {
    return pattern.length >= 6 ? 500 + pattern.length * 20 : 100 + pattern.length * 20;
  }
  return 0;
}
