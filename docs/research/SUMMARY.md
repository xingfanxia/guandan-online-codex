# Research Synthesis — Guandan Online

**Status**: Research phase complete (2026-05-16). Five investigation streams ran in parallel; this document is the cross-cutting synthesis. Read this first; the per-stream files are the deep references.

## TL;DR

1. **Realtime stack: Vercel-native SSE+POST + Upstash Redis pub/sub** (decision 2026-05-16). Vercel Functions cannot host WebSockets, but the SSE+POST pattern meets Guandan's 200ms latency budget when bot logic runs inline in the move handler. Decision is platform unity over framework convenience — accept ~200 lines of hidden-state + reconnect glue rather than add a second hosting target (Fly.io). Colyseus on Fly.io remains as an "if-SSE-hits-a-wall" backup, but is NOT in the v1 plan. A deep-dive on sync mechanism best practices (still framework-agnostic) is queued as follow-up.
2. **AI is shippable in v1 with multi-tier difficulty**, but the top-tier neural engine (DanLM) is deferred to v1.1 due to macOS-only binaries. Easy / Medium / Hard tiers ship via TypeScript rule-based bots + WASM solver + LLM (DeepSeek) — total ~3-4 weeks of AI work.
3. **Rules engine is half-built.** `hash-panda/guandan-guide` provides a tested TypeScript trick / hand-recognition engine to port. The sibling `guandan-scorer` already has scoring / progression / A-level logic. Eight items remain to write from scratch (deal/shuffle, trick orchestration, 接风, tribute, 报牌, etc.).
4. **Landscape mobile: force-landscape via CSS rotate, Majsoul-style.** No commercial Guandan app ships landscape, but Majsoul / 4399 / WeChat H5 games widely use the CSS `transform: rotate(90deg)` pattern on iOS Safari where `screen.orientation.lock()` is not supported. The "three hard problems" the agent flagged are real for general web apps but tractable for a static-layout card game. Rotate-prompt overlay drops from "primary iOS path" to "emergency fallback." See `mobile-landscape-ux.md` § "Update 2026-05-16".
5. **Rendering: CSS DOM, not Canvas.** A Guandan table has < 100 visible card nodes. CSS `transform` + `opacity` is faster to build, easier to theme, more accessible, and meets the 60 fps budget on a 2-year-old Android. PixiJS / Phaser are over-spec'd.

## Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | **Vite + TypeScript + React** | Vite for fast HMR + ESM-native builds. React because every reference impl converged on it. SSR not needed for a game. |
| State on client | Reactive store (Zustand) + transport-specific sync layer | Final shape depends on realtime transport decision below. |
| Rendering | **CSS `transform` / `opacity`** | Per mobile UX research: < 100 nodes, easy theming, accessible. Reject Pixi/Phaser. |
| Orientation lock | **CSS `transform: rotate(90deg)`** (Majsoul-style) + native lock on Android | Force-landscape works on iOS Safari via CSS rotate. Rotate-prompt is fallback only. |
| Realtime transport | **Vercel SSE+POST + Upstash Redis pub/sub** | Decision: stay on Vercel for platform unity (no Fly.io / extra dependency). ~$0 marginal cost. ~200 lines of glue for hidden-state filtering + reconnect. Inline bots in POST handler. |
| Backup if SSE hits a wall | Colyseus on Fly.io | Not in v1 plan. Escape hatch if SSE+POST proves inadequate at production scale or against specific edge cases. |
| Persistence (room history) | Upstash Redis (Vercel Marketplace) | Same as sibling scorer. Game-state-per-round persisted for reconnect + replay. |
| Frontend host | Vercel | Already where the sibling lives, easy preview URLs, AI Gateway / shadcn integrations available. |
| Auth | Anonymous handle (`@handle`) | Same model as sibling scorer. No accounts in v1. |
| Rules engine | **Port `hash-panda/guandan-guide`** (TypeScript) | The most rigorous open-source trick engine. Add scorer's progression layer on top. |
| AI v1 (Easy / Medium) | TS bots from `zdhgg/Guandan-training` (MIT) + WASM solver from `Bobgy/poker-guandan-strategy` | Server-side, inline in room loop (Vercel POST handler or Colyseus `setSimulationInterval`). |
| AI v1 (Hard) | LLM via DeepSeek + candidate pre-filter | Feature-flagged; ~$0.01–0.05 per game. |
| AI v1.1 (Expert) | DanLM (deferred) | macOS .so files block Linux deployment. Open issue with author; defer until resolved. |

## Recommended AI strategy

The user explicitly asked for "different difficulty AI." The temptation is to express this as "same engine + varying search depth." That works for chess but not for partner-card games like Guandan, where difficulty is more about **judgment** (when to play a bomb, when to hold for partner) than **lookahead**.

We will instead use **different engines per difficulty tier**:

| Tier | Engine | Behavior | Source |
|---|---|---|---|
| **Easy** | Pure rule-based with random noise | Plays valid moves preferring smallest combos. Random temperature 0.3. Will occasionally bomb out partner. | Lifted from `zdhgg/Guandan-training/autoGrouper.ts` |
| **Medium** | Rule-based + WASM single-hand solver | Calculates "fewest plays to clear hand" via Bobgy's solver; picks the play that minimizes hand fragmentation. | `Bobgy/poker-guandan-strategy` WASM |
| **Hard** | LLM with candidate pre-filter | Engine generates 5-10 legal candidate plays; LLM prompted with table state + each candidate's pros/cons; LLM picks. ~3-5s per move. | DeepSeek via Vercel AI Gateway |
| **Expert** | DanLM neural net | Top human-amateur strength | **Deferred to v1.1** |

Tier name visible to player as 入门 / 进阶 / 高手 / 大师 (大师 grayed out until v1.1).

**6/8-player mode**: only Easy + Medium ship. No surveyed AI handles 6/8 mode. Mark Hard as "coming soon" for those room sizes.

## Recommended UX direction

The mobile UX stream surfaced concrete constraints:

- **Orientation**: tier 1 = native `screen.orientation.lock()` after `requestFullscreen()` (Android only); tier 2 = CSS `transform: rotate(90deg)` on root container (iOS Safari + any device where tier 1 fails); tier 3 = rotate-prompt overlay (emergency fallback). The Majsoul-style "phone held in portrait → game renders in landscape via CSS rotate" is the iPhone default — see `mobile-landscape-ux.md` § Update 2026-05-16.
- **Table layout** (landscape):
  - 4-player: bottom (me) / top (partner) / left + right (opponents). Center = trick area.
  - 6-player: bottom (me) / top-row of 3 (left-partner / top-opponent / right-partner) / left + right (remaining 2). Or stretched octagon.
  - 8-player: bottom-row (me + my partner indicator) / top-row of 3 / left + right (1 each). Or two-row top strip.
- **Hand display**: straight overlapping row, 28px visible width per card, ≥12px corner rank/suit font. 27 cards fits on iPhone 14 Pro landscape (390 × 844 → 797 × 335 playfield).
- **Interaction**: tap-to-lift, then Play button to confirm. NOT single-tap-to-play, NOT drag-to-play.
- **Auto-arrange** (理牌): persistent button, always available, doesn't auto-trigger on every deal.

Visual style is open. Sibling project has 5 production themes (Broadcast / Linear / Trading / Atelier / Tea-Table); we may transplant one as starting point, but a card game has different visual needs than a scorer. Better to design from scratch — likely something between Marvel Snap (modern card game polish) and Hearthstone mobile (cinematic).

## Reusable assets

### From sibling `../guandan-scorer/`
- Upgrade calculation: `src/game/calculator.js`
- A-level state machine: `src/game/rules.js`
- 4 / 6 / 8 mode constants: `src/core/config.js`
- Settings drawer pattern + room codes + Upstash KV usage (`api/rooms/*`)

### From `hash-panda/guandan-guide`
- Card type recognition: `cards.ts`
- Pattern matching: `patterns.ts`
- Bomb comparison `bombPower()`
- Note: license check required before adopting

### From `zdhgg/Guandan-training` (MIT, brand new — active commits 2026-05-16)
- `autoGrouper.ts` (38 KB) — hand decomposition heuristics
- `ruleValidator.ts` (26 KB) — move legality
- `cardEngine.ts` — game engine core

### From `Bobgy/poker-guandan-strategy`
- C++ → WASM solver with first-class red-heart-wildcard search
- Already deployed as a PWA — proven runnable in browser

### From `dengweiqh/guandan-windows` (Apache-2.0, do NOT adopt code wholesale)
- 4-tier AI architectural pattern (Web Worker — adapt for our server)
- Dealing animation choreography
- Tribute phase UI flow
- Rule presets (classic / tournament)
- Voice callouts (later phase)

## Key risks (ranked)

1. **Hidden-state glue is hand-written**. The Vercel SSE+POST path needs ~50 lines of careful per-message filtering to ensure private hand state never leaks to other players. Unlike Colyseus's framework-enforced `@view`, this is server-code-reviewer-must-catch-it discipline. Mitigation: centralize all outgoing-message construction in one `buildClientPayload(playerId, eventType, payload)` function, audit it once, then never hand-construct outgoing messages elsewhere. Add a unit test that grep-asserts no `res.write(JSON.stringify(roomState))` exists outside that function.

2. **AI quality at "Hard" tier**. LLM-based bots are unproven in adversarial partner-card play. Risk: they make obviously dumb plays that ruin the game for human partners. Mitigation: candidate-mode prompts (engine generates legal moves, LLM only picks among them) prevents catastrophic errors but caps ceiling. If quality is unacceptable, fall back to Medium tier with more compute (deeper rule-based search) until DanLM ships in v1.1.

3. **Tribute mechanic is gnarly**. 进贡 / 还贡 + 抗贡 condition + direction in 6/8 mode is the most under-documented part of Guandan rules. None of the open-source projects implement this fully. Plan dedicated UX + engine work for tribute phase. Risk of "tribute bugs" that confuse new players.

4. **CSS rotate edge cases on iOS**. Android uses native orientation lock cleanly. iOS Safari uses CSS `transform: rotate(90deg)` (Majsoul pattern). Known risk surfaces: virtual keyboard appears in un-rotated coordinate space (mitigation: temporarily exit rotate on input focus); `position: fixed` and `vh`/`vw` reference un-rotated viewport (mitigation: JS-set `--logical-w/h` CSS vars); WebKit rotation bugs occasionally surface on specific device/OS combos. Budget 3-5 days mobile UX work + a test matrix across iPhone SE / 14 Pro / iPad / Pixel.

5. **27-card hand on small landscape phones**. iPhone SE / older Android < 5.5" may not fit 27 cards at readable size in a single row. Fallback: two-row hand at narrow widths, or horizontal scroll.

6. **8-player mode hand size policy**. 108 ÷ 8 = 13.5 — half a card. The rules research found this is regional. Mark as configurable in room creation (13 or 14 cards, with the 4 leftover cards going to leader / random / discard pile).

7. **DanLM platform lock-in**. Author distributes only macOS ARM64 binaries. If we want top-tier AI in v1.1, we need either Linux binaries from author, source code, or our own re-training. **Open issue with author before v1.1 planning begins.**

8. **License check**. Before adopting code from `hash-panda/guandan-guide`, `zdhgg/Guandan-training`, `Bobgy/poker-guandan-strategy`: verify each license allows our use. Three of four references have stated licenses (MIT, Apache-2.0); `shuilongzhu/ai-guandan` has none → cannot reuse.

## Decisions made (2026-05-16)

- **Realtime transport**: Vercel SSE+POST + Upstash Redis pub/sub. No Fly.io / extra dependency. Colyseus retained as backup only.
- **Mobile orientation**: CSS `transform: rotate(90deg)` (Majsoul-style) as primary on iOS, native lock on Android, rotate-prompt as emergency fallback only.

## Open questions (resolve before plan phase)

1. **Frontend framework**: React confirmed, but TypeScript-only without React (lightweight, Hyperapp-style) is on the table given that game UI is mostly imperative animation. **Default to React** unless someone argues otherwise.

2. **Card visual style**: classic poker face vs minimalist tech vs editorial illustration. The sibling scorer's Atelier and Tea-Table themes already have card visual languages we could borrow. **Punt to design phase.**

3. **Account model**: anonymous handles (sibling pattern) vs Sign in with Vercel vs full auth (Clerk). **Default to anonymous handles** — same as sibling, lowest friction.

4. **Match persistence**: ephemeral rooms (game ends → state gone) vs persistent match history per player. Sibling already has player profile system. **Default to: room state ephemeral, post-game stats sync to player profile** (same pattern as sibling).

5. **Asset licensing**: card art, sound effects. Use openly-licensed playing card SVGs (there are several public-domain sets) for v1. Custom illustration in a polish phase.

6. **Spectator mode**: yes/no in v1. Sibling has viewer-mode for rooms. **Default to: yes, read-only spectators allowed** (Colyseus has built-in spectator support).

## Recommended next step

Move into **design + visual wireframes** per the user's original brief. Specifically:

1. Single-page design doc covering:
   - Architecture (game server + frontend + KV split)
   - Core game loop (deal → bid → trick → tribute → end)
   - AI tier system
   - Custom room rule axes (which rules are toggleable per room)
   - Auth + handle system
   - Room lifecycle (create / invite / join / disband)
2. Visual wireframes (HTML mockups) for landscape phone, for:
   - 4-player table at trick start
   - 4-player table at tribute phase
   - 6-player table (less critical, can be skipped if 4-player works)
   - Room create screen (custom rules pickable)
   - Lobby / room browser
   - Mobile rotate-prompt overlay
3. Implementation plan with `<MILESTONE>-N: description` naming (per global convention):
   - **CORE-1**: rules engine port + unit tests
   - **CORE-2**: Colyseus server + 4-player session lifecycle
   - **UI-1**: card components + hand display + landscape layout
   - **UI-2**: 4-player table + trick flow
   - **AI-1**: Easy + Medium bots inline
   - **NET-1**: Colyseus client integration + reconnect
   - **ROOM-1**: room create / invite / join
   - **TRIBUTE-1**: tribute phase end-to-end
   - **AI-2**: LLM Hard tier
   - **UI-3**: 6 / 8 player layouts
   - **POLISH-1**: animations / sounds / themes

Expect milestones to overlap and reorder based on dependencies. The plan phase will work all this out properly.

---

## Per-stream references

- AI engines: [`ai-strategies.md`](ai-strategies.md) (5,400 words)
- Game rules: [`game-rules.md`](game-rules.md) (5,660 words)
- Existing implementations: [`existing-implementations.md`](existing-implementations.md)
- Architecture: [`architecture-options.md`](architecture-options.md)
- Mobile UX: [`mobile-landscape-ux.md`](mobile-landscape-ux.md) (5,250 words)
