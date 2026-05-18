# CLAUDE.md

Guidance for Claude Code (and other AI assistants) working on **guandan-online**.

## Project overview

Real online multiplayer Guandan (掼蛋) — landscape-first web game. 4 / 6 / 8 player rooms, AI bots with multiple difficulties, auto-sort hand, custom rules per room, invite links, real-time play.

Companion to sibling `../guandan-scorer` (in-person scoring/tracking app). This project is the actual playable game; the scorer was scoring-only. The Codex build is isolated as `guandan-online-codex` and must not share the scorer's database, auth namespace, Vercel env vars, or production resources.

## Current phase

**P0 foundation implementation.** Research, design wireframes, and the master plan are complete. Findings live under `docs/research/`; execution guidance lives under `docs/plan/`.

Implementation should follow the P0 milestone order from `docs/plan/PLAN.md`, with the 2026-05-18 isolation amendment applied:

1. AUTH-2 sibling scorer key migration is canceled for this Codex build. Online profiles use an independent `go:player:*` namespace in a dedicated Redis/Upstash project.
2. AUTH-1 / CORE-1 pure auth helpers and 4P/6P/8P rules primitives exist under `lib/`.
3. ROOM-1 / ROOM-3 / NET-1 / NET-3 scaffolding exists under `api/` and `lib/realtime/`: room lifecycle, public room listing, selectable 4P/6P/8P room capacity, host-controlled room start with bot fill and kick, started-room locking, lowest-open-seat join allocation, per-player room tokens, move POST, bounded SSE stream polling + replay framing, long-poll replay fallback, idempotency, event logs, hidden-state payload filtering, self-hydrating filtered views on gameplay mutation responses, and Upstash REST-backed persistence adapters.
4. TRIBUTE-1 / EXCHANGE-1 server progression exists for post-round advance, default server-side tribute auto-pick, bot tribute/return/exchange vote/exchange-select automation, tribute selection, return selection, exchange vote, exchange selection, state-node payload filtering, and filtered SSE publish. S20-S23 tribute/exchange modal surfaces, typed phase-action clients, and filtered-view table/overlay adapters exist; production API/SSE smoke passes, but live Vercel two-tab UI validation is still pending.
5. AI-1 / AI-3 / AI-4 foundation exists for legal-move enumeration, Easy/Medium bot decisions, hand sorting / move suggestions, token-protected server-side assist suggestions, stable bot identities, human-like timing helpers, bounded inline bot chaining in `api/move`, automatic bot phase actions after human phase submissions, `api/tick` continuation, `api/cron/dcCheck` disconnect takeover guarded by `INTERNAL_TICK_SECRET` when configured, and deterministic local self-play round/benchmark harnesses. WASM solver and Elo-rated benchmark league are still pending.
6. SEC foundation includes shared memory / Upstash fixed-window rate limiting wired into core mutation routes, online profile creation with IP throttle, same-room same-IP warning detection, per-player room-token authorization on default SSE/move/round-next/leave/tribute/exchange/assist routes, report/admin moderation endpoints, ban enforcement on room join, an admin dashboard client surface, official `botid` server verification plus header fallback on move/report submissions, and browser-side BotID init for those protected POST routes. Live production BotID verification is still pending.
7. DEPLOY-2 telemetry foundation exists for latency beacon ingestion, p50/p95/p99 aggregation, a measured POST beacon helper, admin latency endpoint, and admin latency panel.
8. UI-1 / UI-2 / UI-3 / SEC-3 UI foundation exists as a Vite/React app shell with required local player-handle setup, card, hand, trick, avatar, first game-table screen, CSS rotate orientation wrapper, typed profile/room/moderation/move/round/phase-action/assist API clients, create/waiting/browser screens with 4P/6P/8P picker, active-room loading state, waiting-room kick controls, tokenless public-room join, report button, admin dashboard wiring, tribute/exchange phase overlays, round-end placement/next-round panel, filtered SSE state consumption, local active-room reconnect persistence, disconnect takeover badge, table-side `理牌` / `提示` controls, and active-room move/round/phase/assist POST wiring. Real-device orientation validation and live deployed table validation are still pending.
9. Validate the bounded SSE polling loop against real Upstash/Vercel latency before treating the realtime defaults as production-ready.
10. Full-game API integration coverage exists for all-human and human+bot 4P/8P games through create/join/start/move/round/tribute APIs to `game-end`; production API smoke covers create/start/poll/SSE/move, but live browser production validation is still a separate gate.
11. Server-side `api/` and `lib/` imports intentionally use explicit `.js` specifiers. Do not remove them; Vercel's frameworkless TypeScript functions run as Node ESM after emit and production API routes fail without fully specified imports.
12. Route default exports are intentionally wrapped with `api/_node.ts` `universalHandler`. Unit tests call them with Web `Request`; Vercel invokes them as Node `(req, res)`, so both paths must remain covered by `tests/api/nodeAdapter.test.ts`.
13. Later phases remain gated by the acceptance criteria in `docs/plan/PLAN.md`.

## Domain references

- **Sibling rule engine reference** — `../guandan-scorer/src/game/` (calculator.js, rules.js) has working A-level / 4-6-8 mode / upgrade logic. Reuse rule semantics where useful, but do not read or write scorer data.
- **Existing scorer themes** — sibling has 5 production themes (broadcast / linear / trading / atelier / teatable) with proven visual tokens. May or may not transplant; the game UI has very different needs from a scorer.
- **Research findings** — see `docs/research/README.md` for the index.

## What this app is NOT

- Not a fork or rewrite of guandan-scorer. Scorer continues to exist for in-person scoring.
- Not a single-device pass-and-play game. This is real online multiplayer.
- Not portrait-mode. Landscape only on mobile (forced via CSS + orientation prompt fallback).

## Anti-patterns to avoid

- Premature architecture choices before research completes
- Cloning sibling project's structure wholesale — different problem domain
- Stub AI bots that play randomly — the brief explicitly asks for **different difficulties**, so AI quality matters

## Layout conventions

Follow the global file-organization rules from `~/.claude/CLAUDE.md`:
- Docs → `docs/<topic>/`
- Adhoc scripts → `scripts/<topic>/`
- No flat dumps at repo root

## Last updated

2026-05-18 — P0/P1 foundation implementation in progress in the isolated `guandan-online-codex` clone; selectable 4P/6P/8P rooms, required local player-handle setup, started-room locking, stable seat-id allocation, local active-room reconnect persistence, server-side tribute/exchange progression with default tribute auto-pick and bot phase automation, self-hydrating filtered mutation responses, Easy/Medium bot foundations, server-side assist suggestions, deterministic local self-play and benchmark CLI, full-game 4P/8P API integration tests, Vercel Node API adapter coverage, disconnect bot takeover, backend anti-abuse controls, per-player room-token auth, telemetry backend/admin panel, room/admin UI wiring, S20-S23 phase overlays, round-end advance panel, filtered SSE hook, and active-room table actions are wired.
