import { runBotTurns, type BotTurnOptions, type BotTurnRecord } from '../ai/chain.js';
import type { ServerEvent } from '../realtime/messages.js';
import { runAutomaticPhaseActions, type AutomaticPhaseAction, type AutomaticPhaseActionOptions } from './phaseAutomation.js';
import type { GameState } from './state.js';

export interface GameplayContinuationOptions extends AutomaticPhaseActionOptions {
  botChain?: BotTurnOptions | false;
}

export interface GameplayContinuationResult {
  state: GameState;
  events: ServerEvent[];
  phaseActions: AutomaticPhaseAction[];
  botMoves: BotTurnRecord[];
}

export function runGameplayContinuation(
  initialState: GameState,
  { botChain, ...phaseOptions }: GameplayContinuationOptions,
): GameplayContinuationResult {
  const phaseResult = runAutomaticPhaseActions(initialState, phaseOptions);
  const botResult = botChain === false
    ? { state: phaseResult.state, events: [] as ServerEvent[], moves: [] as BotTurnRecord[] }
    : runBotTurns(phaseResult.state, botChain ?? {});

  return {
    state: botResult.state,
    events: [...phaseResult.events, ...botResult.events],
    phaseActions: phaseResult.actions,
    botMoves: botResult.moves,
  };
}
