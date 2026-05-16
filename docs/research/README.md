# Research Index

Pre-implementation research for `guandan-online`. 13 substantive documents, ~8,200 lines, all dated 2026-05-16.

**Read [`SUMMARY.md`](SUMMARY.md) first** — cross-cutting decisions + risks. Per-stream files are the deep references.

## Foundation streams (Phase 1)

| File | Scope | Status |
|---|---|---|
| [`SUMMARY.md`](SUMMARY.md) | **Start here.** Cross-cutting synthesis of all 13 streams. Recommended stack, AI plan, UX direction, locked decisions, open questions, v1 milestones. | ✅ |
| [`ai-strategies.md`](ai-strategies.md) | 5 reference AI engines analyzed (Bobgy / Quentain / shuilongzhu / DanLM / Guandan-training). | ✅ |
| [`game-rules.md`](game-rules.md) | Comprehensive Guandan ruleset from `hash-panda/guandan-guide` + sibling scorer. | ✅ |
| [`existing-implementations.md`](existing-implementations.md) | Open-source web/desktop impls + commercial app UX scan. | ✅ |
| [`architecture-options.md`](architecture-options.md) | Realtime stacks compared — includes 2026-05-16 update locking Vercel SSE+POST as v1. | ✅ |
| [`mobile-landscape-ux.md`](mobile-landscape-ux.md) | Orientation lock + safe areas + 4/6/8 player layouts. Includes update revising CSS-rotate as primary path. | ✅ |

## Deep-dive streams (Phase 2)

| File | Scope | Status |
|---|---|---|
| [`realtime-sync-deep-dive.md`](realtime-sync-deep-dive.md) | Production card-game sync survey (Lichess closest analog), transport comparison, state reconciliation, hidden-state enforcement, anti-cheat baseline, prescriptive MessageType + idempotency + buildClientPayload spec for Vercel SSE+POST. ~13.8K words. | ✅ |
| [`ai-implementation-plan.md`](ai-implementation-plan.md) | Per-tier algorithm pseudocode (Easy / Medium / Hard / Master), partner-aware play, N humans + N bots in 4/6/8, inline POST execution, Elo bench harness, player assistance (auto-sort + suggest + endgame). ~8.6K words. | ✅ |
| [`tribute-ux-deep-dive.md`](tribute-ux-deep-dive.md) | 进贡 / 还贡 / 抗贡 across 4/6/8 modes — cross-referenced 4 tournament PDFs to resolve all prior open questions. New message types for SSE+POST. ~5.4K words. | ✅ |
| [`card-visual-assets.md`](card-visual-assets.md) | SVG card-deck license survey, 28px rendering strategy, font choice, wildcard treatment, card-back design. Verdict: zero external assets needed, current Unicode + Geist approach beats every alternative. ~3.2K words. | ✅ |
| [`china-network-deployment.md`](china-network-deployment.md) | Vercel POP latency from PRC, Upstash region trade-offs, GFW SSE behavior, ICP filing reality, Tencent Cloud Shenzhen fallback path. ~4.2K words. | ✅ |
| [`anti-cheat-deep-dive.md`](anti-cheat-deep-dive.md) | Account-level abuse, collusion, scripted clients, engine assistance, ranked-mode integrity. v1 baseline (~340 LOC, 5-6 days) + v2 deferred. ~5.4K words. | ✅ |
| [`cross-project-integration.md`](cross-project-integration.md) | Integration with sibling `guandan-scorer`. 5 options ranked, recommendation = Option B (shared @handle namespace, deferred cross-app stats). ~3.1K words. | ✅ |

## Headline decisions (locked 2026-05-16)

- **Realtime**: Vercel SSE+POST + Upstash Redis pub/sub. Colyseus retained as backup only.
- **Frontend**: Vite + TypeScript + React, hosted on Vercel
- **Rendering**: CSS DOM + transform/opacity (no PixiJS/WebGL)
- **Cards**: Unicode suits + Geist 700 with tabular-nums. Zero external SVG assets needed for v1.
- **Mobile orientation**: CSS `transform: rotate(90deg)` Majsoul-style on iOS, native lock on Android, rotate-prompt as emergency fallback
- **AI tiers**: Easy (rule-based + noise) / Medium (rule-based + WASM solver) / Hard (DeepSeek LLM with candidate pre-filter) / Master deferred to v1.1 (DanLM macOS-only)
- **Auth**: Anonymous @handle, shared namespace with sibling scorer (Option B)
- **PRC delivery**: Vercel-only launch with client-side latency beacons; Tencent Cloud Shenzhen mirror deferred until p95 > 350ms observed
- **Anti-cheat v1**: rate limiting + IP throttle + report button + admin dashboard + Vercel BotID (~5-6 days work, ~340 LOC)
- **Custom domain required day 1**: `*.vercel.app` is DNS-poisoned in mainland China

See [`SUMMARY.md`](SUMMARY.md) for full rationale chain and risks.
