import type { Card } from '../game/cards.js';
import { dealCards } from '../game/deal.js';
import { createDefaultProgression, createPlayers, type Player, type PlayingState } from '../game/state.js';
import { botIdentityForSeat } from '../ai/names.js';
import type { RoomRecord } from './lifecycle.js';

export interface StartRoomGameOptions {
  deck: readonly Card[];
  fillBots: boolean;
  botDifficulty: 'easy' | 'medium';
}

export function startRoomGame(room: RoomRecord, { deck, fillBots, botDifficulty }: StartRoomGameOptions): PlayingState {
  const seats = createPlayers(room.mode, room.rules.teamStructure);
  if (!fillBots && room.players.length < seats.length) throw new Error('ERR_NOT_ENOUGH_PLAYERS');

  const roomPlayersById = new Map(room.players.map((player) => [player.id, player]));
  const players: Player[] = seats.map((seatPlayer, index) => {
    const roomPlayer = roomPlayersById.get(seatPlayer.id);
    if (roomPlayer) {
      return {
        ...seatPlayer,
        kind: 'human',
        handle: roomPlayer.handle,
        displayName: `@${roomPlayer.handle}`,
      };
    }
    return { ...seatPlayer, kind: 'bot', ...botIdentityForSeat(index, botDifficulty) };
  });
  const deal = dealCards(room.mode, players, deck);

  return {
    phase: 'playing',
    mode: room.mode,
    levelRank: '2',
    players,
    hands: deal.hands,
    undealt: deal.undealt,
    finished: [],
    currentTurn: players[0]!.id,
    currentTrick: { leader: players[0]!.id, passes: [] },
    progression: createDefaultProgression('2'),
    version: 1,
  };
}
