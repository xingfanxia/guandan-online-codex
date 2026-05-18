import type { GameState } from '../game/state';

type MaybePromise<T> = T | Promise<T>;

export interface GameStateStore {
  get(roomId: string): MaybePromise<GameState | undefined>;
  set(roomId: string, state: GameState): MaybePromise<void>;
}

export class MemoryGameStateStore implements GameStateStore {
  private readonly states: Map<string, GameState>;

  constructor(entries: Iterable<[string, GameState]> = []) {
    this.states = new Map(entries);
  }

  get(roomId: string): GameState | undefined {
    const state = this.states.get(roomId);
    return state ? cloneState(state) : undefined;
  }

  set(roomId: string, state: GameState): void {
    this.states.set(roomId, cloneState(state));
  }
}

function cloneState<T extends GameState>(state: T): T {
  return JSON.parse(JSON.stringify(state)) as T;
}
