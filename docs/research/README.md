# Research Index

This directory captures investigation done before implementation. Read [`SUMMARY.md`](SUMMARY.md) first; per-stream files are the deep references.

## Research streams (all complete 2026-05-16)

| File | Scope | Status |
|---|---|---|
| [`SUMMARY.md`](SUMMARY.md) | **Start here.** Cross-cutting synthesis — recommended tech stack, AI approach, UX direction, key risks, open questions. | ✅ |
| [`ai-strategies.md`](ai-strategies.md) | Deep dive on 5 reference AI engines (Bobgy / Quentain / shuilongzhu / DanLM / Guandan-training). 5,400 words. | ✅ |
| [`game-rules.md`](game-rules.md) | Comprehensive Guandan ruleset extracted from `hash-panda/guandan-guide` + sibling `guandan-scorer`. 5,660 words. | ✅ |
| [`existing-implementations.md`](existing-implementations.md) | Open-source repos + commercial app UX scan. | ✅ |
| [`architecture-options.md`](architecture-options.md) | Realtime multiplayer stacks — Vercel, PartyKit, Cloudflare DO, Colyseus, Liveblocks, self-host. | ✅ |
| [`mobile-landscape-ux.md`](mobile-landscape-ux.md) | Orientation lock + safe areas + 4/6/8 player layouts + interaction patterns. 5,250 words. | ✅ |

## Headline conclusions

- **Game server**: Colyseus on Fly.io (Vercel Functions can't host WebSocket as of Jan 2026)
- **Frontend host**: stays on Vercel
- **Rendering**: CSS DOM + transform/opacity (NOT WebGL/PixiJS)
- **AI in v1**: 3 tiers via different engines, not search depth; DanLM deferred to v1.1
- **Mobile**: rotate-prompt overlay (iOS Safari doesn't implement orientation lock)
- **Rules engine**: port `hash-panda/guandan-guide` TS engine + reuse `../guandan-scorer` progression

See [`SUMMARY.md`](SUMMARY.md) for details and the rationale chain.
