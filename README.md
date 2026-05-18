# Guandan Online (掼蛋联机)

Real online multiplayer **Guandan** (掼蛋) — landscape-first web game for 4 / 6 / 8 players.

## Status

✅ **Playable v1 gameplay implementation.** The isolated Codex build now supports real rooms and full game progression on the dedicated repo, Vercel project, and Redis/Upstash database.

Current gameplay coverage includes 4P / 6P / 8P room creation, public-room join, host start, bot fill, Easy/Medium bot turns, token-protected moves, SSE plus long-poll replay, hidden-state filtering, round-end and game-end progression, level advancement through A, 4P tribute/return/anti-tribute, 6P/8P normal and sweep tribute paths, optional exchange-card voting/selection, disconnect takeover/reclaim, and active-room reconnect from local storage.

The browser app includes handle setup, create/waiting/browser/table/admin screens, the playable card table, selected-card play/pass, `理牌`, `提示`, round-next, tribute/return/exchange overlays, live filtered state consumption, report/admin controls, latency telemetry, and a Playwright production smoke covering two browser contexts joining, starting, playing, and syncing a live room. Gameplay phase endpoints now immediately continue bot turns after tribute/return/exchange/round transitions so human+bot rooms do not wait for cron when a bot is next to act.

Deferred non-blocking v1.1+ work: Hard LLM bot, per-slot bot difficulty/team picker, custom domain cutover to `gdo.ax0x.ai`, real-device orientation matrix, animations, sound, ranked/Elo ladder, i18n, replay export, and PRC mirror.

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
