# AI Strategies for Guandan Online — Reference Repo Survey

Research phase document. Examines five reference repositories the lead has identified as candidates (or as architectural reference points) for the AI bot system in `guandan-online`. Goal: enable an informed decision on which engine(s) to adopt, what to reuse, and how to express bot difficulty tiers.

**Constraint reminder.** Guandan is materially harder than the AI-research baselines (Doudizhu, Hearthstone, etc.):

- 108 cards (2 decks), 4 players in 2 fixed partnerships.
- 11+ pattern categories: single / pair / triple / full-house (三带二) / consecutive pairs (连对) / consecutive triples (钢板 / steel-plate / steel-tube) / straight (顺子) / straight-flush (同花顺) / bomb (4-8+ card) / joker-bomb (天王炸/四王炸).
- Bomb hierarchy is graded: 4-card < 5-card < 6-card < straight-flush < 7-card < 8+-card. A 6-bomb beats a 5-bomb of any rank.
- **红心级牌** ("heart-level card") is a wildcard — drastically expanding legal decompositions for any non-trivial hand.
- Partner's hand hidden but moves leak signal. Cooperative play; bombing your own partner unnecessarily is a fail mode hand-crafted bots historically struggle with.
- Round outcome (who went 1st/2nd/3rd/4th) drives team level progression 2 → A, with separate game-rule logic AX has already implemented in the sibling `guandan-scorer/src/game/`.
- 6- and 8-player variants exist (3×2, 4×2 teams) with materially different strategic dynamics — none of the AI literature addresses these.

The action space is massive (DanZero paper estimates ~10^4–10^5 legal actions in some states for 4-player) and the game tree depth is high (one round can span ~50+ ply across all four players). This is a hostile environment for naive search; strong play has historically required either tens of CPU-days of self-play RL or deep domain heuristics.

---

## Repo 1 — Bobgy/poker-guandan-strategy

**URL:** https://github.com/Bobgy/poker-guandan-strategy  
**Live demo:** https://bobgy.github.io/poker-guandan-strategy/  
**Stars / Forks:** 4 / 2 — niche personal project  
**License:** MIT  
**Last active commit:** 2025-05-24 (`test: add const.test.ts for testing constants`). Repo had a 4-year dormancy (2021 → 2025) before resuming light activity. Most of the algorithm is from 2021.

### What it actually is

**A hand-decomposition tool, not a bot.** Single C++ file (`strategy.cpp`, 430 lines) compiled to WebAssembly via Emscripten and consumed by a React-Native-Web PWA. Given a player's hand and the current level (主牌 / current-level rank), it answers *"what is the minimum number of hands (rounds-as-active-player) needed to empty this hand, and what is the optimal decomposition?"*

It does **not** know about opponents, partner, what's been played, or what's likely held by others. It cannot decide whether to *pass* — it just decomposes a static hand into the cheapest pile of legal patterns.

### Algorithm class

**DFS with heavy pruning + pluggable cost estimator.** Two estimators ship:

- `MinPlaysCostEstimator` — counts hands (0.0 for bombs which are "free" since playable any time, 1.0 otherwise). Output is "minimum trick-count to empty hand."
- `OverallValueCostEstimator` — heuristic value in `[-2.0, 2.0]` (red joker -1.0, level pair ~-0.85, low cards positive). Aims to capture how *valuable* cards remain in the decomposition — a proxy for "controllability."

The DFS extracts one playable pattern at a time and recurses on the residual hand, tracking `TypePosition` and `StartingNumPosition` to suppress equivalent reorderings (the only real pruning trick). A global `cntRecursion` counter is the only profiling instrumentation. Algorithmic complexity is informally "exponential with pruning"; no formal complexity analysis.

### State + action encoding

- **State:** `THandCards` (a `map<int, vector<Card>>` keyed by rank) + `mainRank` (current level). No opponent state, no history.
- **Patterns:** Singles, pairs, triples, full houses (三带二), straights, plates (steel-plate), tubes (tube/钢管 — three consecutive triples), normal bombs, joker bomb, straight flushes. Search tries them in a fixed priority order.

### 红心级牌 wildcard handling

**Yes, explicit.** A `wildCardsLeft` parameter (range [0,2] in a valid 4-player game) is threaded through the recursion. `calculateMinHandsImp()` places wildcards as singles → pairs → triples → bombs in escalating order. `OverallValueCostEstimator` even tries assigning a wildcard to multiple candidate ranks to minimize value sum. **This is the most rigorous wildcard handling of any repo surveyed.**

### Cost / runtime

- **Inference:** Single-hand decomposition, in WASM, completes in single-digit milliseconds for typical 27-card hands. No formal benchmark in repo but the PWA renders results live without a spinner, which is the de-facto evidence.
- **No training.** Pure search.
- **Footprint:** WASM bundle is small (estimable ~50-100KB compiled; `app/public/res/strategy.js` not checked in but generated from a 14KB-ish source).
- **Hardware:** CPU-only, runs in browser.

### Where it fits in our stack

**Ideal for client-side, embedded in the browser as a WASM module.** It's the canonical "help me organize my hand" tool — exactly what we'd use for an in-game *"suggest a play"* button or the *"easy bot"* tier. Build command from `package.json`:

```bash
em++ strategy.cpp cc/common.cpp -o app/public/res/strategy.js \
  -s EXTRA_EXPORTED_RUNTIME_METHODS='["cwrap", "ccall"]' --bind
```

The output is a `.js` shim + WASM blob loadable via plain `<script>` or imported in Vite.

### Difficulty tuning surface

Minimal — there's no clear knob for "play worse." Possible levers:

- Switch between the two estimators (MinPlays vs OverallValue) — would change decomposition aesthetics but not strength meaningfully.
- Sample a *non-optimal* decomposition by injecting random noise into the cost — easy to retrofit.
- Restrict pattern set (e.g., disable bombs at low difficulty).
- Truncate search depth — already shallow, so this is marginal.

### Code health

- Single C++ file, no header for it (lives next to `cc/common.cpp` / `common.hpp`). Readable, 430 LOC.
- TypeScript layer (`app/`, `cc/`) wraps the WASM bridge cleanly (`loadCppModule.ts`, `portCppModule.ts`).
- Tests exist: `test.js` at root + `test/` directory + a recent `const.test.ts`. Coverage unspecified but the recent activity is explicitly test-adding.
- README is sparse — points to pagat.com for rules. No design doc, no algorithm write-up.
- MIT license — fully reusable.

### Delta from Doudizhu

Doudizhu is 1 vs 2 with one deck (54 cards), no wildcards, and a simpler pattern set (no straight-flush bombs, no steel plates/tubes). The wildcard handling and graded-bomb hierarchy are genuinely Guandan-specific. Bobgy's tool gets the wildcard search right, which is the hardest part of the decomposition problem.

### Honest assessment

A solid utility for "rate my hand" and "suggest a decomposition." **It is not an opponent.** Using it as a bot means writing your own pass/play policy and opponent-tracking on top — Bobgy gives you the per-hand inner loop only. Worth adopting precisely because it solves the WASM-portable decomposer problem cleanly, which we will need to solve regardless of which higher-level AI engine we pick.

---

## Repo 2 — agil27/Quentain

**URL:** https://github.com/agil27/Quentain  
**Live demo:** https://quentain.onrender.com (server at `quentain-server.onrender.com`)  
**Stars / Forks:** 11 / 6  
**License:** Apache 2.0 (LICENSE file present, MIT in README — repo metadata says Apache).  
**Last active commit:** 2023-01-14. Dormant for 3+ years.

### What it actually is

**A full-stack web implementation of Guandan with no AI bot.** Vue 3 + Naive-UI frontend (with HTML5 canvas card rendering), Flask + SQLite backend. Multiplayer-only via shared room tokens — humans vs humans. The README does not claim AI; my code inspection confirms there is no AI module anywhere in `quentain-server/`.

Files in `quentain-server/quentain/`:

```
card.py   (~85 LOC)   — Card class, ordering
comp.py   (746 LOC)   — Composition (CardComp) types, validity, comparison
game.py   (~180 LOC)  — Game state, throw_cards, fold tracking
series.py (~80 LOC)   — Multi-round level progression
```

`comp.py` is the meat: subclasses for `Fold`, `Single`, `Pair`, `Triple`, `FullHouse`, `Straight`, `NaiveBomb`, `JokerBomb`, `StraightFlush`, `Plate` (steel plate, 4-of-a-kind across two ranks), `Tube`. Each has `satisfy()` and `greater_than()` methods. This is a well-structured rules engine and the comparison logic looks correct on inspection.

### Algorithm class

**N/A — there is no algorithm for an opponent.** This is server-side game-state validation only.

### State + action encoding

- **Card:** `(number, color, level)` tuple. `is_wildcard()` checks if card's number matches the current level (i.e., the red-heart-level card).
- **Composition:** typed Python class per pattern. Validity is recomputed on receipt; comparison is type-aware (Plate.greater_than(Plate) etc., bombs override).

### 红心级牌 wildcard

**Partial.** `comp.py:sort_no_level()` handles up to 2 wildcards when sorting hands. `is_wildcard()` is defined on `Card`. But there's no decomposer that places wildcards to maximize plays — because there's no AI that needs to decompose.

### Cost / runtime

N/A. The legality check is O(n log n) for sorting and effectively constant time for fixed-size hands. Server runs on a free Render dyno.

### Where it fits in our stack

**Almost nothing reusable directly** — the rules engine logic is sound but it's written in Python and we're a TypeScript / JS stack. The sibling `../guandan-scorer/src/game/` already encodes the team-level progression and 4/6/8-player upgrade rules in JavaScript, which subsumes everything `series.py` does. The only thing worth lifting is the **comp.py class taxonomy** as a reference for our own pattern types — but we'd reimplement.

### Difficulty tuning surface

Not applicable.

### Code health

- Apache-2 licensed. Reusable in principle.
- Python 3, Flask app. Has tests (`tests.py`, `game_test.py`, `series_test.py`, `tests/`).
- No documentation beyond the README; comments in code are sparse.
- The `experimental` debug mode (4 cards instead of 27) is a nice touch for testing.
- Dormant: 3 years of inactivity, single author.

### Delta from Doudizhu

Mostly only in the Composition taxonomy (plates, tubes, straight-flush bombs).

### Honest assessment

**This is not an AI candidate at all.** The lead listed it because it's a working playable implementation, but for the bot question it's a non-answer. **Skip.** Possibly worth pinging for the canvas rendering ideas in the frontend, but unrelated to AI strategy.

---

## Repo 3 — shuilongzhu/ai-guandan

**URL:** https://github.com/shuilongzhu/ai-guandan  
**Stars / Forks:** 24 / 14 (most popular by stars in this survey)  
**License:** Not declared — risk flag for reuse.  
**Last active commit:** 2023-07-18 (3 commits total, all initial). Dormant.

### What it actually is

Naming is misleading. **"Ai" here refers to a human seat using a phone camera to take photos of physical cards** (`拍照上传手牌` = "take a photo to upload your hand"). The server is a WebSocket backend coordinating four physical players sitting around a real card table; two of the four are reading their hands via phone camera + OCR (handled client-side, not in this repo), and this server makes their "AI seat" play by selecting moves from rule-based decomposition over the OCR-recognized hand.

So `Ai` ≈ "automated table assistant" rather than "intelligent opponent." That said, the underlying card-play logic is still useful as a strong rule-based reference.

### Algorithm class

**Rule-based heuristic decomposer + structured play selection.** No ML, no search beyond pattern enumeration. The repo has substantial code volume:

- `service/card_manage_service.go` (35 KB, **1,196 LOC**) — `PokerHandAnalysis()` is the entry point. Branches on hand size (1, 5, 6, 7+) and decomposes into `HandCard` candidate plays. Concurrent decomposition via goroutines (`ContinuousPokerHandGo`).
- `service/step_service.go` (43 KB, **1,177 LOC**) — turn / room / WebSocket lifecycle.
- `service/step2_service.go` (29 KB, ~1,000 LOC) — variant flow for the "AI seat" mode.
- `service/hagd.go` (4.5 KB) — small helper module.

Pattern types handled (per the type module): single / pair / triple / full house (三带二) / 顺子 / 同花顺 / 钢板 / 三连 / 连对 / four-of-a-kind / joker-bomb / 4-bomb through 8-bomb.

### State + action encoding

- `Card` is a struct with `{id, name, color, viewNumber, hViewNumber, level}` — `hViewNumber` appears to be the "wildcard-substituted view" used in decomposition.
- Server message protocol uses numeric IDs and JSON payloads. Per-player state includes `dfsCards`, `dfsMasks`, `dfsResults`, `dfsTargetCard`, `dfsTargetNum`, `dfsCardDomain` — suggesting a DFS-style hand search runs server-side, with explicit target-pattern matching.

### 红心级牌 wildcard

**Yes, first-class.** The state schema includes `l_card_number` (current-level rank), `l_card_number_p` (P-team), `l_card_number_a` (A-team) — separate-per-team wildcards (which is the real Guandan rule). Player struct carries `LCard []types.Card` (the wildcard pile in hand) and `wildCard / wildCardNum / wildCardIndex` for decomposition.

### Cost / runtime

- **Inference:** Unclear without running the binary. The use of goroutines suggests they ran into latency on complex hands; concurrent decomposition is a meaningful pattern. Realistically a few ms to ~hundreds of ms per move depending on hand complexity. Go is fast; this is not the bottleneck.
- **No training, no model files, no checkpoints.**
- **Footprint:** Single Go binary, likely <30 MB. No GPU.
- **Hardware:** CPU-only, runs anywhere Go runs.

### Where it fits in our stack

- **Cannot run client-side** — it's a Go server with WebSocket protocol. Could deploy as a Node-sibling microservice (Vercel doesn't host Go natively but Render / Fly does cheaply).
- The decomposition logic (`card_manage_service.go`) is the most thorough rule-based reference for Guandan in any of these five repos. **Worth porting to TypeScript** as the core of an "easy" / "medium" rule-based bot — but porting 1,200 LOC of Go (with concurrency) is meaningful engineering effort.

### Difficulty tuning surface

The architecture is *implicitly* tunable via heuristic weights inside the decomposition cost function (which I couldn't inspect line-by-line). Adding noise to the cost or restricting the pattern set is straightforward in principle. No formal difficulty ladder is exposed.

### Code health

- **No license** — fatal blocker for reuse in a closed-source product. We'd need to ask the author.
- Heavy commenting in Chinese throughout; reasonable code organization (MVC-ish: controller/service/types/utils).
- Tests directory exists but contents unknown.
- 3 commits total since 2023. Effectively abandoned.
- The README is API documentation (Postman-style payloads), not a strategy write-up. Zero discussion of strength, eval, or algorithm.

### Delta from Doudizhu

Significant — explicitly handles team-bifurcated wildcards (`l_card_number_p` and `l_card_number_a`), graded bombs, all 11 pattern types, the tribute-card protocol (`IsOnePTributeMethod` etc.), and the level-progression life cycle. This is the most "complete" Guandan implementation in the survey.

### Honest assessment

The **biggest implementation reference** for a rule-based Guandan bot in the wild. But license is unstated, the code is Go, and porting is a multi-week project. If we don't pick this up, we should at minimum *read* `card_manage_service.go` to understand the canonical decomposition cases. Treating this as inspiration rather than dependency is probably right.

---

## Repo 4 — dashidhy/DanLM

**URL:** https://github.com/dashidhy/DanLM  
**Stars / Forks:** 6 / 1  
**License:** Apache 2.0 with non-commercial restriction. *"Free for academic research and personal use. Commercial use requires written permission from the author."* — relevant if we ever monetize.  
**Last active commit:** 2026-05-16 (today). **Active development.**

### What it actually is

The flagship candidate. DanLM is a **causal Transformer ("TinyLM Encoder") that learns Guandan from raw tokenized game history with zero hand-crafted features**. It currently holds **#1 on the Botzone GuanDan leaderboard** (Elo 1307.75, 2026-04-03), beating all 30 other competitive bots including the published DanZero paper (Lu et al., AAAI 2023). The author also recently released DouLM (the DouDizhu variant), which reached #1 on Botzone's FightTheLandlord leaderboard 2026-05-01.

This is the strongest known publicly-available Guandan AI.

### Algorithm class

**Self-play deep RL with sequence modeling.** Specifically:

- **Q-learning** via "Deep Monte-Carlo" (DMC), inherited from the DanZero / DouZero lineage.
- **Architecture:** Causal Transformer encoder over a tokenized game history (~90 vocab) + a separate MLP encoder over the current hand (one-hot counts) + a Q-value head + an auxiliary next-token prediction (NTP) loss for representation learning.
- Distinct from DanZero (which uses 567-dim hand-crafted features → MLP) — DanLM proves "raw history is enough."
- Underlying RL framework includes Dueling DQN, Distributional Q (C51-style), Dual Q-network (teammate cooperation reward), Boltzmann/ε-greedy exploration, and TD-bootstrapping with convex MC/TD targets — all visible in the `config_v3.py` dataclass (the only readable source file in the repo's `danzero/` package).

### State + action encoding

- **Game history:** raw "who played what" tokenized into ~90 tokens. Tokenizer logic lives in compiled `danzero/encoding/tokenizer.cpython-312-darwin.so` — **not readable Python source.**
- **Hand:** simple count vector + action-as-one-hot.
- **Action space:** all legal moves; the model produces Q(s, a) for every legal candidate and selects the argmax.
- **State vector dimension is NOT 567 dimensions of features** — that's the DanZero baseline. DanLM consumes the raw token sequence + count vectors.

### 红心级牌 wildcard

**Implicitly** handled — the engine module (`danzero/engine/cards.cpython-312-darwin.so`) must encode wildcards since DanLM trains and plays on the same engine the Botzone competition uses. The README doesn't discuss it explicitly but the model wins competitions whose evaluation environment includes wildcards, so it works in practice. We can't audit the encoding without decompiling the `.so` files.

### Cost / runtime

- **Training:** Inherited DanZero protocol baseline = 30 days on 160 CPUs + 1 GPU (per DanZero paper). DanLM is "DMC self-play + NTP" — same order of magnitude. The author has shipped checkpoints, so we don't need to retrain.
- **Model size:** `ckpts/DanLM_v1/dansformer_v1_best_eval.pt` is **47 MB** (PyTorch state dict). The baseline DanZero V3 int8 ONNX is ~similar order.
- **Inference:** README implies real-time playable web UI (FastAPI + Uvicorn at `localhost:8000`). Latency unspecified; for a Transformer of this size on Apple Silicon CPU, expect ~50–200 ms per move, more if many legal actions need scoring (Q-values computed one per action — could be batched).
- **Hardware:** **Tested only on macOS ARM64 (Apple Silicon).** The `.cpython-312-darwin.so` shared objects are macOS-specific. **This is the critical platform gotcha.** Inference on Linux servers requires either:
  1. A separate Linux build the author has not published.
  2. Decompiling / reverse-engineering the `.so` files (Apache-2 NC license permits this for non-commercial; commercial use blocked).
  3. ONNX export of the Transformer (the baseline `DanZero_v3_rep_v1t` ships as ONNX, but the DanLM Transformer does not).

### Where it fits in our stack

This is the **hardest** repo to integrate by far. Possible paths:

| Approach | Feasibility | Cost |
|---|---|---|
| Drop in `.pt` and run via Python sidecar (FastAPI / Uvicorn) on a Linux server | Blocked — `.so` files are macOS-only | n/a unless author publishes Linux build |
| Ask author for Linux build of the `.so` modules | Plausible — author is active and the repo is research-friendly | 1-2 weeks contact lag |
| Export Transformer to ONNX, run via `onnxruntime-web` in browser | High effort — requires understanding the model graph through `.so` opacity | Multi-week project; uncertain |
| Self-host the Python stack on a GPU-bearing edge or VM, expose move-suggestion API | Standard pattern but requires the macOS issue resolved | A few hundred USD/mo for inference VM |

The non-commercial license is a real blocker if `guandan-online` will ever monetize.

### Difficulty tuning surface

Excellent in principle:

- **Multiple checkpoints across training.** The author keeps "max_best_ckpts: 10" and "max_recent_ckpts: 10" in config — so a 10-rung Elo ladder of weight files likely exists, though only the best is published.
- **ε-greedy / Boltzmann temperature.** Both are tunable knobs in `config_v3.py` (`eps_greedy`, `boltzmann_temp`). At inference time, dialing temperature up makes the bot play sub-optimally without breaking it. Easy and effective.
- **Action selection top-k.** `eps_top_k` allows "explore among top-k legal actions" — natural difficulty knob.

For our use, the cleanest "easy / medium / hard" expression is **temperature sampling on the same DanLM checkpoint**: low temperature = play near-optimally (hard), high temperature = noisy plays (easy).

### Code health

- **Active development, weekly commits.**
- **README is excellent** for a research repo — performance tables, evaluation methodology, baseline-bug-fix notes (the author independently rebuilt the Botzone bots after finding ~49% crash rates on the original npc-guandan-ai source).
- **HOWEVER:** the codebase carries the disclaimer *"~100% vibe coding (powered by Claude Opus 4.6)... code and documentation may contain critical bugs, hallucinations, or inaccuracies."* — author is explicit that this is AI-generated code with limited human auditing.
- **`.so` opacity** is the biggest health problem. Engine / encoding / model / eval modules are all compiled. Only `config_v3.py` is readable Python. This means we get a black box: we can run the checkpoint, but we cannot extend, retrain, port, or fully audit.
- 16 competition baseline bots ship in `baselines/` — a treasure trove of rule-based references (though Python in compiled `.so` form mostly).
- License is `Apache 2.0 + NC` (non-commercial). Commercial use needs written author permission.

### Delta from Doudizhu

The author has built **both** Guandan (DanLM) and Doudizhu (DouLM) versions of the same architecture, demonstrating the approach generalizes. From the architecture perspective the deltas are: larger action space, wildcards, team play, graded bombs. DanLM's lack of explicit wildcard encoding in the visible config suggests the tokenizer handles it transparently — which is the right approach for a sequence model. The `engine/cards.so` and `engine/actions.so` files are 145 KB and 348 KB respectively (substantial code), so the wildcard / pattern-enumeration logic is non-trivial even though hidden.

### Honest assessment

**Strongest bot, hardest to integrate, license-constrained.** If we want a tournament-grade "hard" bot, this is the reference. But:

1. Linux deployment is unresolved.
2. Non-commercial license likely blocks v2+.
3. Closed-source modules mean we cannot retrain, can only sample temperature.
4. Author's own disclaimer urges independent verification.

If we adopt DanLM, treat it as a **black-box opponent service** with a clear separation: we expose a "suggest move" RPC; the rest of `guandan-online` is unaware of the engine. We must have a non-DanLM fallback because the macOS-only-build risk is real.

---

## Repo 5 — zdhgg/Guandan-training

**URL:** https://github.com/zdhgg/Guandan-training  
**Stars / Forks:** 0 / 1  
**License:** MIT  
**Last active commit:** 2026-05-16 (today). **Brand-new and actively developed.**

### What it actually is

A **monorepo training platform**, not a research framework. Express + TypeScript backend + Vue 3 + Vite frontend. The README in Chinese describes it as *"a Guandan-training-oriented intelligent system"* with these capabilities:

- Minimum-hand card-organization training (`autoGrouper.ts`)
- Human-vs-AI battle mode
- AI-vs-AI spectator mode
- Game timeline replay & recent-game recovery
- LLM connectivity testing, seat-persona configuration, strategy parameter tuning

The "AI" here is a **DeepSeek / GPT-class LLM** consulted via an OpenAI-compatible API call, with a **rule-based fallback** when no API key is configured. Configuration:

```bash
LLM_API_KEY=your_llm_api_key
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
LLM_DECISION_MODE=candidate   # 'candidate' or 'legacy'
```

### Algorithm class

**LLM-as-policy with a candidate-action pre-filter, plus a deterministic fallback.** Key files:

- `backend/src/services/aiService.ts` (**52 KB**, large) — the LLM orchestration: prompts, candidate generation, persona-weighted scoring, decision insight introspection. Supports three personas (`aggressive`, `conservative`, `balanced`) with weight profiles for `aggression`, `bombConservation`, `teammateSupport`, `endgameRisk`.
- `backend/src/services/autoGrouper.ts` (**38 KB**) — pure-TS hand decomposition similar in spirit to Bobgy's strategy.cpp; enumerates straights / tubes / steel-plates as `RankWindow` arrays.
- `backend/src/services/battleService.ts` (**65 KB**) — game-state orchestration.
- `backend/src/core/ruleValidator.ts` (**26 KB**) — pattern identification + `canBeat` comparison.
- `backend/src/core/cardEngine.ts` (~7 KB) — Card / RuntimeCard types, deck generation, wildcard flag.

Two decision modes:

1. **`candidate`** (default) — backend enumerates the top-N legal actions with computed tactical signals (`hasLastPlay`, `lastPlayByTeammate`, `teammateNearFinish`, `opponentCritical`, etc.), feeds them to the LLM as a multiple-choice prompt, LLM picks one. This is robust and bounds the LLM's "creativity."
2. **`legacy`** — older free-form LLM call without candidate pre-filtering. Riskier.

### State + action encoding

- TypeScript types throughout. `RuntimeCard = { id, suit, rank, deckIndex, logicValue, isWildcard, isSelected }`.
- Patterns: `'single' | 'pair' | 'tube' | 'consecutive_pairs' | 'consecutive_triples' | 'plate' | 'straight' | 'bomb' | 'straight_flush' | 'invalid'`.
- `BattleContext` includes seat / teammate seat / per-player `cardsLeft` / `isTeammate` / `rank` + `finishedSeats`.

### 红心级牌 wildcard

**Yes, first-class.** `cardEngine.ts` has explicit `isWildcard` boolean per `RuntimeCard` and `calculateBaseLogicValue` boosts the wildcard's logic value. The decomposer in `autoGrouper.ts` enumerates straights/tubes/plates over `RANK_SEQUENCE` and clearly supports the low-edge straight (`A-2-3-4-5`).

### Cost / runtime

- **No training, no model files.** The "AI" is just an LLM API call.
- **Inference latency:** dominated by LLM round-trip. `LLM_BATTLE_TIMEOUT_MS = 60000` (60 s ceiling), `LLM_CONNECTIVITY_TIMEOUT_MS = 12000`. DeepSeek-chat typical response time 1–4 s. This is **far** too slow for snappy gameplay on every move — you'd want streaming + parallel candidate generation, which the file `play/stream` route suggests they've implemented.
- **API cost:** at DeepSeek pricing (~$0.14 / 1M input tokens, ~$0.28 / 1M output tokens as of 2026), each move's prompt is roughly 1-3K tokens input + ~100-200 tokens output. At maybe 20-40 moves per round × 4 AI seats × maybe 8 rounds per game = potentially ~$0.01-0.05 per AI-vs-AI game. For thousands of concurrent games this is real money.
- **Hardware:** N/A — external API. Server is Node 20+, runs on Vercel-class hosts trivially.

### Where it fits in our stack

**Excellent fit architecturally.** This is the only repo whose code we could lift directly: TypeScript / Node / Express, same language family as our Next.js / Vercel deployment. Concretely:

- **`autoGrouper.ts`** is the pure-TS hand decomposer we'd otherwise port from Bobgy's C++ or `ai-guandan`'s Go. Drop it in, done. (Subject to MIT license — yes.)
- **`ruleValidator.ts`** is the pattern engine, also pure TS.
- **`aiService.ts`** is reusable for the "medium" or "hard" bot if we accept LLM latency + cost.
- **`battleService.ts`** is over-fitted to their schema; reference only.

The Prisma schema is irrelevant (we'll use Vercel KV / our own store).

### Difficulty tuning surface

**Best of the rule/heuristic side, by design:**

- Three persona presets (`aggressive` / `conservative` / `balanced`) with explicit weight dimensions.
- `AISpeechStyle` (`restrained` / `normal` / `taunt`) and `AITauntLevel` (`mild` / `medium` / `heavy`) for character flavor — pure UX win, free.
- Candidate-mode top-N scoring means we can deterministically pick e.g. the 3rd-best move for "medium" bots without touching the LLM.
- LLM model swap (DeepSeek vs GPT-4o-mini vs Claude Haiku) gives a free strength dial.

### Code health

- MIT licensed — no constraints.
- TypeScript throughout, well-typed with explicit `interface` declarations.
- Has Vitest test coverage of rules, battle service, routes, training validation, and LLM routes (per `backend/README.md`).
- CI badge points to a passing GitHub Actions workflow.
- Comments are partly in Chinese, partly English — readable for any AX-comfortable reader.
- Author appears solo and recent (3-month-old project), so bus-factor risk exists.

### Delta from Doudizhu

The autoGrouper specifically handles `'consecutive_pairs'`, `'consecutive_triples'`, `'plate'`, `'tube'` — Guandan-native pattern types. The wildcard handling is Guandan-specific. There is no Doudizhu equivalent of this codebase.

### Honest assessment

**The most directly usable codebase for our stack** — same language, MIT licensed, recent, sane architecture. The LLM-as-bot approach has known downsides (latency, $$, vulnerability to prompt-injection if humans get creative in chat) but the candidate-pre-filter mitigates most of them. The rule-based components (`autoGrouper`, `ruleValidator`, `cardEngine`) are reusable independently of whether we adopt the LLM layer.

---

## Recommendation

### Ranking by adoption cost vs strength

| Engine | Strength | Integration cost | Reusability into our TS/Node stack |
|---|---|---|---|
| **DanLM** | Tournament-grade #1 | Very high (macOS-only binaries, NC license, Python sidecar required) | Service boundary only |
| **Guandan-training** (LLM + rule fallback) | Strong if LLM is good; rule-fallback ~ amateur intermediate | Low (lift directly) | Direct copy of `autoGrouper`, `ruleValidator`, `cardEngine`, optionally `aiService` |
| **ai-guandan** (rule-based) | Amateur intermediate, well-tuned rules | High (Go → TS port of ~1.2K LOC, no license) | Reference only |
| **Bobgy** (WASM DFS decomposer) | Not a bot — single-hand solver | Low (build the WASM, expose `cwrap`) | Decomposer-only sidecar |
| **Quentain** | None — no AI | n/a | Skip |

### How to express "different difficulties"

The cleanest expression is **a hybrid stack with three independent difficulty knobs**:

| Tier | Engine | Knob |
|---|---|---|
| **Easy** | Pure rule-based decomposer (`autoGrouper.ts` from Guandan-training) + greedy play (always pick simplest decomposition; never bomb proactively) | Pattern restriction: disable bombs entirely, prefer singles over compound patterns |
| **Medium** | Same decomposer + heuristic value-cost selection (Bobgy's `OverallValueCostEstimator` approach, ported) + pass/play policy based on remaining-card-count + teammate proximity | Score noise injection (±20%) for natural variance |
| **Hard** | Either (a) LLM-as-policy via `aiService.ts` with candidate pre-filter, or (b) DanLM checkpoint via Python sidecar with temperature 0.05 | LLM model swap (DeepSeek vs GPT-4o) OR DanLM temperature |
| **Expert** | DanLM at temperature 0.01 | Reserved for ranked play if we add it |

This means "different difficulties" is **not "same engine, different search depth"** (which works for chess but not for partner-card games where the difficulty axis is more about *judgment* than *lookahead*). It's "different engines with overlapping fallback paths."

The Easy/Medium tiers ship as **pure TS in the browser** — no inference cost, no latency, runs in a tab. The Hard tier is a server-side opt-in.

### Proposed hybrid architecture

```
Browser (Next.js + WASM)
├── Bobgy strategy.cpp → strategy.wasm        # in-hand decomposition utility
├── autoGrouper.ts + ruleValidator.ts (from   # legality, candidate enumeration
│   Guandan-training, MIT)
├── easyBot.ts                                 # greedy rule policy
└── mediumBot.ts                               # heuristic + persona weights

Server (Vercel functions OR small VM)
├── /api/bot/hard                              # routes by configured engine:
│   ├── llm.ts        (DeepSeek/Claude/GPT-4o-mini, candidate-mode prompt)
│   └── danlm.ts      (HTTP proxy → Python sidecar w/ DanLM checkpoint)
│
└── DanLM sidecar (separate container, only if we commit to it)
    └── FastAPI + DanLM .pt + Linux .so build (TBD)
```

The browser handles 100% of Easy / Medium decisions (zero server cost, instant). The Hard tier degrades gracefully to Medium if the server side is down.

### Single biggest unknown to resolve before committing

**Whether DanLM can be deployed off-macOS without contacting the author.** Specifically: can the compiled `.so` modules (`engine/cards.so`, `engine/actions.so`, `engine/game.so`, `model/network.so`, `model/transformer.so`, `encoding/tokenizer.so`, `encoding/encoder.so`, `eval/agents.so`, `eval/evaluator.so`, `eval/baseline_adapter.so`) be (a) rebuilt for Linux from source the author may share privately, (b) replaced with reverse-engineered Python, or (c) replaced with a clean ONNX export of just the Transformer?

If **none of these are feasible**, DanLM is effectively unavailable to us in production and the "Hard" tier collapses to LLM-only. Recommended action: **open an issue on `dashidhy/DanLM` asking about Linux deployment** *before* writing the bot architecture spec. This is a 1-day investigation that gates a significant downstream decision.

Secondary unknowns:

- **License negotiation cost for DanLM** if we ever monetize (Apache-2-NC blocks commercial use without written permission).
- **6- and 8-player mode behavior** — *no surveyed AI repo handles these*. We will need to either (a) restrict bot mode to 4-player at launch, (b) train our own variant (impractical), or (c) use rule-based bots for 6/8 and DanLM only for 4. Plan to ship Easy/Medium for 6/8 mode at launch.

### Can the AI ship as part of v1?

**Easy and Medium tiers: yes.** They're TypeScript ports / lifts of existing MIT-licensed code, runnable in browser, no inference cost. Conservative effort estimate: 2-3 weeks for a confident shipping engineer, including UI hooks for the bot's "is thinking" indicator, persona selection, and the auto-sort-hand interaction that uses the same decomposer.

**Hard tier (LLM): yes, optional.** `aiService.ts` is portable but you'll want to budget for (a) API key handling, (b) move-latency UX (need streaming indicator, ~2 s per move felt by user), (c) per-game cost monitoring. Adds ~1 week if scope is "single persona, candidate mode, DeepSeek default."

**Hard tier (DanLM): probably not v1.** Resolving the Linux deployment, hosting a Python sidecar, exposing it via authenticated RPC, and handling failover is realistic 3-4 weeks plus the unknown of whether the binaries even work for us. Defer to **v1.1 / "Ranked Mode"** after the rest of the product is stable, and run Easy/Medium/LLM-Hard in the launch product.

### Net recommendation

Lift `autoGrouper.ts` + `ruleValidator.ts` + `cardEngine.ts` from `zdhgg/Guandan-training` (MIT, recent, TS). Compile Bobgy's `strategy.cpp` to WASM for the "suggest a play" UX surface AND as the inner solver for our Easy/Medium bots. Implement the persona-weighted candidate selection in pure TS (based on the patterns in `Guandan-training/aiService.ts` but without the LLM dependency). Add an LLM-backed Hard tier behind a feature flag, defaulting to DeepSeek-chat. Treat DanLM as a research goal for v1.1 *only after* getting a Linux-deployment answer from the author.

The biggest engineering risk is not the AI — it's the wildcard-aware decomposition, which all five repos handle differently and which `autoGrouper.ts` solves credibly in TS already. Borrow that, validate it against a few hundred test hands generated by Bobgy's WASM solver (cross-check), and the AI substrate is solid.

---

## Source references

- [Bobgy/poker-guandan-strategy](https://github.com/Bobgy/poker-guandan-strategy) — MIT, 4-year-dormant-but-recently-revived DFS WASM decomposer
- [agil27/Quentain](https://github.com/agil27/Quentain) — Apache-2, dormant, no AI
- [shuilongzhu/ai-guandan](https://github.com/shuilongzhu/ai-guandan) — license unstated, dormant, Go server with strong rule-based decomposition
- [dashidhy/DanLM](https://github.com/dashidhy/DanLM) — Apache-2-NC, active, #1 Botzone leaderboard, macOS-only binaries
- [zdhgg/Guandan-training](https://github.com/zdhgg/Guandan-training) — MIT, active, TS/Node monorepo with LLM-backed bot
- [DanZero (arXiv 2210.17087)](https://arxiv.org/abs/2210.17087) — AAAI 2023 baseline paper. 30 days × 160 CPU × 1 GPU training; first published Guandan RL bot.
- [DanZero+ (arXiv 2312.02561)](https://arxiv.org/abs/2312.02561) — Follow-up paper, DMC + policy-based RL + pre-trained models
- Project lead's sibling repo: `../guandan-scorer/src/game/` — existing JS rule engine for team-level progression. Reuse where applicable.
