# Guandan Online (掼蛋联机)

Real online multiplayer **Guandan** (掼蛋) — landscape-first web game for 4 / 6 / 8 players.

## Status

🚧 **P0 foundation implementation in progress.** Research, planning, and static wireframes are complete. See `docs/research/` and `docs/plan/` for source context.

Current code includes pure TypeScript auth helpers, online player-profile creation with IP throttle, 4P/6P/8P Guandan rules primitives, Easy/Medium bot foundations, room lifecycle/API handlers with per-player room tokens, Upstash REST-backed persistence adapters, bounded SSE stream polling + replay framing, long-poll replay fallback, hidden-state payload filtering, idempotency/event-log helpers, distributed Upstash-backed rate limiting with memory fallback, same-room same-IP warning detection with public payload IP stripping, report/admin moderation endpoints, ban enforcement on room join, official `botid` server verification plus header fallback for protected mutation routes, browser-side BotID initialization for protected POST routes, latency telemetry ingestion/aggregation plus a client beacon helper and admin latency panel, disconnect tracking with cron-driven Medium bot takeover, deterministic self-play benchmarking, a Vite/React game-table shell with card/hand/trick/avatar primitives and orientation wrapper, typed room/moderation/move/round/phase-action/assist API clients, room create/waiting/browser screen foundations with host kick controls, public-room tokenless join flow, report button, admin dashboard wiring, tribute/exchange phase modals, a filtered-view phase overlay adapter, a React SSE stream hook for filtered live views, active-room play/pass/round/tribute/exchange/assist POST wiring, and security grep coverage under `lib/`, `api/`, `src/`, `scripts/`, and `tests/`.

Tribute and exchange now have server-side progression coverage: post-round advance (`api/round/next`), tribute selection, return selection, exchange vote, exchange selection, filtered event publish, and hidden-state replay tests. Bot support includes legal-move enumeration, Easy/Medium policies, hand sorting / move suggestions, stable bot identities, human-like timing helpers, bounded inline bot chaining in `api/move`, `api/tick` and `api/cron/dcCheck` for continuation work, and deterministic local self-play round/benchmark harnesses. Room support includes create/join/leave/list/kick plus host-controlled start with bot fill and redacted public room payloads. SSE, move, round-next, leave, tribute, exchange, and server-side assist suggestions require the active player's room token before serving private state or accepting room/game commands. UI support includes the first game-table screen, reusable playing-card primitives, CSS rotate orientation foundation, room create/waiting/browser screen foundations, moderation and latency admin surfaces, S20-S23 tribute/exchange modals, round-end placement/next-round panel, client-view phase adaptation, filtered SSE state consumption, active-room move/round/phase submissions, and table-side `理牌` / `提示` controls. Remaining integration work includes live Vercel SSE validation with two browser tabs, tuning the current event-log polling loop against real Upstash/Vercel latency, live BotID production verification, real-device validation, AI WASM/Elo work, and deployment milestones.

## Development

```bash
npm install
npm run dev
npm run build
npm test
npm run typecheck
npm run test:coverage
npm run security:no-leak
npm run bench:ai -- 20 1 300
npm audit --audit-level=moderate
```

Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to use Redis-backed room/state/idempotency/event-log/report/profile/telemetry persistence. Vercel Marketplace's `KV_REST_API_URL` and `KV_REST_API_TOKEN` names are also accepted. These must point at a dedicated `guandan-online-codex` Redis/Upstash project; do not reuse the production scorer database. Set `INTERNAL_TICK_SECRET` to require `x-internal-secret` on `api/tick` and `api/cron/dcCheck`. Set `ADMIN_TOKEN` for admin report/ban/reset/latency endpoints. Without Upstash env vars, route defaults use process-local memory stores for local tests.

## Deployment isolation

This Codex build is intentionally isolated from the original scorer app:

- GitHub repo: `xingfanxia/guandan-online-codex`
- Vercel project: `panpanmao/guandan-online-codex`
- Database: dedicated online Redis/Upstash env vars only

The companion scoring app lives at [`../guandan-scorer`](../guandan-scorer) and remains useful as a rule-engine reference, but this app does not share its database, auth namespace, or production environment variables.

## License

TBD — to be decided before public launch.
