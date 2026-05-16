# Research Index

This directory captures investigation done before any implementation begins. Findings will inform the design doc and implementation plan.

## Research streams

| File | Scope | Status |
|---|---|---|
| [`ai-strategies.md`](ai-strategies.md) | Deep dive on 5 reference AI engines — Bobgy / Quentain / shuilongzhu / DanLM / Guandan-training. Algorithmic approaches, runtime constraints, difficulty tuning. | pending |
| [`game-rules.md`](game-rules.md) | Comprehensive Guandan ruleset — card types, bombs hierarchy, tribute (进贡), heart-level wildcard, 4/6/8-player mode differences. Extracted from `hash-panda/guandan-guide` + sibling `guandan-scorer`. | pending |
| [`existing-implementations.md`](existing-implementations.md) | Existing web/desktop implementations — CrazeGuandan, GuanDanInOffice, guandan-windows. Tech stacks, UX patterns, card animation approaches. | pending |
| [`architecture-options.md`](architecture-options.md) | Real-time multiplayer architecture options — server-authoritative card game design, WebSocket vs WebRTC, Vercel-compatible stacks (Functions, Queues, Durable Objects analog). | pending |
| [`mobile-landscape-ux.md`](mobile-landscape-ux.md) | Mobile landscape web game UX — orientation lock, safe areas, 4/6/8 player table layouts, card interactions. References to 欢乐斗地主, Hearthstone mobile, etc. | pending |
| [`SUMMARY.md`](SUMMARY.md) | Cross-cutting synthesis — recommended tech stack, architecture, AI approach, key risks. Written after all streams complete. | pending |

## Decisions deferred until research complete

- Frontend rendering: Canvas (PixiJS / Phaser) vs DOM + CSS animations
- Realtime transport: WebSocket via Vercel Functions + KV pub/sub, or PartyKit / Cloudflare Durable Objects, or Colyseus
- AI runtime: Client-side (WASM/JS) vs server-side (Node), per-difficulty model
- Auth: anonymous handles only (like sibling scorer) vs accounts
- Persistence: stateless ephemeral rooms vs persistent match history
