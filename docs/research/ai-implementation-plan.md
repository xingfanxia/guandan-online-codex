# AI Implementation Plan — Guandan Online

**Status**: Implementation-ready (2026-05-16). Consumes the locked decisions from [`SUMMARY.md`](SUMMARY.md) and the engine survey in [`ai-strategies.md`](ai-strategies.md). Audience: senior engineer writing the bot system + player-assistance features in v1.

**Scope**: AI bot opponents (Scope A) and player-facing assistance features (Scope B) share a single engine (`lib/ai/engine.ts`) — same suggestion algorithm powers a Medium bot and the human's "提示" button. Cross-cutting concerns (file layout, latency budgets, testing, cost) at the end (Scope C).

**Hard prerequisites already locked in**:
- Transport: Vercel SSE+POST + Upstash Redis pub/sub. Bots run inline in the POST handler. See [`architecture-options.md`](architecture-options.md) § "Decision — 2026-05-16".
- Engine pedigree: Easy/Medium = TS lifts from `zdhgg/Guandan-training` (MIT) + WASM solver from `Bobgy/poker-guandan-strategy`. Hard = DeepSeek with candidate pre-filter. Expert (DanLM) deferred to v1.1.
- Rules engine: port `hash-panda/guandan-guide` pattern recognition; reuse `../guandan-scorer/src/game/` progression / A-level logic.

---

## Tier overview (cheat sheet)

| Tier | UI name | Engine | Per-move latency | $/game | Ships v1 | 6/8-player |
|---|---|---|---|---|---|---|
| Easy | 入门 | Rule-based with 30% temperature noise | <20ms | $0 | Yes | Yes |
| Medium | 进阶 | Rule-based + WASM solver | <80ms | $0 | Yes | Yes |
| Hard | 高手 | DeepSeek with candidate pre-filter | 1.5–3s | $0.01–0.05 | Yes | **4-player only** |
| Master | 大师 | DanLM neural net (ONNX) | ~3s budget | $0 (self-host) | **No (v1.1)** | No |

Player-facing tier name in `index.html` shows 入门 / 进阶 / 高手 / 大师 (大师 grayed out with "v1.1" badge).

---

# Scope A · AI bot opponent strategy

## 1. Algorithm per tier — concrete pseudocode

### 1.1 Easy (入门) — rule-based + 30% noise

The Easy bot's identity is **inconsistency**. It makes legal moves but introduces random noise so the player wins ~70% of the time when paired with a Medium bot partner. The fail mode we are intentionally creating: it will occasionally bomb out partners, pass when it should play, and play singles when it could clear a pair.

```ts
// lib/ai/bots/easy.ts
import type { GameState, PlayerView, Move } from '@/lib/types';
import { enumerateLegalMoves } from '@/lib/ai/engine';

const NOISE_TEMPERATURE = 0.3;  // 30% of moves are non-optimal

export function easyBotMove(view: PlayerView): Move {
  const legal = enumerateLegalMoves(view);  // includes 'pass' as a candidate when applicable

  // Score each candidate with a simple heuristic
  const scored = legal.map(move => ({
    move,
    score: scoreEasyMove(move, view),
  }));
  scored.sort((a, b) => b.score - a.score);

  // 30% chance pick non-optimal; 70% pick best
  if (Math.random() < NOISE_TEMPERATURE) {
    // Sample randomly from the bottom 80% of candidates
    const pool = scored.slice(Math.floor(scored.length * 0.2));
    return pool[Math.floor(Math.random() * pool.length)].move;
  }
  return scored[0].move;
}

function scoreEasyMove(move: Move, view: PlayerView): number {
  if (move.kind === 'pass') {
    // Pass is fine if we have nothing > current; bad if we have a clearly winning play
    return view.currentTrickWinner === view.partnerSeat ? 5 : 1;
  }
  // Prefer smallest legal combo (clears low cards, keeps high cards for later)
  let score = 100 - move.rankValue;
  // Penalize bombs heavily — Easy never bombs proactively unless forced
  if (move.isBomb) score -= 50;
  // Slight bonus for clearing more cards at once (efficiency)
  score += move.cards.length * 2;
  return score;
}
```

**Strength signal**: in self-play vs Medium, Easy should lose ~70% of games. Verified via the bench harness in §18.

### 1.2 Medium (进阶) — rule-based + WASM solver + partner awareness

Medium is the **competent club player**. Always picks the move that minimizes future rounds-to-empty-hand (via Bobgy's WASM solver), and defers to a partner who is in 1st place.

```ts
// lib/ai/bots/medium.ts
import { enumerateLegalMoves, callWasmSolver } from '@/lib/ai/engine';
import { decidePartnerCoop } from '@/lib/ai/partnerStrategy';

export async function mediumBotMove(view: PlayerView): Promise<Move> {
  const legal = enumerateLegalMoves(view);

  // Cooperative early-exit: if partner is winning the current trick, pass with high cards
  const coop = decidePartnerCoop(view);
  if (coop === 'support-partner') {
    const pass = legal.find(m => m.kind === 'pass');
    if (pass) return pass;
  }

  // For each candidate move, compute "rounds-to-empty-hand" after applying it
  const scored = await Promise.all(legal.map(async move => {
    if (move.kind === 'pass') {
      return { move, cost: scorePass(view) };
    }
    const handAfter = removeCards(view.myHand, move.cards);
    const cost = await callWasmSolver(handAfter, view.currentLevel, /* wildcardsLeft */ countWildcards(handAfter, view.currentLevel));
    return { move, cost };
  }));

  // Pick the play that minimizes remaining rounds (lowest cost = best)
  scored.sort((a, b) => a.cost - b.cost);

  // Tie-break: among equal-cost moves, prefer ones that don't burn high cards
  const best = scored[0];
  const ties = scored.filter(s => Math.abs(s.cost - best.cost) < 0.1);
  if (ties.length > 1) {
    ties.sort((a, b) => avgRank(a.move.cards) - avgRank(b.move.cards));  // lower-rank ties first
    return ties[0].move;
  }
  return best.move;
}

function scorePass(view: PlayerView): number {
  // Passing is "cost 0" if we can't beat current play; "cost +5" if we can but choose not to
  const canBeat = enumerateLegalMoves(view).some(m => m.kind !== 'pass');
  return canBeat ? 5 : 0;
}
```

**Critical implementation note**: The WASM solver returns "minimum hands to clear" as a float (bombs count as 0.0, normal hands as 1.0). Each `callWasmSolver` invocation is 5–20ms for a 27-card hand. With 5–15 legal candidates per turn × 15ms avg = 75–225ms worst case. Budget: 80ms is the target — if the candidate set is large, we batch the solver calls (Bobgy's WASM accepts a single hand, so batching means parallelism via `Promise.all` on the same WASM instance — safe because `strategy.cpp` is pure-functional). If we still blow the budget, fall back to scoring only the top 5 by `move.rankValue`.

### 1.3 Hard (高手) — DeepSeek LLM with candidate pre-filter

The Hard bot **judges**, not searches. It uses the same engine as Medium to enumerate 5–10 candidate plays, attaches tactical metadata to each, and asks an LLM to pick. The LLM never invents moves — it only picks among legal candidates, so it cannot make catastrophic errors. The trade-off: $0.01–0.05 per game, 1.5–3s latency, vulnerable to LLM nondeterminism.

```ts
// lib/ai/bots/hard.ts
import { generateText } from 'ai';
import { deepseek } from '@ai-sdk/deepseek';
import { enumerateLegalMoves, annotateCandidate } from '@/lib/ai/engine';
import { HARD_SYSTEM_PROMPT, buildUserPrompt } from '@/lib/ai/prompts/hard.zh';

const HARD_TIMEOUT_MS = 3000;

export async function hardBotMove(view: PlayerView): Promise<Move> {
  const allLegal = enumerateLegalMoves(view);

  // Score with Medium-tier engine first; take top 8
  const topCandidates = await pickTopN(allLegal, view, 8);
  const annotated = topCandidates.map(c => annotateCandidate(c, view));

  try {
    const { text } = await generateText({
      model: deepseek('deepseek-chat'),
      system: HARD_SYSTEM_PROMPT,
      prompt: buildUserPrompt(view, annotated),
      temperature: 0.3,
      maxTokens: 200,
      abortSignal: AbortSignal.timeout(HARD_TIMEOUT_MS),
    });
    const choice = parseLLMChoice(text, annotated);
    if (choice) return choice;
  } catch (e) {
    console.warn('Hard bot LLM failed, falling back to Medium', e);
  }
  // Fallback: never throw — degrade silently to Medium-tier pick
  return topCandidates[0];
}

function parseLLMChoice(text: string, candidates: AnnotatedMove[]): Move | null {
  // Expect format: "选择: 3" or "Choice: 3" — accept either index or "pass" keyword
  const m = text.match(/(?:选择|choice)\s*[:：]\s*(\d+|pass|过)/i);
  if (!m) return null;
  const token = m[1].toLowerCase();
  if (token === 'pass' || token === '过') {
    return candidates.find(c => c.kind === 'pass') || null;
  }
  const idx = parseInt(token, 10) - 1;
  return candidates[idx] || null;
}
```

**Prompt template** (`lib/ai/prompts/hard.zh.md`):

```markdown
# SYSTEM
你是掼蛋顶级牌手。你的搭档和你一队，需要团队配合获胜。

判断原则（按重要性排序）：
1. 队友领先时（搭档已出完或剩1-2张），不要抢牌——让队友顺手
2. 自己手中炸弹/同花顺/王炸是关键，能压制对手翻盘
3. 出牌目标是清空手牌，但要保留关键大牌应对终局
4. A级局面（任一队在A）时，必须更激进——错失一手等于失败

你只能从下面提供的候选出牌中选一个，不能自创出牌。

输出格式（严格遵守，禁止解释）：
选择: <数字>
理由: <十字以内>
```

```markdown
# USER (built dynamically)
当前局面：
- 我的座位：{seat}（{teamName}队）
- 当前级别：我方 {ourLevel}，对手 {oppLevel}{aLevelNote}
- 队友座位：{partnerSeat}，剩 {partnerCards} 张
- 对手座位：{opp1Seat}（剩 {opp1Cards} 张），{opp2Seat}（剩 {opp2Cards} 张）
- 我的手牌：{myHand}
- 红心{currentLevel}（万能牌）：{wildcardsInHand} 张在我手里

当前出牌历史（本轮）：
{trickHistory}

需要应对的牌型：{currentLeadingPlay}

候选出牌：
1. {candidate1.description} — {candidate1.signal}
2. {candidate2.description} — {candidate2.signal}
...
8. {candidate8.description} — {candidate8.signal}

(其中至少一个是"过"，即不出牌)
```

**Cost**: ~600 tokens in / ~30 out per move. DeepSeek 2026 pricing → ~$0.0001/move × 50–150 moves = $0.005–0.045/game (see §18).

**Failure modes covered by fallback**: LLM picks non-existent option (regex fails) → fallback. Timeout → `AbortSignal.timeout` → fallback. DeepSeek down → catch → fallback. LLM verbose without "选择:" → regex fails → fallback. The Hard bot can't crash — worst case it silently degrades to Medium.

### 1.4 Master (大师) — design intent only

Deferred to v1.1. The architecture leaves a `lib/ai/bots/master.ts` stub:

```ts
// lib/ai/bots/master.ts — v1.1 — DO NOT IMPLEMENT IN V1
// Design intent (no code yet):
//
// 1. Run ONNX export of DanLM Transformer via onnxruntime-node (server-side) or
//    onnxruntime-web (client-side, but 47MB blob is too heavy for v1).
// 2. Tokenize current game history into ~90 vocab tokens.
// 3. Run Q-value head: produce Q(s, a) for every legal action.
// 4. Apply temperature 0.05 sampling (near-deterministic argmax) or softmax with
//    eps_top_k = 3 for slight variability.
// 5. Latency budget: ~3s. Same UX as Hard tier.
//
// Open questions:
// - DanLM's tokenizer is shipped as macOS-only .so. Linux build or ONNX-only
//   export still TBD (gh issue open with author).
// - Apache-2-NC license blocks commercial use. Confirm AX is OK with
//   "personal/research" framing for v1.1.

export async function masterBotMove(view: PlayerView): Promise<Move> {
  throw new Error('Master tier not yet shipped — use Hard or wait for v1.1');
}
```

---

## 2. State representation for bots

Bots are **first-class clients**. Same hidden-state filtering as humans. They never see other players' hands. The server constructs a `PlayerView` for each player (human or bot) and passes it to the move function.

### 2.1 GameState (full, server-only)

```ts
// lib/types.ts
export interface GameState {
  roomCode: string;
  mode: '4' | '6' | '8';
  currentLevel: Rank;       // '2'..'A'
  ourTeam: 'red' | 'blue';
  teamLevels: Record<'red' | 'blue', Rank>;
  aFailCounts?: Record<'red' | 'blue', number>;  // 4-player only
  roundOwner: 'red' | 'blue' | null;
  roundLevel: Rank;

  seats: Seat[];            // up to 8 seats
  players: Record<string, Player>;  // seat → player

  hands: Record<string, Card[]>;    // SERVER ONLY — bots never see other hands
  trick: Trick;             // current trick state (history of plays in this hand)
  handHistory: Trick[];     // completed tricks this hand
  finishingOrder: string[]; // who has gone out, in order

  // Tribute state (if applicable)
  tributePhase: TributePhase | null;
}
```

### 2.2 PlayerView (filtered, what each bot receives)

```ts
export interface PlayerView {
  // Public info (everyone sees)
  roomCode: string;
  mode: '4' | '6' | '8';
  currentLevel: Rank;
  teamLevels: Record<'red' | 'blue', Rank>;
  roundOwner: 'red' | 'blue' | null;
  roundLevel: Rank;
  seats: Seat[];
  players: Record<string, PublicPlayer>;  // seat, displayName, isBot, tier, cardsLeft
  trick: PublicTrick;       // all plays + passes this trick
  handHistory: PublicTrick[];
  finishingOrder: string[];

  // Player-specific (only this player sees)
  mySeat: string;
  myHand: Card[];          // only mine
  myTeam: 'red' | 'blue';
  partnerSeat: string | null;  // 4-player: 1 partner; 6/8: array, see below
  partnerSeats: string[];      // generalized (4-player has length 1; 8-player has length 1; 6-player has length 1)

  // Derived signals (server computes these for both bots and human clients)
  signals: {
    iAmCurrentTrickWinner: boolean;
    partnerIsCurrentTrickWinner: boolean;
    teammateNearFinish: boolean;       // any teammate ≤3 cards
    opponentCritical: boolean;         // any opponent ≤3 cards
    aLevelActive: boolean;             // either team at A
    aLevelIsMine: boolean;             // my team at A (regardless of round owner)
    aLevelIsMyRound: boolean;          // strict mode: my team at A AND roundOwner === myTeam
  };
}
```

### 2.3 Per-bot private state

By default bots are **stateless across turns**. Each move is computed fresh from `PlayerView`. The view already contains the trick history this hand, so the bot can re-derive "what high cards have been seen" without local memory.

For tiers that benefit from remembering across the entire game (e.g., counting played wildcards across multiple hands of the same game), we use Redis-backed per-bot scratch state keyed by `bot:{roomCode}:{seat}`. Easy and Medium do not use this. Hard uses it for one signal: `wildcardsPlayed` per game (the LLM is told "对手已用过 X 张红心万能牌"). At most ~50 bytes per bot.

```ts
// lib/ai/scratch.ts — only Hard tier uses this
export async function getBotScratch(roomCode: string, seat: string): Promise<BotScratch> {
  const key = `bot:${roomCode}:${seat}`;
  const raw = await kv.get<BotScratch>(key);
  return raw ?? { wildcardsPlayed: 0, bombsPlayedByOpponents: 0 };
}
```

### 2.4 Public observation log

The `trick` and `handHistory` arrays are the **canonical observation log**. Every play, pass, tribute, level change, and going-out event is recorded with seat + timestamp. Bots derive everything they need from these arrays — there is no separate "what bots see" log. The same arrays are what human clients render in the trick history strip.

---

## 3. Partner-aware play (4-player specific)

Partner cooperation is the **single hardest judgment call** in Guandan, and the main thing that separates Easy from Medium and Medium from Hard. Bots that miss this feel "robotic."

### 3.1 The decision matrix

| Situation | Partner finished | Partner ≤3 cards | Partner >3 cards |
|---|---|---|---|
| Partner winning trick | I lead next independently | Pass with low cards | Pass; smallest play |
| Partner responding | I beat or hold | Beat if cheap | Keep them alive |
| Opponent leading | Race aggressively | Beat with low rank | Beat only with spares |

### 3.2 Cooperation logic in code

```ts
// lib/ai/partnerStrategy.ts
import type { PlayerView } from '@/lib/types';

export type CoopMode = 'support-partner' | 'race-to-out' | 'block-opponent' | 'neutral';

export function decidePartnerCoop(view: PlayerView): CoopMode {
  // In 4-player only — for 6/8, partner relationships are different
  if (view.mode !== '4') return 'neutral';

  const { signals, trick, partnerSeat } = view;

  // Case 1: Partner is winning the current trick — DEFER
  if (signals.partnerIsCurrentTrickWinner) {
    // Don't snatch the lead from partner unless they're about to lose it
    const opponentsLeft = view.seats.filter(s =>
      !view.finishingOrder.includes(s) && s !== view.mySeat && s !== partnerSeat
    );
    const opponentsCouldBeat = opponentsLeft.length > 0;  // simplification — always true mid-game
    return 'support-partner';
  }

  // Case 2: Partner has gone out already (good position) and we're at A-level
  if (view.finishingOrder.includes(partnerSeat!) && signals.aLevelIsMine) {
    return 'race-to-out';  // Get to position 2 to lock in the A pass
  }

  // Case 3: Opponent is critical (≤3 cards) — bomb them if we have one
  if (signals.opponentCritical && hasBombInHand(view)) {
    return 'block-opponent';
  }

  // Default: play for own clearance
  return 'neutral';
}

function hasBombInHand(view: PlayerView): boolean {
  // Same logic as engine.detectBombs(view.myHand) — checks for ≥4 same-rank or joker bomb
  // ...
}
```

This wrapper is consumed by `mediumBotMove` and `hardBotMove`. `easyBotMove` ignores it (intentionally — that's why it occasionally bombs out partners).

### 3.3 Hard tier inherits cooperation via prompt

For Hard, the LLM gets the signals in plain text:

```
- 队友座位：south，剩 2 张
- 当前出牌历史：
  west: 对子 5
  north(队友): 对子 9 [当前最大]
  east: 过
```

The system prompt's rule #1 ("队友领先时不要抢牌") tells the LLM to pass. With temperature 0.3, this is reliable in practice — DeepSeek picks "过" >90% of the time when partner is leading.

---

## 4. 6 & 8 player mode (multi-team)

### 4.1 Tier coverage

- **Easy and Medium**: 4/6/8 modes
- **Hard**: 4-player only at v1
- **Master**: 4-player only when shipped

The Hard prompt's mental model (1 partner + 2 opponents) doesn't transfer cleanly to 6-player (1 partner + 4 opponents from 2 different teams) without significant rework. We ship Easy/Medium for 6/8 at launch and add Hard for 6/8 in a follow-up if there's demand. The UI labels Hard as "4-player only" for 6/8 rooms.

### 4.2 Team awareness in 6/8 mode

The state already carries team membership per seat. Bots access via `view.players[seat].team`. The `partnerSeats` array generalizes "who's on my team that hasn't finished yet" — length 1 for 4-player, length up to 2 for 6-player (3-person teams), length up to 3 for 8-player (4-person teams).

**Critical anti-pattern to prevent**: bombing your own teammate. Add a guard in Medium that filters bomb plays by "would this bomb beat a teammate's lead?":

```ts
// lib/ai/bots/medium.ts (extension)
function isFriendlyBomb(move: Move, view: PlayerView): boolean {
  if (!move.isBomb) return false;
  // Is the current trick's top play from a teammate?
  const topPlayer = view.trick.currentTopPlayerSeat;
  if (!topPlayer) return false;
  const topPlayerTeam = view.players[topPlayer]?.team;
  return topPlayerTeam === view.myTeam && topPlayer !== view.mySeat;
}
```

In `mediumBotMove`, filter out friendly bombs unless `signals.aLevelIsMine && cards-remaining ≤ N` (endgame escape hatch).

### 4.3 8-player sweep bonus strategy

The +4 sweep bonus (1-2-3-4 from same team) is huge but rarely achievable. **Bots do not actively target it.** Reasoning:

1. Sweep requires coordinated effort across 4 teammates. A single bot can't drive it.
2. Aiming for sweep when partner is in 2nd often costs more than the bonus is worth (you sacrifice cards trying to get teammate 3 and 4 ahead of opponents 1 and 2).
3. The simpler heuristic — "just get 1st, take any partner position" — is near-optimal.

Bots play as if no sweep existed. If sweep happens, great. The decision was researched but the engine doesn't change behavior.

### 4.4 6-player partner detection edge case

In 6-player, teams are 3 players each. The `partnerSeats` array can have 0, 1, or 2 entries depending on who's gone out. When deciding cooperation:

```ts
function partnerInLead(view: PlayerView): boolean {
  const topPlayer = view.trick.currentTopPlayerSeat;
  return view.partnerSeats.includes(topPlayer);
}
```

The rest of partner logic generalizes cleanly — "any teammate is winning" is the trigger, not "the specific partner."

---

## 5. Bot timing & realism

Humans don't play instantly. Synchronous 0ms bot moves feel like cheating — players see opponents "snap-play" cards and lose immersion. Worse, perfectly-timed bot play creates a tell: if Easy always takes 8s on "hard" decisions and 1s on "easy" ones, opponents can infer hand strength from timing.

### 5.1 Delay schedule

| Decision type | Min | Max | Distribution |
|---|---|---|---|
| Pass (no legal play) | 800ms | 2200ms | Uniform |
| Single card | 1200ms | 3500ms | Beta(2,3) — biased toward fast |
| Pair / Triple | 1500ms | 4500ms | Beta(2,2) — symmetric |
| Bomb / Joker bomb | 2500ms | 5500ms | Beta(3,2) — biased toward slow |
| Endgame (≤5 cards) | 2000ms | 4000ms | Uniform |

```ts
// lib/ai/timing.ts
const DELAY_RANGES = {
  pass: { min: 800, max: 2200, alpha: 1, beta: 1 },
  single: { min: 1200, max: 3500, alpha: 2, beta: 3 },
  pair: { min: 1500, max: 4500, alpha: 2, beta: 2 },
  triple: { min: 1500, max: 4500, alpha: 2, beta: 2 },
  bomb: { min: 2500, max: 5500, alpha: 3, beta: 2 },
  endgame: { min: 2000, max: 4000, alpha: 1, beta: 1 },
};

export function botDelay(move: Move, view: PlayerView): number {
  let bucket = 'single';
  if (view.myHand.length <= 5) bucket = 'endgame';
  else if (move.kind === 'pass') bucket = 'pass';
  else if (move.isBomb) bucket = 'bomb';
  else if (move.cards.length === 2) bucket = 'pair';
  else if (move.cards.length === 3) bucket = 'triple';

  const { min, max, alpha, beta } = DELAY_RANGES[bucket];
  const sample = betaSample(alpha, beta);  // returns 0..1
  return Math.floor(min + sample * (max - min));
}
```

### 5.2 Anti-tell + thinking indicator

5% chance of doubling the delay on otherwise-fast plays breaks the "fast = trivial decision" tell. UX: bot's seat avatar shows a pulsing dot + "思考中..." caption during the delay — rendered by clients from the SSE `bot_thinking` event the server emits before sleeping.

The delay is server-side (single source of truth — client clocks differ; per-client delays would desync). See §7 for how `setTimeout` lives in the POST handler.

---

## 6. N humans + (rest = bots) mixing

Bots are full first-class clients. The room state doesn't distinguish "bot turn" from "human turn" — it's the same `processMove(seat, move)` code path.

### 6.1 Room creation UX

Room creation modal lets host choose how many AI seats and their tier:

```
模式: ○4-player ●6-player ○8-player

座位配置 (6人模式):
  座位 1 (我): 主机 (我)
  座位 2: ●人类  ○入门  ○进阶  ○高手
  座位 3: ○人类  ●入门  ○进阶  ○高手
  座位 4: ○人类  ○入门  ●进阶  ○高手
  座位 5: ○人类  ○入门  ●进阶  ○高手
  座位 6: ●人类  ○入门  ○进阶  ○高手  [房间码邀请]
```

Bot seats are filled immediately when the host creates the room. Human seats wait for join via room code. Once all seats are occupied (humans or bots), the game starts.

### 6.2 Auto-generated bot names

Generate friendly Chinese names from a pool of 30:

```ts
// lib/ai/botNames.ts
const BOT_NAMES = [
  '小李', '小张', '老王', '阿明', '豆豆', '毛毛', '阿强', '小芳',
  '老周', '阿凯', '小翔', '阿杰', '小敏', '阿琳', '小雪', '阿俊',
  '小军', '阿松', '小辉', '阿勇', '小燕', '阿涛', '小峰', '阿斌',
  '小亮', '阿春', '小辰', '阿静', '小晨', '阿莉',
];

export function pickBotName(usedNames: Set<string>): string {
  const available = BOT_NAMES.filter(n => !usedNames.has(n));
  if (available.length === 0) return `Bot${Math.floor(Math.random() * 1000)}`;
  return available[Math.floor(Math.random() * available.length)];
}
```

Bot @handles use the format `@{name}{tier}` e.g. `@小李.入门` or `@阿明.进阶` — clearly distinguishable from human handles like `@fufu`.

### 6.3 Visual bot indicator

Every bot's seat shows a chip badge in the lobby AND the game UI:

```html
<div class="seat seat--bot">
  <div class="seat__avatar">🤖</div>
  <div class="seat__name">阿明</div>
  <div class="seat__badge seat__badge--tier-medium">BOT · 进阶</div>
</div>
```

CSS: `.seat__badge--tier-easy` = green, `--tier-medium` = blue, `--tier-hard` = purple. The chip is always visible, never hidden under hover. **No "deceptive bot" mode** — players should always know who they're playing against.

### 6.4 Turn ordering — bots take their turn like humans

The SSE+POST loop is agnostic. When the room's `currentTurnSeat` is a bot, the POST handler that processed the previous move sees this in the state transition and schedules the bot move inline (§7). No separate "bot tick" or polling needed.

### 6.5 Mid-game bot takeover (human DC > 60s)

```ts
// api/disconnect-watcher.ts (cron, every 30s)
export async function checkDisconnections() {
  const rooms = await listActiveRooms();
  for (const room of rooms) {
    for (const seat of room.seats) {
      const player = room.players[seat];
      if (player.isBot) continue;
      const lastSeen = player.lastSseHeartbeat;
      if (Date.now() - lastSeen > 60_000) {
        await convertSlotToBot(room.roomCode, seat, room.settings.dropoutBotTier ?? 'medium');
      }
    }
  }
}
```

When a slot converts to bot:
1. Update KV state: `players[seat].isBot = true; players[seat].tier = 'medium';`
2. Emit SSE event `player_dropped` to remaining humans
3. If it's currently this seat's turn, schedule the bot move immediately

If the human reconnects within the same hand: they reclaim the slot via `POST /api/reclaim/{roomCode}` with their original token. The bot is removed; the original player resumes. If the human reconnects after the hand ends, they have to rejoin as a spectator (until the next session).

Host can configure the dropout-takeover tier in room settings (default: Medium).

### 6.6 Anti-cheat — bots don't see hidden state

Bots receive `PlayerView`, not `GameState`. Same filtering as humans. There is **no shortcut path** for bots — they go through `buildClientPayload(playerId, eventType, payload)` (the central hidden-state filter from `SUMMARY.md` § "Key risks #1"). If we add a code path where a bot reads `gameState.hands[otherSeat]` directly, the hidden-state unit test (§17) will catch it.

---

## 7. Inline execution in Vercel POST handler

This is the **single most important architectural decision** specific to AI bots on the Vercel SSE+POST stack. Done right, it costs nothing. Done wrong, it adds 500ms–5s latency per bot move (the cost we explicitly rejected in `architecture-options.md`).

### 7.1 The handler shape

```ts
// api/move.ts
import { kv } from '@vercel/kv';
import { publish } from '@/lib/redis-pubsub';
import { validateMove, applyMove, isGameOver } from '@/lib/game/engine';
import { buildClientPayload } from '@/lib/game/payloadFilter';
import { computeBotMove } from '@/lib/ai/dispatch';
import { botDelay } from '@/lib/ai/timing';

const TOTAL_BUDGET_MS = 10_000;  // chain at most ~10s of bot work before deferring

export async function POST(req: Request) {
  const start = Date.now();
  const { roomCode, playerToken, move } = await req.json();

  let state = await kv.get<GameState>(`room:${roomCode}`);
  if (!state) return new Response('Room not found', { status: 404 });

  // 1. Process the human's move first
  const result = validateMove(state, playerToken, move);
  if (!result.ok) return new Response(result.error, { status: 400 });
  state = applyMove(state, move);
  await persistAndBroadcast(state);

  // 2. While the next turn is a bot AND we're under budget, chain bot moves inline
  while (
    state.players[state.currentTurnSeat]?.isBot &&
    Date.now() - start < TOTAL_BUDGET_MS &&
    !isGameOver(state)
  ) {
    const botView = buildClientPayload(state.currentTurnSeat, 'move_request', state);
    const botMove = await computeBotMove(botView, state.players[state.currentTurnSeat].tier);

    // Schedule the move with natural delay
    const delay = botDelay(botMove, botView);

    // If even the delay would exceed budget, defer to the tick endpoint
    if (Date.now() - start + delay > TOTAL_BUDGET_MS) {
      await scheduleNextTick(roomCode, delay);
      break;
    }

    // Emit "thinking" event, sleep, then publish the actual move
    await publish(`room:${roomCode}`, {
      type: 'bot_thinking',
      seat: state.currentTurnSeat,
      estimatedMs: delay,
    });
    await sleep(delay);

    state = applyMove(state, { ...botMove, seat: state.currentTurnSeat });
    await persistAndBroadcast(state);
  }

  return new Response('OK');
}

async function persistAndBroadcast(state: GameState) {
  await kv.set(`room:${state.roomCode}`, state, { ex: 3600 });
  await publish(`room:${state.roomCode}`, { type: 'state_update', state });
}
```

### 7.2 The 10-second chain budget

Why 10s and not 300s (Vercel's Fluid Compute limit)?

- A POST request that takes 30s feels broken to the human who initiated it. They see "loading..." on their move button for 30s.
- Holding 100 concurrent POST handlers open for 30s each is wasteful even if it works.
- 10s = ~3 bot moves with delays. After 3, defer the rest to a separate "tick" handler.

### 7.3 The tick handler — for long bot chains

When `TOTAL_BUDGET_MS` is exhausted with bot turns remaining, `scheduleNextTick(roomCode, delay)` runs `setTimeout` → internal `fetch('/api/tick', {x-internal-secret})`. `api/tick.ts` validates the secret, loads room state, and re-enters the same chain logic extracted to `lib/ai/chainBotMoves.ts`.

**Failure mode** — the function instance might be reaped before `setTimeout` fires. Defense: also enqueue a Redis message that a long-lived SSE handler consumes and re-invokes the tick. Accept potential duplicates (idempotent move IDs handle that — see [`realtime-sync-deep-dive.md`](realtime-sync-deep-dive.md)); a duplicate tick is far better than a stalled game.

### 7.4 Worked examples

**Common case** (4-player, 1 bot, human plays before bot turn): human POST processes its move (~20ms), enters chain, computes Medium bot move (~80ms), sleeps 2400ms, publishes — POST returns in ~2500ms. Smooth.

**Long chain** (8-player, 6 bots, human plays before 5 consecutive bot turns): handler processes bots 1–3 inline (~8s total), bot 4's delay would breach the 10s budget → `scheduleNextTick` hands off, POST returns at ~8.2s, tick handler picks up bots 4–5 (arriving ~5–8s after POST completes via SSE). From the human's view: their move + 3 bots happen "live"; the rest arrive on the SSE stream.

### 7.5 Caveats

- **300s timeout is the platform ceiling, not 10s.** We pick 10s because UX, not platform.
- **Cold start adds 50–200ms** to the first POST per region per session; subsequent POSTs are warm. Accept.
- **Fluid Compute concurrency** handles ~10 POSTs/sec/region comfortably on one warm instance — well above our 100-rooms-at-once budget.
- **`setTimeout` cost**: 3s bot move at 1GB function = $0.000018; 50 bot moves/game = $0.0009. Negligible.

---

## 8. Difficulty Elo tuning

The user asked for "clearly different difficulty levels." Translating to numbers: target ~200 Elo gap between adjacent tiers. We verify with a self-play bench.

### 8.1 The bench harness

```ts
// scripts/bench/elo-bench.ts
import { runGame } from '@/lib/game/runner';
import { easyBot, mediumBot, hardBot } from '@/lib/ai/dispatch';

async function bench() {
  const matchups = [
    { name: 'Easy vs Medium', bots: { 0: easyBot, 1: mediumBot, 2: easyBot, 3: mediumBot } },
    { name: 'Medium vs Hard', bots: { 0: mediumBot, 1: hardBot, 2: mediumBot, 3: hardBot } },
    { name: 'Easy vs Hard', bots: { 0: easyBot, 1: hardBot, 2: easyBot, 3: hardBot } },
  ];

  for (const matchup of matchups) {
    let teamAWins = 0;
    for (let i = 0; i < 1000; i++) {
      const result = await runGame({ mode: '4', bots: matchup.bots });
      if (result.winner === 'red') teamAWins++;
    }
    const winRate = teamAWins / 1000;
    const elo = -400 * Math.log10(1 / winRate - 1);
    console.log(`${matchup.name}: Team A win rate ${winRate}, Elo gap = ${elo}`);
  }
}
```

### 8.2 Target Elo gaps

| Matchup | Target gap | Acceptable range |
|---|---|---|
| Easy vs Medium | -200 (Medium dominant) | -150 to -250 |
| Medium vs Hard | -200 (Hard dominant) | -150 to -250 |
| Easy vs Hard | -400 (Hard wipes) | -350 to -450 |

If gaps are too narrow (e.g., Easy vs Medium = -100), Easy isn't easy enough. Tune:

- **Easy**: increase noise to 50%, restrict to only singles+pairs (no triples/full house).
- **Medium**: improve partner awareness, lower wildcard wastefulness in solver scoring.
- **Hard**: switch from `deepseek-chat` to `deepseek-reasoner` (4x latency, 8x cost — only if Medium is catching up).

### 8.3 Tuning knobs per tier

| Tier | Knob | Default | Tighter (harder) | Looser (easier) |
|---|---|---|---|---|
| Easy | `NOISE_TEMPERATURE` | 0.3 | 0.15 | 0.5 |
| Easy | `pattern allowlist` | all | all | singles+pairs only |
| Medium | solver depth (Bobgy DFS branching) | unlimited | unlimited | depth=3 |
| Medium | partner-coop sensitivity | full | full | disabled (race-to-out always) |
| Hard | LLM temperature | 0.3 | 0.1 | 0.7 |
| Hard | candidate pool size (N) | 8 | 12 | 4 |
| Hard | LLM model | deepseek-chat | deepseek-reasoner | deepseek-chat |

### 8.4 Running the bench

```bash
# Run nightly in CI
pnpm tsx scripts/bench/elo-bench.ts > docs/research/elo-bench-$(date +%Y-%m-%d).log

# Quick local check (100 games per matchup, ~5 min)
pnpm tsx scripts/bench/elo-bench.ts --fast
```

The bench writes to `docs/research/elo-bench-YYYY-MM-DD.log`. PRs that change AI code must run the bench. Regression beyond ±50 Elo gap from baseline blocks the PR.

---

# Scope B · Player assistance features

The same engine that powers Medium bots also powers human assistance. Single source of truth = `lib/ai/engine.ts`.

## 9. Auto-sort (理牌)

### 9.1 Default sort order

**Smart grouping by combo type** — matches how Chinese players physically arrange cards on the table. Order:

1. **Joker bombs first** (rightmost in hand): big jokers, small jokers
2. **Naked bombs** (≥4 of same rank): largest count first, highest rank tie-break
3. **Wildcards (红心 current-level)** — kept separately for visibility
4. **Other current-level cards** (non-wildcard)
5. **Triples + full-house candidates**: triples grouped (3-of-rank), then pairs that could ride along
6. **Pairs**: highest rank first
7. **Straight runs**: 5-card windows of singles, longest first
8. **Singles**: highest rank first, leftover after groups

```ts
// lib/ai/assist.ts
export function sortHand(hand: Card[], currentLevel: Rank): Card[] {
  // 1. Detect groups via the engine
  const decomposition = decomposeHand(hand, currentLevel);

  const sorted: Card[] = [];

  // 2. Lay out groups in the order above
  sorted.push(...decomposition.jokerBombs.flat());
  sorted.push(...decomposition.bombs.flat());
  sorted.push(...decomposition.wildcards);
  sorted.push(...decomposition.levelCards);
  sorted.push(...decomposition.triples.flat());
  sorted.push(...decomposition.pairs.flat());
  sorted.push(...decomposition.straightRuns.flat());
  sorted.push(...decomposition.singles);

  return sorted;
}
```

### 9.2 User preference toggle

Setting drawer has a single toggle:

```
理牌方式:
○ 按花色 (传统扑克)
● 按组合 (推荐 — 适合掼蛋)
```

Default = "按组合." Persists to `gd_online_sort_pref` localStorage. The poker-standard "by suit then rank" mode is the simple fallback for users who don't like smart grouping.

### 9.3 Animation

When "理牌" is tapped:

```
1. Capture current card positions (FLIP-style — first layout)
2. Compute new positions via sortHand()
3. Apply new positions to DOM
4. CSS transition: transform 600ms ease-out
```

Cards visibly slide into their new positions over 600ms. Implementation uses `transform: translate3d(...)` only (no width/height changes — see global anti-AI-slop rules).

### 9.4 Persistence

Last sort preference per @handle (via player profile sync, same pattern as `guandan-scorer`):

```ts
await fetch('/api/profile/setting', {
  method: 'POST',
  body: JSON.stringify({ handle: myHandle, key: 'sortPref', value: 'by-combo' }),
});
```

No room-level persistence — sort is purely visual, doesn't affect game state.

---

## 10. Move suggestions (出牌提示)

### 10.1 UX trigger

Two trigger modes:

1. **Tap-to-suggest**: user taps the "提示" button below the hand area. Suggestion appears immediately.
2. **Dwell-to-suggest** (toggle in settings, default OFF): if user hasn't played for 8s on their turn, a subtle glow appears on the suggested cards.

We default Tap-to-suggest because Dwell creates a "training wheels" feel and the user explicitly mentioned not over-assisting.

### 10.2 Suggestion rendering

```
┌─────────────────────────────────────┐
│  建议: 对子 7  (♥7 + ♦7)            │   ← caption above hand
├─────────────────────────────────────┤
│   3♠ 4♣ 5♥ [7♥] [7♦] 8♣ 9♦ Q♠ ...  │   ← suggested cards have soft glow
│                                      │
│   [出牌]  [清除]  [提示]              │
└─────────────────────────────────────┘
```

Tapping "提示" highlights the suggested cards with a soft gold glow (CSS `box-shadow: 0 0 12px var(--accent)` with opacity transition). Cards aren't auto-lifted. The user must tap each card to lift it (this preserves the "I made this play" feeling), then tap "出牌" to confirm.

Optional shortcut: tap "采纳" to auto-lift the suggestion. Default UI has both "采纳" (one-tap accept) and the explicit "tap each card" path. Power users use "采纳"; cautious users review.

### 10.3 The suggestion engine

Same as Medium-tier bot — `engine.suggestMove(view)` is the single source of truth:

```ts
// lib/ai/engine.ts
export async function suggestMove(view: PlayerView): Promise<SuggestedMove> {
  // Reuse the Medium bot logic, including partner-coop
  const move = await mediumBotMove(view);
  return {
    move,
    description: describeMove(move),  // "对子 7 (♥7 + ♦7)"
    reasoning: brieflyExplain(move, view),  // "队友领先,出小牌" (shown on long-press)
  };
}
```

### 10.4 Throttling

To prevent users from spam-tapping "提示" and getting visual noise:

```ts
const SUGGESTION_DEBOUNCE_MS = 1500;
let lastSuggestionTime = 0;

button.addEventListener('click', async () => {
  if (Date.now() - lastSuggestionTime < SUGGESTION_DEBOUNCE_MS) return;
  lastSuggestionTime = Date.now();
  const suggestion = await suggestMove(currentView);
  highlightCards(suggestion.move.cards);
  showCaption(suggestion.description);
});
```

### 10.5 Difficulty parity with user tier?

**Decision**: suggestions are always Medium tier. We considered "easier suggestions for new players" but rejected it because:

1. Implementing "Easy suggestion" means showing intentionally-bad moves to a confused user — opposite of helpful.
2. The point of suggestions is *learning* the game. Showing the strongest legal play teaches better tactics.
3. The throttling + tap-to-trigger pattern already prevents over-reliance.

Power users who want stronger suggestions can pay attention to the "reasoning" hint (long-press the suggestion). That's where Hard-tier wisdom would surface in a future polish phase, but Medium covers v1.

---

## 11. Hint-engine architecture

### 11.1 Single source of truth

```
lib/ai/engine.ts
├── enumerateLegalMoves(view)        → all legal Move candidates including pass
├── decomposeHand(hand, level)       → groups (bombs, pairs, triples, ...)
├── callWasmSolver(hand, level, w)   → minimum rounds to clear (Bobgy WASM)
├── suggestMove(view)                → top Medium-tier candidate
├── annotateCandidate(move, view)    → adds signals for Hard LLM prompt
└── detectBombs(hand)                → all bombs in hand (used by Medium for filtering)
```

Consumed by:
- `lib/ai/bots/{easy,medium,hard}.ts` (server-side, in POST handler)
- `lib/ai/assist.ts` (client-side, for human suggestions)

### 11.2 Server-side vs client-side

| Concern | Server (Vercel Function) | Client (browser) |
|---|---|---|
| Hand decomposition | Yes (for bots) | Yes (for suggestions) |
| WASM solver | Yes (for Medium bot) | Yes (for human suggestion) |
| LLM call | Yes only | No (security: no API key on client) |
| Latency | 80–150ms server round-trip | <80ms client-side |

**Decision: ship WASM client-side for assistance, run server-side for bots.**

Rationale:
- Suggestions need instant feedback (<80ms target). Server round-trip would push to 150–300ms. Bad UX.
- Bots need security. Bots compute server-side because their hand state lives server-side. No way to "cheat" by inspecting client code.
- WASM blob is ~50–100KB, gzipped to ~30KB. Acceptable for a card game's initial bundle.

### 11.3 WASM loading

```ts
// lib/ai/wasm/index.ts
let wasmInstance: WasmStrategy | null = null;
let loadPromise: Promise<WasmStrategy> | null = null;

export async function loadWasm(): Promise<WasmStrategy> {
  if (wasmInstance) return wasmInstance;
  if (loadPromise) return loadPromise;
  loadPromise = import('./strategy.wasm.js').then(mod => {
    wasmInstance = mod.default();
    return wasmInstance;
  });
  return loadPromise;
}

// Called once on app boot
loadWasm();
```

The WASM is fetched in parallel with the initial page render (idle prefetch). By the time the user is in a room and on their turn, it's loaded. Worst case (cold load): first suggestion takes ~300ms; subsequent <80ms.

### 11.4 Caching

Same hand + same trick state → same suggestion. Cache client-side:

```ts
const suggestionCache = new Map<string, SuggestedMove>();

export async function suggestMove(view: PlayerView): Promise<SuggestedMove> {
  const cacheKey = `${view.myHand.map(c => c.id).sort().join(',')}|${view.trick.signature}`;
  if (suggestionCache.has(cacheKey)) return suggestionCache.get(cacheKey)!;
  const result = await computeSuggestion(view);
  suggestionCache.set(cacheKey, result);
  return result;
}
```

Cache is per-session (cleared on page reload). Per-turn cache hit rate is ~80% (users tap "提示" multiple times during a single turn).

---

## 12. "Where's my heart-level wildcard?" highlighting

### 12.1 Always-visible identifier

The ♥ current-level card in hand gets a permanent gold edge tint:

```css
.card[data-wildcard="true"] {
  border: 2px solid var(--accent-gold);  /* e.g. oklch(75% 0.18 80) */
  box-shadow: 0 0 8px var(--accent-gold-alpha);
}
```

Users instantly see where the wildcard is. Critical because wildcards drive 60% of high-skill plays.

### 12.2 Substitution declaration UX

When the user assembles a combo that uses a wildcard (e.g., they lift `5♥ (wildcard) + 5♣ + 5♦` to form a triple of 5s), a small chip appears below the cards:

```
红心5 当作: [♣5] [♦5] ▼
```

Default chip shows the most plausible substitution (the rank that completes the natural pattern). User can tap the dropdown to override. If only one substitution makes sense, no dropdown — just shows the chip with the auto-substitution.

### 12.3 Logic for default substitution

```ts
// lib/ai/wildcardHelper.ts
export function inferWildcardRole(
  pendingCards: Card[],
  level: Rank,
): { rank: Rank; suit: Suit; reason: 'unique' | 'natural-pattern' | 'manual' } | null {
  const wildcard = pendingCards.find(c => isWildcard(c, level));
  if (!wildcard) return null;
  const others = pendingCards.filter(c => c !== wildcard);
  const ranks = new Set(others.map(c => c.rank));

  // If all others share a rank, wildcard fills that rank
  if (ranks.size === 1) {
    const targetRank = [...ranks][0];
    const usedSuits = new Set(others.filter(c => c.rank === targetRank).map(c => c.suit));
    const remainingSuits = ['spades', 'hearts', 'diamonds', 'clubs']
      .filter(s => !usedSuits.has(s as Suit));
    return { rank: targetRank, suit: remainingSuits[0] as Suit, reason: 'natural-pattern' };
  }

  // Straight detection: 3-4-WC-6-7 → WC = 5
  const straightFit = detectStraightFit(others, wildcard);
  if (straightFit) return straightFit;

  // No natural inference — user must declare
  return null;
}
```

If `null` is returned (e.g., user lifted random cards), the chip shows "选择红心5代表..." with no default. The user has to tap and pick — or unlift the wildcard.

### 12.4 Validation guard

If the user tries to play a combo where the wildcard's substitution doesn't form a valid pattern, the "出牌" button stays disabled with a tooltip:

```
此牌型不合法 — 红心5代表 ♣5,组合不是有效牌型
```

The validation runs `engine.parsePattern(cards, substitution)` and only enables the button if the result is a valid pattern type.

---

## 13. Endgame assistant — "can I go out this turn?"

### 13.1 When does it activate?

User has ≤6 cards remaining. The endgame solver runs in background and surfaces if a "go out" path exists.

```ts
// lib/ai/endgameSolver.ts
export function canGoOutThisTurn(hand: Card[], view: PlayerView, level: Rank): GoOutPath | null {
  if (hand.length > 6) return null;  // not endgame yet

  // We can go out if: we can play all our cards in one or more legal turns
  // before opponents take the lead.
  //
  // Single-turn out: play all cards in one combo (rare, only for full house, plates, etc.)
  // Multi-turn out: play X cards now, opponents pass, play remainder
  //
  // The solver runs an actual game-tree search to depth 4 (us → opp1 → opp2 → us).

  const searchResult = searchGoOutTree(hand, view, level, 4);
  return searchResult.outFound ? searchResult.path : null;
}
```

### 13.2 UI

If `canGoOutThisTurn` returns a path, a banner appears above the hand:

```
┌─────────────────────────────────────┐
│   ✨ 可以一手出完!  [显示路径]        │
└─────────────────────────────────────┘
```

Tapping "显示路径" walks through the play sequence:

```
第 1 步: 你出 对子 8 (✓ 现在执行)
第 2 步: 预期对手过牌
第 3 步: 你出 三带二 K
完成 — 你出完所有牌!
```

### 13.3 Implementation budget

The endgame search is bounded:
- Hand ≤ 6 cards → branching factor ~10 candidates per turn
- Depth 4 → ~10000 nodes worst case
- Per-node cost: ~1ms (legal move enumeration + WASM solver call)
- Total: ~10s worst case

This is **too slow for real-time UX**. We bound depth at 3 (us → opp1 → us) and only consider opponents' passes (assume opp plays the strongest available). Approximate but cheap (~200ms).

```ts
function searchGoOutTree(
  hand: Card[],
  view: PlayerView,
  level: Rank,
  maxDepth: number,
): { outFound: boolean; path: Move[] } {
  // DFS with alpha-beta-style pruning
  // For each of our legal moves:
  //   if removing those cards from hand = 0 cards → OUT FOUND, return path
  //   else: assume opponents play strongest legal beat OR all pass
  //     if pass: recurse with our turn again, reduced hand
  //     if beat: this branch fails; try next
  // ...
}
```

This is "best-case" go-out detection. We don't tell the user "你绝对能一手出完" — we tell them "可以一手出完" with a path that assumes opponents pass on their best plays. The user is responsible for executing.

### 13.4 Opt-in toggle

Settings drawer:

```
辅助功能:
☑ 出牌建议 (理牌 + 提示)
☐ 终局助手 (剩 ≤6 张时显示一手出完路径)
```

Default OFF for endgame assistant. Players who want it turn it on. Ranked rooms force OFF (see §14).

### 13.5 The "trivialization" risk

Endgame assistant is the most powerful assistance feature. It effectively solves the hardest 30% of Guandan strategy for the player. If we shipped it ON by default:
- New players would never learn endgame counting.
- High-skill players would dominate even more (they'd use it to verify their plans).
- Online matches would feel artificial — the bot would "see" go-out paths instantly.

**Design rule**: default OFF, prominent settings toggle, force OFF in ranked mode.

---

## 14. Anti-pattern: don't over-assist

### 14.1 Default state

All assistance features are **opt-in by tap**, not always-on:
- Auto-sort: persistent button, never auto-fires after deal
- Suggestions: tap "提示" to see one (or hold for 8s with dwell mode toggled on)
- Wildcard chip: always shown (this is just an information overlay, not a suggestion)
- Endgame: opt-in via settings toggle

### 14.2 Ranked mode (future)

When ranked mode ships (post-v1):

| Feature | Casual | Ranked |
|---|---|---|
| Auto-sort | ON | ON (no advantage; same for all) |
| Move suggestions | ON | OFF (forced off) |
| Wildcard chip | ON | ON |
| Endgame assistant | OFF (default) — user can opt-in | OFF (forced off) |
| Bot opponents | Allowed | Disallowed |

Ranked mode renders a small ⚠️ icon next to the room code: "辅助功能已禁用" (Assistance disabled).

### 14.3 The slip-up to avoid

The temptation: "let's show the suggestion automatically on every turn, just super subtly." Wrong. The Atelier polish iter 3 lesson from the sibling scorer applies here: tasteful UI sometimes means **showing nothing**. If you tap "提示," you see it. If you don't, you play your own game. Don't degrade the strategic depth by accident.

---

# Scope C · Cross-cutting concerns

## 15. Module layout

```
lib/
├── ai/
│   ├── engine.ts                  # Public API: enumerateLegalMoves, suggestMove, decomposeHand
│   ├── bots/
│   │   ├── easy.ts                # easyBotMove
│   │   ├── medium.ts              # mediumBotMove + scorePartnerSupport
│   │   ├── hard.ts                # hardBotMove + parseLLMChoice
│   │   └── master.ts              # v1.1 — stub only
│   ├── assist.ts                  # sortHand, inferWildcardRole, suggest wrappers for human use
│   ├── partnerStrategy.ts         # decidePartnerCoop (used by Medium + Hard)
│   ├── endgameSolver.ts           # canGoOutThisTurn + searchGoOutTree
│   ├── dispatch.ts                # computeBotMove(view, tier) → routes to easy/medium/hard
│   ├── timing.ts                  # botDelay(move, view) + betaSample
│   ├── botNames.ts                # pickBotName
│   ├── scratch.ts                 # getBotScratch / saveBotScratch (Redis)
│   ├── wildcardHelper.ts          # inferWildcardRole + detectStraightFit
│   ├── prompts/
│   │   └── hard.zh.md             # LLM system + user prompt template
│   ├── wasm/
│   │   ├── strategy.wasm           # Compiled from Bobgy strategy.cpp
│   │   ├── strategy.wasm.js        # Emscripten shim
│   │   └── index.ts                # loadWasm()
│   └── __tests__/
│       ├── easy.test.ts
│       ├── medium.test.ts
│       ├── hard.test.ts            # mocked DeepSeek
│       ├── partnerStrategy.test.ts
│       ├── endgameSolver.test.ts
│       └── elo-bench.test.ts       # smoke version for CI
├── game/
│   ├── engine.ts                  # validateMove, applyMove, isGameOver
│   ├── payloadFilter.ts           # buildClientPayload — THE hidden-state choke point
│   └── ...
├── redis-pubsub.ts
└── types.ts                       # GameState, PlayerView, Move, Card, etc.

api/
├── move.ts                        # POST handler with inline bot chaining
├── tick.ts                        # Continuation handler for long bot chains
├── stream/[roomCode].ts           # SSE handler
└── ...

scripts/
└── bench/
    └── elo-bench.ts               # Run 1000-game Elo benchmark
```

15 files in `lib/ai/`. Two of them are the most-edited (`engine.ts`, `bots/medium.ts`). The rest are stable once written.

---

## 16. Latency budget

| Step | Budget | Notes |
|---|---|---|
| Easy bot move (compute only) | <20ms | Pure JS, no async |
| Medium bot move (compute only) | <80ms | WASM call dominates |
| Hard bot move (compute only) | <3000ms | DeepSeek API call |
| Bot natural delay (any tier) | 1500–5500ms | Added on top of compute |
| Human suggestion compute | <80ms | Client-side WASM |
| Endgame solver (≤6 cards) | <200ms | Depth-3 bounded search |
| Auto-sort | <50ms | Pure JS decomposition |

**End-to-end latency for a human-triggered bot turn**:

| Tier | Compute | Delay | Network (1x SSE) | User perceived |
|---|---|---|---|---|
| Easy | 20ms | 1500–2500ms | 50ms | ~1.6–2.6s |
| Medium | 80ms | 1500–4500ms | 50ms | ~1.6–4.6s |
| Hard | 1500–3000ms | 2500–5500ms | 50ms | ~4–8.5s |

Hard tier feels slow. That's intentional — it shows the bot is "thinking hard." If players complain, we can tighten the delay schedule for Hard (since LLM call itself already adds 1.5–3s) but probably not below 4s total.

---

## 17. Testing strategy

**Four layers, behavior-only assertions** (no mock-existence tests — see `~/.claude/rules/engineering.md`):

| Layer | What it tests | Example |
|---|---|---|
| Unit (per bot) | Always legal, passes when forced, Easy produces variety from noise (set of 50 picks > 1 distinct) | `lib/ai/__tests__/easy.test.ts` |
| Integration (full game) | 4/6/8-player games with various bot mixes complete without error; mid-game bot takeover works | `lib/game/__tests__/integration.test.ts` runs `runGame()` with real engine, real bots |
| Player-assist | `suggestMove` always legal, matches `mediumBotMove` output, returns valid Chinese-text description | `lib/ai/__tests__/assist.test.ts` |
| Elo bench (CI-gated) | Tier strength gaps stay within ±50 Elo of committed baseline | `scripts/bench/elo-bench.ts` + `elo-regression-check.ts` |

```ts
// Representative unit test
describe('Easy bot', () => {
  it('always plays a legal move', () => {
    for (let i = 0; i < 100; i++) {
      const view = mockPlayerView({ randomHand: true });
      expect(isLegal(easyBotMove(view), view)).toBe(true);
    }
  });
  it('produces variety from noise', () => {
    const view = mockPlayerView({ deterministic: true });
    const seen = new Set();
    for (let i = 0; i < 50; i++) seen.add(JSON.stringify(easyBotMove(view)));
    expect(seen.size).toBeGreaterThan(1);
  });
});

// Representative integration test
it('completes a 4-player game (4 Easy bots)', async () => {
  const result = await runGame({ mode: '4', bots: { 0: easyBot, 1: easyBot, 2: easyBot, 3: easyBot }, maxRounds: 50 });
  expect(result.gameOver).toBe(true);
  expect(['red', 'blue']).toContain(result.winner);
});
```

**Elo CI gate** (`.github/workflows/elo-bench.yml`): on PRs that touch `lib/ai/**`, runs `--fast` bench and fails if any tier gap drifts >50 from `docs/research/elo-bench-baseline.json`. Intentional baseline updates require explicit baseline-file change in the same PR.

The integration tests run the **actual** `applyMove`, `enumerateLegalMoves`, and bot functions — no mocking of game logic. Only DeepSeek's HTTP call is mocked (in Hard tests), and `Math.random` is seeded for deterministic Easy tests.

---

## 18. Cost analysis

### 18.1 Per-game cost breakdown

| Component | Cost per game |
|---|---|
| Easy bot | $0 (in-process compute) |
| Medium bot | $0 (in-process compute + free WASM) |
| Hard bot (DeepSeek) | $0.005–0.045 |
| Player assistance | $0 (client-side WASM) |
| Vercel Function execution | ~$0.001 per game (50 POSTs × ~200ms × 1GB) |
| Upstash Redis | ~$0.0001 per game (pub/sub events) |

### 18.2 Monthly projections

Assume 100 daily games (~3000/month):

| Scenario | Monthly cost |
|---|---|
| All games 0 bots | ~$3 (Vercel + Upstash only) |
| All games 1 Hard bot | $15–135 + $3 = $18–138 |
| All games 4 Hard bots | $60–540 + $3 = $63–543 |
| Realistic mix (50% no bots, 30% Medium-only, 20% with 1 Hard) | $9–27 + $3 = $12–30 |

The "realistic mix" is the planning target. **Budget $30/month for AI in v1.** Cap with a soft rate-limit: if monthly LLM spend exceeds $50, automatically degrade Hard bots to Medium until next month. Implement via:

```ts
// lib/ai/bots/hard.ts
const MONTHLY_LLM_BUDGET = 5000;  // $50 in cents

export async function hardBotMove(view: PlayerView): Promise<Move> {
  const spent = await getMonthlyLLMSpend();
  if (spent > MONTHLY_LLM_BUDGET) {
    console.warn('Monthly LLM budget exceeded, degrading Hard to Medium');
    return mediumBotMove(view);
  }
  // ... actual LLM call, then increment spend counter
}
```

### 18.3 Free tiers + watch-list

Vercel Hobby (100K invocations/mo) covers ~600 games; we need Pro ($20/mo flat) at 100 daily games. Upstash free tier (10K commands/day) covers our ~3K commands/day comfortably. DeepSeek has no free tier (~$10–25/mo realistic).

**Watch**: (1) LLM prompt growth — cap trick history at last 6 plays or per-move cost scales linearly. (2) Medium WASM branching — cap candidate pool at 15 or 80ms budget breaks. (3) Cold start frequency — heavy deploy cadence pays 200ms on first POST per region.

---

## Implementation roadmap (AI-N milestones)

Per `~/.claude/rules/workflow.md` § Naming Conventions (`MILESTONE-N: description`):

- **AI-1**: Vendor `lib/ai/engine.ts` substrate (lift `autoGrouper.ts` + `ruleValidator.ts` + `cardEngine.ts` from `zdhgg/Guandan-training`; compile Bobgy's `strategy.cpp` to WASM; wire `loadWasm()`).
- **AI-2**: Easy + Medium bot tiers (`bots/easy.ts`, `bots/medium.ts`, `partnerStrategy.ts`, `dispatch.ts`, `timing.ts`).
- **AI-3**: Bot integration into `api/move.ts` POST handler (inline chaining, tick handler, hidden-state filter audit).
- **AI-4**: Player assistance — auto-sort + suggestions + wildcard chip (`lib/ai/assist.ts`, settings toggle).
- **AI-5**: Hard tier — DeepSeek LLM with candidate pre-filter (`bots/hard.ts`, prompt template, monthly budget guard).
- **AI-6**: Endgame solver — opt-in (`endgameSolver.ts`, settings toggle).
- **AI-7**: Elo bench harness — CI integration, baseline calibration.
- **AI-8** (v1.1): Master tier — DanLM ONNX integration, gated on Linux build availability from author.

AI-1 through AI-7 ship in v1. Conservative effort estimate: 4-5 weeks for AI-1 through AI-3, +1 week each for AI-4 through AI-7 (some parallelizable).

---

## Risks & open questions

### Risks

1. **WASM solver licensing audit incomplete.** `Bobgy/poker-guandan-strategy` is MIT — confirmed in `ai-strategies.md`. But re-confirm before AI-1 starts. Hard blocker if it changes.
2. **LLM prompt quality at scale.** The candidate pre-filter prevents catastrophic errors, but the LLM might consistently pick suboptimal candidates (e.g., always pass when partner leads, even when partner could lose lead). Mitigate: log every LLM decision + post-game retrospective. After 100 Hard games, audit decisions; tune prompt.
3. **The 10s POST chain budget might be too short for late-game.** When 5 of 8 players are bots and humans are last, a single human move can trigger a chain of 5 bot moves × 3s avg delay = 15s. Should still work via tick handler, but pile-up of ticks might create perceived lag. Stress test in integration tests with 7-bot rooms.
4. **Bot tells via timing.** If the beta distribution isn't tuned right, opponents could learn "bot took 5s = it had a bomb." Validate in user testing.
5. **Friendly-fire bombs.** Despite `isFriendlyBomb` guard, edge case might leak through. Especially in 6-player when partner relationships are complex. Unit-test heavily.

### Open questions

1. **Hard tier in 6/8-player mode**. Currently 4-player only. Adding 6/8 = ~1 week prompt rework + testing. Defer to v1.1 unless user demand surfaces.
2. **Bot personalities** beyond difficulty tier. `zdhgg/Guandan-training` has aggressive/conservative/balanced personas. We don't ship personas in v1 (keep tier as the only axis), but the engine supports adding them via `partnerStrategy.ts` weight tweaks.
3. **DeepSeek alternative**. If DeepSeek pricing changes, GPT-4o-mini and Claude Haiku are drop-in replacements via the Vercel AI SDK. The prompt format is provider-agnostic.

---

## Citations

- [`SUMMARY.md`](SUMMARY.md) — research synthesis with locked decisions
- [`ai-strategies.md`](ai-strategies.md) — 5-engine survey (Bobgy WASM, Quentain, ai-guandan, DanLM, Guandan-training)
- [`game-rules.md`](game-rules.md) — complete ruleset reference
- [`architecture-options.md`](architecture-options.md) — Vercel SSE+POST architecture decision
- [`realtime-sync-deep-dive.md`](realtime-sync-deep-dive.md) — sync mechanism details
- Sibling project: `../guandan-scorer/src/game/calculator.js`, `rules.js`, `core/config.js` — progression and A-level logic to reuse
- External: [DeepSeek API docs](https://api-docs.deepseek.com/) for prompt + pricing; [Bobgy/poker-guandan-strategy](https://github.com/Bobgy/poker-guandan-strategy) MIT for WASM solver; [zdhgg/Guandan-training](https://github.com/zdhgg/Guandan-training) MIT for `autoGrouper.ts` + `ruleValidator.ts` + `cardEngine.ts`
