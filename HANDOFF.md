# Handoff — guandan-online

**Date**: 2026-05-18
**Status**: P0 foundation implementation in progress in the isolated `guandan-online-codex` clone. Pre-implementation research/design/plan remains complete; implementation has now started.
**Repo**: https://github.com/xingfanxia/guandan-online-codex
**Domain (locked)**: `gdo.ax0x.ai` (sibling subdomain to scorer at `gd.ax0x.ai`)

---

## Codex implementation update — 2026-05-18

Implemented in this clone:
- TypeScript/Vitest project scaffolding (`package.json`, `tsconfig.json`, `vitest.config.ts`)
- AUTH-1 helpers: handle normalization and online ownership-token validation using the scorer's token-hash pattern
- CORE-1 / CORE-2 / CORE-3 foundation: card model, patterns, bombs, wildcard counting, mode constants, deal, turn/trick flow, move validation, round-end, level progression, and game-end progression
- NET-1 / NET-2 / NET-3 scaffolding: move POST handler, bounded SSE stream polling + replay framing, long-poll replay fallback, message union, Upstash REST client/publish wrapper, Redis-backed state/idempotency/event-log adapters, client reconnect helper, React filtered-view stream hook, hidden-state payload filter for both live publish and replay, CI grep guard
- ROOM-1 / ROOM-3 scaffold: room code generation, async lifecycle store, Upstash-backed room store, create/join/leave/list/kick/start route handlers, 4P/6P/8P room mode and capacity selection, public room payload projection, non-public room filtering, host-controlled room start with bot fill and waiting-room kick controls, started-room lock/removal from public listing, lowest-open-seat join allocation after kick/leave gaps, crypto-backed room tokens, per-player room tokens with public payload redaction
- ROOM-2 / TRIBUTE-1 / EXCHANGE-1 core slices: room rule axes, 4P/6P/8P tribute planning including 2-team sweep pairings, anti-tribute checks, tribute/return card validation, exchange vote/select/swap helpers, tribute/exchange state-node payload filtering, `api/round/next`, `api/tribute/select`, `api/exchange/vote`, `api/exchange/select`
- Server-side round progression: 6P/8P round-end detection, post-round transition into tribute/anti-tribute/exchange vote/normal play, default server-side tribute auto-pick, bot tribute/return/exchange vote/exchange-select automation, tribute selection into return selection, return selection into exchange vote or play, exchange vote into selection or play, exchange selection into play, and next-hand level progression preservation. Gameplay mutation routes now return the acting player's filtered `view` so the UI can hydrate immediately while SSE replay catches up.
- AI-1 / AI-3 / AI-4 foundation: legal-move enumeration, Easy/Medium bot policies, hand sorting / move suggestions, token-protected server-side assist suggestions, stable bot identities, human-like timing helpers, `runBotTurns`, deterministic local `runBotRound` and `runBotBenchmark` harnesses, bounded inline bot chaining in `api/move`, automatic bot phase actions after human phase submissions, `api/tick` continuation, and `api/cron/dcCheck` disconnect takeover guarded by `INTERNAL_TICK_SECRET` when configured
- SEC foundation: shared memory / Upstash fixed-window rate limiter wired into core mutation routes with 429 coverage; `api/auth/createHandle` online profile creation with 5-per-IP daily throttle; same-room same-IP warning detection with public payload IP stripping; per-player room-token authorization on default SSE/move/round-next/leave/tribute/exchange/assist routes; report storage/dedupe, `api/report`, `api/admin/reports`, `api/admin/ban`, `api/admin/reset-stats`, ban enforcement on room join, official `botid` server verification plus header fallback on `api/move` / `api/report`, and browser-side BotID init for those protected POST routes
- DEPLOY-2 telemetry foundation: `api/telemetry/latency`, `api/admin/latency`, latency sample validation, memory/Upstash telemetry store, p50/p95/p99 aggregation helper, client-side measured POST beacon helper, and admin latency panel
- UI-1 / UI-2 / UI-3 / SEC-3 UI foundation: Vite/React app shell, required local player-handle setup with profile persistence, first game-table screen, card/hand/trick/avatar primitives, locked token imports, CSS rotate orientation wrapper/prompt, typed profile/room/moderation/move/round/phase-action/assist API clients, create/waiting/browser screens with 4P/6P/8P picker, waiting-room host kick controls, public-room tokenless join flow, report button, admin dashboard wiring, latency admin panel, tribute/exchange phase modals, round-end placement/next-round panel, filtered-view table + phase overlay adapters, active-room loading state, local active-room reconnect persistence, table-side `理牌` / `提示` controls, disconnect takeover badge, active-room play/pass/round/tribute/exchange/assist POST wiring, component tests, and production build script
- Full-game API integration coverage for all-human and human+bot 4P/8P games from create/join/start through move, round-next, tribute return, and `game-end`, including player-token authorization and hidden-state replay checks
- Production API runtime fix: server-side `api/` and `lib/` imports use explicit `.js` specifiers so Vercel's frameworkless TypeScript functions resolve under Node ESM

Verification after the update:
- `npm test` — 90 files / 356 tests passing
- `npm run typecheck` — passing
- `npm run build` — passing
- `npm run test:coverage` — 90.36% statements / 93.37% lines
- `npm run security:no-leak` — passing
- `npm run bench:ai -- 1 8 300` — 1/1 8P Easy self-play round completed
- `npm audit --audit-level=moderate` — 0 vulnerabilities
- `vercel build --prod --scope panpanmao` — passing; generated `api/room/list` imports under Node ESM

Still not complete:
- AUTH-2 scorer key migration is superseded for this Codex build. The online game now owns an independent `go:player:*` namespace and must use a dedicated Redis/Upstash project.
- Route defaults use Upstash-backed persistence when `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` or Vercel Marketplace `KV_REST_API_URL` / `KV_REST_API_TOKEN` are present; without env vars they intentionally fall back to process-local memory stores for local tests.
- Dedicated Upstash KV env vars are configured on `panpanmao/guandan-online-codex` for Production and Preview through Vercel Marketplace. Do not copy scorer database credentials into this project.
- Full-game route-handler integration is covered locally, and Vercel Authentication has been disabled for this project. Live Vercel SSE+POST validation with two browser tabs still needs a post-deploy pass.
- SSE uses bounded polling over the per-player event log; tune `pollMs`/duration against real Upstash/Vercel latency before production.
- `api/round/next` is the explicit server transition from `round-end` into the next hand; `api/move` still stops at `round-end` so the UI can show the round summary before advancing.
- AI WASM solver, Elo-rated benchmark league, live BotID production verification, real-device orientation validation, live deployed table validation, and deployment milestones remain pending per `docs/plan/PLAN.md`.

---

## What's in this repo

Three pre-implementation deliverable layers were complete in commit `eeb6e18149a649c12d118d415188747bf7802c2e`; the P0 implementation update above adds code on top of that baseline.

### 1. Research (`docs/research/`) — 14 documents · ~70K words · 8,200+ lines

| File | Purpose |
|---|---|
| [`SUMMARY.md`](docs/research/SUMMARY.md) | Cross-cutting synthesis · 14 locked decisions · 10 ranked risks |
| [`ai-strategies.md`](docs/research/ai-strategies.md) | 5 reference AI engines analyzed |
| [`game-rules.md`](docs/research/game-rules.md) | Complete Guandan ruleset (cards / patterns / bombs / wildcards / A-level / 4/6/8-mode differences) |
| [`existing-implementations.md`](docs/research/existing-implementations.md) | Open-source + commercial UX scan |
| [`architecture-options.md`](docs/research/architecture-options.md) | Realtime transport options (Vercel SSE+POST locked) |
| [`mobile-landscape-ux.md`](docs/research/mobile-landscape-ux.md) | Orientation lock + CSS rotate Majsoul pattern |
| [`realtime-sync-deep-dive.md`](docs/research/realtime-sync-deep-dive.md) | Production card-game sync survey + prescriptive Vercel SSE+POST spec |
| [`ai-implementation-plan.md`](docs/research/ai-implementation-plan.md) | Per-tier AI algorithm pseudocode + player assistance |
| [`tribute-ux-deep-dive.md`](docs/research/tribute-ux-deep-dive.md) | 进贡/还贡/抗贡 + 6P/8P sweep paths + 换牌 rule |
| [`card-visual-assets.md`](docs/research/card-visual-assets.md) | Unicode + Geist verdict (zero external SVG) |
| [`china-network-deployment.md`](docs/research/china-network-deployment.md) | PRC reachability + Tencent Cloud fallback path |
| [`anti-cheat-deep-dive.md`](docs/research/anti-cheat-deep-dive.md) | Account-level + collusion + scripted-client mitigation |
| [`cross-project-integration.md`](docs/research/cross-project-integration.md) | Historical scorer integration options; Option B is superseded for the Codex build |
| [`card-game-ui-conventions.md`](docs/research/card-game-ui-conventions.md) | 斗地主 + 德扑 oval table layout patterns |

### 2. Plan (`docs/plan/`)

| File | Purpose |
|---|---|
| [`README.md`](docs/plan/README.md) | Phase model + dependency graph + naming convention |
| [`PLAN.md`](docs/plan/PLAN.md) | Master execution plan · ~31 milestones across 6 phases · per-milestone (goal, deps, deliverables, acceptance, files, effort) · 10-row risk register · 8-week calendar |

### 3. Wireframes (`demos/`)

| File | Purpose |
|---|---|
| [`index.html`](demos/index.html) | Hi-fi wireframe gallery · 23 scenes · open in browser |
| [`tokens.css`](demos/tokens.css) | Design tokens (oklch palette · Geist font · spacing/radius/shadow) |
| [`shared.css`](demos/shared.css) | Reusable components (card · panel · chip · button · avatar · phone frame) |
| `preview-v6-final.png` | Latest screenshot |

**23 scenes overview**:

- **Part 1 (S01-10)**: Landing / Create / 4P Game / Tribute (4P) / 6P / 8P / Round End / A-Level / Desktop / CSS Rotate
- **Part 1 (S11)**: Waiting (host-controlled, no auto AI countdown)
- **Part 2 (S12-19)**: Tribute pending / 抗贡 / 还贡 / 报警 / Wildcard / Ranked / Admin / DC + AI takeover
- **Part 3 (S20-23)**: 6/8P normal tribute / 6/8P sweep multi-pair tribute / 换牌 vote / 换牌 selection

---

## Locked decisions (do not revisit unless new info arrives)

1. **Realtime**: Vercel SSE+POST + Upstash Redis pub/sub (NOT Colyseus / NOT PartyKit for v1)
2. **Mobile orientation**: CSS `transform: rotate(90deg)` (Majsoul-style) on iOS, native lock on Android, rotate-prompt as emergency fallback
3. **Rendering**: CSS DOM + transform/opacity (NOT WebGL / PixiJS / Phaser / Canvas)
4. **Card visual**: Unicode suits + Geist 700 + tabular-nums (NO external SVG decks for v1)
5. **Card back**: CSS `repeating-linear-gradient` using existing tokens
6. **Wildcard treatment**: Gold edge stroke + ★ corner badge
7. **AI tier strategy**: Different engines per tier (Easy/Medium/Hard); DanLM Master deferred to v1.1
8. **Auth**: Anonymous @handle, **independent online namespace and dedicated DB** for `guandan-online-codex`; the old shared-scorer Option B is superseded as of 2026-05-18
9. **PRC delivery**: Vercel-only launch with client-side latency beacons; Tencent Cloud Shenzhen mirror deferred until p95 > 350ms observed
10. **Custom domain required day 1**: `gdo.ax0x.ai`
11. **Tribute defaults**: tournament rule baseline (server auto-picks; "贡左还右" direction; 还贡 ≤10 cap)
12. **Anti-cheat v1**: Rate limit + IP throttle + report + admin + Vercel BotID (~340 LOC, 5-6 days)
13. **6P/8P sweep tribute**: only triggers in 2-teams-of-N modes; rank-order multi-pair tribute
14. **换牌 optional rule**: OFF by default; if ON, losing team votes after round-end (>50% pass) + 3-card swap in server-RNG direction
15. **Waiting room**: host-controlled, no auto AI countdown — per-slot chip picker for difficulty/team
16. **Avatar fill color**: must match team-color ring (A=blue / B=red / C=green / D=gold)

---

## Top 10 risks (with mitigation)

| ID | Risk | Mitigation |
|---|---|---|
| R-01 | Rules engine port has bugs | CORE-1 requires 95% coverage + 100+ tests |
| R-02 | SSE+POST glue introduces hidden-state leak | NET-3 grep test on every PR + manual audit |
| R-03 | LLM Hard tier plays badly | Feature-flag, Elo bench gate, fallback to Medium |
| R-04 | iOS CSS rotate breaks on some device | UI-2 multi-device test matrix; rotate-prompt fallback |
| R-05 | PRC GFW kills SSE | NET-2 keepalive + long-poll fallback; if persists, DEPLOY-3 |
| R-06 | DanLM author doesn't respond → no v1.1 Master tier | Document deferral; Hard is good enough at launch |
| R-07 | Online env accidentally points at scorer DB | Dedicated Upstash project; env review before deploy; no scorer credentials in Vercel project |
| R-08 | Tribute edge case missed → game stuck | TRIBUTE-1 covers all 3 modes + 抗贡 + sweep + timeout |
| R-09 | License check fails on guandan-guide port | Port semantics not source; fall back to zdhgg + Bobgy |
| R-10 | 27-card hand doesn't fit on iPhone SE landscape | Two-row fallback at <600px; tested in UI-2 |

---

## Implementation entry points

When you (or future Claude session) starts coding:

1. **Read first**: `docs/plan/PLAN.md` from top
2. **Start P0**: CORE-1 (rules engine), NET-1 (transport scaffold), then live Vercel/Upstash validation. AUTH-2 is canceled for this fork.
3. **Track milestones** via `<MILESTONE>-N` naming convention (see `~/.claude/CLAUDE.md`)
4. **Verify hidden-state safety** as security-critical PR gate (NET-3 grep test)
5. **Test acceptance gates** per phase (see PLAN.md phase summary)

---

## Critique pass results (3-pass review · 2026-05-17)

| Pass | Focus | Result |
|---|---|---|
| Pass 1 | Visual consistency | ✅ All 23 scenes use shared tokens.css + shared.css. Team color rings/fills aligned post-fix. Card sizes consistent. Phone frame consistent at 852×393. |
| Pass 2 | Information accuracy (Guandan rules) | ⚠️ Found 1 logical bug — S21 sweep tribute mixed avatars from 4-teams-of-2 mode (mathematically impossible to have 4 winners same team). Fixed: S21 now explicitly 2-teams-of-N mode with all losers team B. Scene-note + rule strip + annotation updated. |
| Pass 3 | AI slop check | ✅ Real Chinese @handles (no John Doe). Real room codes (K7M2P9, P3R8K1). Real Guandan game terms throughout. No emoji-as-icons. No glassmorphism. No purple gradients. tabular-nums everywhere. Trick text max-width prevents bleed. Card fills match team ring color. |

---

## Known limitations / deferred to v1.1+

- **DanLM Master tier AI**: macOS-only `.so` files; Linux port unresolved upstream
- **PRC Tencent mirror (DEPLOY-3)**: conditional; only deploy if real-user p95 > 350ms
- **Animations (POLISH-1)**: deal cascade / play arc / level-up choreography
- **Sound design (POLISH-2)**: card play sounds / shuffle / chime
- **Ranked mode + Elo ladder (POLISH-3)**: gated on phone-verification flow
- **i18n**: Chinese only at v1; EN/JP deferred
- **Replay export**: defer to v2 (post-launch when patterns emerge)

---

## Project isolation

This project is the **online multiplayer game**. Its sibling [`guandan-scorer`](../guandan-scorer) is the **in-person scoring app** and should be treated only as a rules/reference source for this Codex build.

Isolation boundary:
- Separate GitHub repo: `xingfanxia/guandan-online-codex`
- Separate Vercel project: `panpanmao/guandan-online-codex`
- Separate Redis/Upstash project for all `go:*` online keys
- No shared `@handle` namespace, no shared scorer profile reads, no scorer DB writes
- Cross-app stats or identity linking, if wanted later, must use an explicit API boundary and remain opt-in

The historical Option B scorer-sharing plan remains in the research docs for context, but it is not the active implementation path for `guandan-online-codex`.

---

## Quick links

- **Repo**: https://github.com/xingfanxia/guandan-online-codex
- **Local demos**: `open demos/index.html`
- **Live (after deploy)**: `https://gdo.ax0x.ai`
- **Sibling scorer (production)**: `https://gd.ax0x.ai`
