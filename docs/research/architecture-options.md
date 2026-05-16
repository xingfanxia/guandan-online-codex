# Guandan Online — Real-Time Multiplayer Architecture Options

**Date**: 2026-05-16  
**Scope**: Server-authoritative multiplayer backend for a web-based Guandan (掼蛋) card game. 4/6/8 players, hidden hand state, <200ms move latency, 60s reconnection grace, bot fill on dropout, open-source personal project deploying frontend on Vercel.

---

## Context: Why the Sibling Project's Stack Does Not Transfer

`../guandan-scorer` uses Vercel Functions + Upstash KV with 2s/10s polling intervals. That architecture works because the scorer is a *state ledger* — players apply results manually, one round every 5–20 minutes. The new game needs *real-time card play*: a player taps a card and all opponents must see it within 200ms. That is 50–100x faster cadence, requires push (not poll), and demands persistent per-room server state — none of which serverless polling provides well.

---

## Option 1: Vercel-Native Stack (Functions + KV + SSE/Polling)

### What's possible in 2026

Vercel's Fluid Compute (enabled by default for new projects as of April 2025) extends function wall-clock limits to 300s and enables in-function concurrency. It makes long-lived **Server-Sent Events (SSE)** practical — a single function can hold an SSE stream open for several minutes, and Upstash Redis pub/sub can push events into that stream as they arrive.

**WebSockets are not supported.** This is confirmed and current as of early 2026 per Vercel community docs and the Ably analysis published May 2026: "WebSockets require a persistent, bidirectional connection — Vercel Functions cannot act as a WebSocket server even with Fluid Compute enabled." Vercel's own knowledge base explicitly recommends third-party providers (Ably, Partykit, Pusher, etc.) for WebSocket use cases.

The practical shape for card-game real-time on Vercel native:

- Client plays a card → `POST /api/game/[room]/move` → Vercel Function validates and writes to Upstash KV + publishes to Upstash Redis pub/sub channel
- All other clients hold an SSE stream open to `GET /api/game/[room]/stream` → stream handler subscribes to the Redis channel and forwards events
- Polling fallback for mobile clients that drop SSE (every 2–3s, same endpoint)

### Analysis

| Dimension | Assessment |
|---|---|
| **Pricing** | Vercel Pro ~$20/mo base + Upstash pay-per-request. 100 concurrent rooms × 6 players × 300 moves/hour ≈ 180K requests/hour, well within Upstash's included free tier on the Vercel marketplace plan. Cost is near $0 in marginal terms at this scale. |
| **WebSocket support** | No native WebSocket. SSE is the ceiling. |
| **State storage** | Upstash KV (Redis). Room state stored per-key; no strong consistency guarantees across concurrent writers. |
| **Hidden state enforcement** | Entirely manual. The function must look up only the requesting player's hand and send it. No framework help. |
| **Reconnection** | DIY. Client reconnects to SSE stream; server replays state from KV on join. |
| **Bot execution** | Awkward. Bots would need to be invoked via a Vercel Cron or QStash queue message on each turn. Latency through that path is 1–5s, not sub-200ms. |
| **Cold start** | 50–200ms function cold start. With Fluid Compute pre-warming, subsequent calls are ~10–30ms. The SSE stream itself warms quickly but a new room's first move pays the cold-start cost. |
| **Vendor lock-in** | High on Vercel primitives; moderate overall (SSE + Redis are portable concepts). |
| **Open-source examples** | Upstash has SSE streaming examples; no public card-game examples on this exact stack. |

### Verdict on Option 1

SSE through Vercel Functions is viable for latency — a round-trip of "player posts move → Redis pub/sub → SSE push to peers" can hit 80–150ms end-to-end under good conditions. The hard problems are: (1) move validation race conditions (two players could submit simultaneously; Upstash KV's optimistic concurrency requires careful retry logic), (2) bot execution needs a separate invocation path that adds latency, (3) the 300s SSE limit means clients must reconnect the stream periodically, adding reconnection handling complexity. This is buildable but you are assembling the game-server primitives by hand.

---

## Option 2: PartyKit

### What it is

PartyKit is an open-source deployment platform backed by Cloudflare Workers and Durable Objects. Each "Party" (room) is a Durable Object: a single-threaded, stateful actor that holds all WebSocket connections for that room in memory. PartyKit wraps the raw DO API with a cleaner TypeScript class model, routing, and CLI tooling.

Pricing is currently **free** for both the managed platform tier (up to 10 live projects, storage clears every 24h) and the cloud-prem tier (deploy to your own Cloudflare account; you pay only Cloudflare's DO rates, which are ~$0.15/million requests + $12.50/million GB-s after a generous free tier). For 100 concurrent rooms at 8h/day the Cloudflare compute cost works out to roughly **$10–15/month** on the paid Workers plan (based on the Cloudflare DO pricing calculator examples). On the managed "Individual" plan it is free, but 24h storage reset makes it unsuitable for persistent games.

### Architecture shape

```
Browser ──WS──→ PartyKit edge (Cloudflare PoP, ~50ms from 95% of world)
                    │
              Party.Server class (per room)
                    │
              In-memory JS Map of player state
                    │
              Optional: Party.storage (DO SQL / KV) for persistence
```

### Analysis

| Dimension | Assessment |
|---|---|
| **Pricing** | Cloud-prem: ~$10–15/mo for 100 rooms at moderate activity. Managed individual: $0 but 24h state reset. |
| **WebSocket support** | Native. Every client connects via WebSocket. PartyKit handles upgrades and routing. |
| **State storage** | In-memory (during active game), `this.room.storage` (Durable Object KV/SQL) for persistence across hibernation. SQLite-backed DO storage billed separately at $0.20/GB after 5GB free. |
| **Hidden state enforcement** | Manual, but straightforward: server holds full `GameState` in memory; each `onMessage` handler calls `connection.send(personalizedView)` per connection. No global broadcast needed for hand state — only for played cards / table state. |
| **Reconnection** | DO keeps connection list. When a client reconnects, `onConnect` fires on the same Party instance (same room ID routes to same DO). Server replays last-known game state from `this.room.storage`. No external pub/sub needed. |
| **Bot execution** | Excellent fit. Bot logic runs directly inside `Party.Server`. On a human dropout, the server transitions that slot to a bot object that calls `this.room.send(botMove, ...)` on a `setInterval`. No external worker needed; all within the same DO runtime. |
| **Cold start** | Durable Objects with WebSocket Hibernation API: ~0ms when DO is already running (active game). On first connection after DO creation: ~5–50ms. Cloudflare DOs hibernate when idle and wake on the next request with near-zero perceived delay because the WebSocket stays connected during hibernation. |
| **Vendor lock-in** | Medium. `Party.Server` class is Cloudflare-specific (DO underneath). Migrating would mean rewriting the server to target a different runtime. PartyKit abstracts some CF-isms but you still depend on DO semantics. |
| **Open-source examples** | Active ecosystem: Stately Sky (XState on edge), tldraw multiplayer, BlockNote real-time editor. Turn-based game examples exist in the PartyKit GitHub org. |

### Notable caveats

- **Deploy topology**: PartyKit server code (your `Party.Server`) deploys to Cloudflare Workers; your Next.js frontend stays on Vercel. They are different platforms but this is the documented and common pattern — Vercel's own knowledge base lists PartyKit as a recommended WebSocket provider.
- **Hibernation and in-memory state**: When all clients disconnect, the DO can hibernate. If you store hand state only in JS memory (not `this.room.storage`), it is lost on hibernation. Fix: persist critical game state to `this.room.storage` on every state mutation, or use the `serializeAttachment` pattern per-connection.
- **Single-threaded DO**: All message handling is single-threaded per room. This is fine and desirable for a turn-based card game (it gives you free linearization of moves), but CPU-intensive bot AI could block the event loop. Keep bot logic simple (rule-based, not ML inference).

---

## Option 3: Cloudflare Durable Objects Direct (DIY)

### Versus PartyKit

PartyKit *is* DO with a wrapper. Going raw CF Workers + DO gives you:

- Full access to CF bindings (R2, D1, KV, Queues) without waiting for PartyKit to expose them
- No dependency on PartyKit's routing and CLI opinions
- Ability to use Wrangler's native deploy pipeline

What you lose: PartyKit's request routing (routing by room ID to the right DO is DIY with raw DO), its `partykit.json` DX, and community examples that assume the PartyKit API surface.

| Dimension | PartyKit vs Raw DO |
|---|---|
| **Routing** | Handled by PartyKit; DIY with raw DO (one Worker that maps roomId → DO stub) |
| **Client SDK** | `partysocket` npm package; raw DO gives you the native WebSocket API |
| **Ergonomics** | PartyKit is ~40% less boilerplate for a game room |
| **Feature access** | Raw DO: full CF ecosystem immediately; PartyKit: adds features on demand |
| **Pricing** | Identical (both use CF DO billing) |
| **Lock-in** | Both are CF-locked. PartyKit adds a thin additional dependency. |

**Recommendation**: For a personal project, PartyKit's ergonomics win. The extra layer is thin, the API surface is simple, and the lock-in delta vs raw DO is negligible — you're already locked to CF either way. Only prefer raw DO if you need a CF binding PartyKit doesn't expose yet (e.g., D1 SQL, R2 object storage, Queues).

---

## Option 4: Colyseus

### What it is

Colyseus is an open-source, Node.js-based multiplayer game framework. You deploy a standard Node.js server (on Fly.io, Railway, Render, or Colyseus Cloud) and clients connect via WebSocket. The framework provides:

- **Room lifecycle**: `onCreate`, `onJoin`, `onLeave`, `onDrop`, `onReconnect`, `onDispose`
- **Schema + delta serialization**: Define `MapSchema<Player>` — Colyseus computes binary diffs and sends only changed fields to clients
- **StateView (v0.16+)**: Per-client state filtering via `@view` decorator. Fields tagged `@view` are excluded from the shared broadcast and sent only to clients whose `StateView` explicitly includes that schema instance. This is the native mechanism for hidden hand state.
- **Matchmaking**: Built-in room listing, `joinOrCreate`, `reconnect` with cached token
- **`allowReconnection(client, timeout)`**: Called in `onDrop`, pauses that client slot for up to N seconds. The client reconnects by calling `client.reconnect(token)`.

### Architecture shape

```
Browser ──WS──→ Colyseus Node server (Fly.io, 1 machine = 100+ rooms)
                    │
              Room class (one instance per active room)
                    │
              In-memory MapSchema<GameState>
                    │
              Optional: Redis adapter for horizontal scaling
```

### Analysis

| Dimension | Assessment |
|---|---|
| **Pricing** | Self-host on Fly.io: 1 shared-CPU 1GB machine ≈ $1.94/mo; 2GB ≈ $3.88/mo. For 100 concurrent rooms with 8-player hands a 1GB machine may be tight under load; 2–4GB is safer at ~$4–8/mo. Colyseus Cloud starts at $15/mo and includes monitoring across 32 global locations. Total cost: $5–20/mo depending on hosting choice. |
| **WebSocket support** | Native and first-class. The framework is built on WebSocket. |
| **State storage** | In-memory `Schema` objects. State is serialized and delta-sent on each game tick. Persistence to external DB (Postgres, Redis) is DIY. |
| **Hidden state enforcement** | `StateView` with `@view` decorator (Colyseus v0.16+). First-class framework feature. Each player gets their own `StateView` that includes their `Hand` schema; other players' hands are decorated `@view` and excluded from the broadcast delta. This is the strongest native hidden-state primitive of all options reviewed. |
| **Reconnection** | `allowReconnection(client, 60000)` in `onDrop`. Built-in. The client stores a reconnection token; on return, `client.reconnect(token)` re-attaches to the same room slot. |
| **Bot execution** | Excellent. Bots can be virtual clients (`this.clients.push(virtualClient)`) or logic in the room's `setSimulationInterval`. The room's game loop runs on a `setSimulationInterval` (server-side tick), so bot moves are just state mutations in that loop. |
| **Cold start** | Node.js process is always-on (no serverless cold start). First move after idle: ~5ms. Fly.io "fly-by-night" auto-stop adds ~1–3s if the machine was scaled to zero; keep a minimum of 1 machine to avoid this. |
| **Vendor lock-in** | Low. Standard Node.js; deploy anywhere. Colyseus Cloud is optional. Migrating hosting is a `fly.toml` / `railway.json` change. |
| **Open-source examples** | [colyseus/turnbased-cards-demo](https://github.com/colyseus/turnbased-cards-demo) (official), Battleship, poker variants on the Colyseus examples page. Mature ecosystem with 750K+ downloads and 6.4K GitHub stars. |

### Notable caveats

- **Single-server state**: By default, game state lives only in Node.js memory. If the process restarts, all active rooms are lost. Mitigate with: (a) Colyseus's Redis presence/lobby adapter for state discovery, (b) writing critical state to Postgres/Redis on each round completion.
- **Horizontal scaling**: Colyseus supports Redis-backed matchmaking for multi-node setups, but horizontal scaling of room state is not native — rooms pin to one Node process. For 100 concurrent rooms this is not a problem; you won't need more than one small Node machine.
- **Fly.io operational overhead**: You manage deploys, health checks, and machine sizing. Colyseus Cloud removes this at $15/mo.

---

## Option 5: Liveblocks

### What it is

Liveblocks is a collaboration SDK providing `Presence`, `Broadcast`, and `Storage` (conflict-free LiveObject/LiveMap/LiveList). It is designed for collaborative documents (Figma/Notion-style) — shared state where all clients see the same data.

### Assessment for hidden-information card games

Liveblocks has a fundamental architectural mismatch with hidden-state card games. Its storage primitives (`LiveMap`, `LiveObject`) are inherently broadcast-to-all — there is no per-client filtering of stored state. The `Broadcast` feature can send events to specific connections, but it is ephemeral (not persisted) and you would need to manage all game state manually outside Liveblocks storage.

Hidden hands would require: storing hand state server-side in a separate DB, validating moves via a server API call, and using Liveblocks only for the public board state broadcast. At that point you are paying Liveblocks for a thin pub/sub layer over the public game state and doing all the hard work yourself.

| Dimension | Assessment |
|---|---|
| **Pricing** | Free: 500 MAR, 10 connections/room. Pro: $0.03/active room/month + $10/seat. 100 rooms = ~$3/mo overage + base plan. |
| **WebSocket support** | Yes, managed. |
| **State storage** | Shared CRDT storage — not suitable for per-player private state. |
| **Hidden state enforcement** | Not supported at framework level. DIY with separate API. |
| **Reconnection** | Handled automatically. |
| **Bot execution** | No server-side execution environment for bots. |
| **Verdict** | **Not a good fit.** Liveblocks is optimized for collaborative document editing where all participants see the same state. Card games with hidden information are a category mismatch. Skip it. |

---

## Option 6: Self-Hosted Node.js + Socket.IO on Fly.io

### What it is

The simplest server-authoritative shape: a Node.js + Socket.IO server on a persistent VM. No framework opinions on game state — you write the room manager, state machine, and hidden-state logic yourself. Deploy to Fly.io (preferred for latency: 19 compute regions) or Railway (simpler DX).

### Architecture shape

```
Browser ──WS──→ Socket.IO Node server (Fly.io, 1–2 machines)
                    │
              Room manager (Map<roomId, GameRoom>)
                    │
              GameRoom (in-memory state, per-player views)
                    │
              Optional: Redis adapter (multi-node)
```

### Analysis

| Dimension | Assessment |
|---|---|
| **Pricing** | Fly.io: shared-CPU-1x 256MB ≈ $1.94/mo, 1GB ≈ $5.70/mo. For 100 active rooms with 8-player hands + bots, 2GB is a safe baseline ≈ $10–14/mo. No platform tax. |
| **WebSocket support** | Native via Socket.IO over ws. |
| **State storage** | In-memory. Persistence is fully DIY (write to Redis/Postgres on round completion). |
| **Hidden state enforcement** | Fully manual. `socket.emit('hand', playerHand)` per connection — you write the filtering logic. No framework help, but also no framework constraints. |
| **Reconnection** | Socket.IO has built-in reconnection on the client (exponential backoff). Server-side: you hold the room open and re-attach the socket to the right room namespace on reconnect. DIY but well-documented. |
| **Bot execution** | Natural. Bots are just JS objects inside the `GameRoom` that call `room.processMove(botMove)` on a timer. No separate process needed. |
| **Cold start** | Always-on VM: ~0ms. If using Fly.io auto-stop: 1–3s. Keep minimum 1 machine running. |
| **Vendor lock-in** | Minimal. Socket.IO is open-source; Fly.io has no proprietary runtime. Migrating to Railway / Render is a config file change. |
| **Open-source examples** | Extensive. Poker, chess, and card game tutorials targeting Socket.IO are ubiquitous. [socket.io/chat-example](https://socket.io/get-started/chat) is the canonical starting point; community has many game-room examples. |

### Notable caveats

- **You own all game logic**: No `StateView`, no `allowReconnection`, no matchmaking. You write it. This is the most flexible option and the most work.
- **Scale ceiling**: Socket.IO rooms are process-local by default. Scaling past one machine requires Redis adapter. Not needed at 100 rooms.
- **Operational overhead**: VM deployment, health checks, zero-downtime deploys — more ops than serverless. Fly.io's `fly deploy` smooths this considerably.

---

## Comparison Table

| | Vercel Native (SSE) | PartyKit | CF DO (raw) | Colyseus | Liveblocks | Node+Socket.IO/Fly |
|---|---|---|---|---|---|---|
| **WebSocket** | No (SSE only) | Yes | Yes | Yes | Yes | Yes |
| **Hidden state** | Manual | Manual | Manual | First-class `@view` | Not supported | Manual |
| **Reconnection** | DIY | DIY (trivial — same DO) | DIY | Built-in `allowReconnection` | Auto | DIY (well-documented) |
| **Bot execution** | Awkward (external trigger) | In-DO (great) | In-DO (great) | In-Room (great) | Not possible | In-Room (great) |
| **Cold start** | 50–200ms | ~5–50ms (first connection) | ~5–50ms | ~5ms | Managed | ~0ms |
| **Move latency** | 100–200ms | 50–120ms | 50–120ms | 30–80ms | 80–150ms | 30–80ms |
| **Cost @ 100 rooms** | ~$0 marginal | ~$10–15/mo (CF Workers) | ~$10–15/mo | ~$5–20/mo | ~$3–5/mo | ~$10–14/mo |
| **Vercel-native** | Yes | Companion stack | Companion stack | External | No | External |
| **Lock-in** | Medium | Medium (CF) | Medium (CF) | Low | Medium | Minimal |
| **Card game examples** | None | Limited | None | Yes (official) | No | Extensive |
| **Framework fit** | Poor | Good | Good | Excellent | Poor | Good |

---

## Recommendation

### Top Pick: Colyseus on Fly.io

**Rationale**: Colyseus is the only option that natively solves all three hard problems specific to a hidden-information card game:

1. **Hidden state**: `StateView` with `@view` decorator is purpose-built for "player X sees hand X only." You tag each `Hand` field with `@view`, assign each `Client` its own `StateView`, and the delta serializer handles the rest. Doing this in PartyKit or Socket.IO requires writing filtering logic in every `onMessage` handler — it works, but it's a footgun under maintenance.

2. **Reconnection**: `allowReconnection(client, 60000)` is a single call in `onDrop`. The slot is reserved, game state is unchanged, and the client reconnects with a cached token. Bot takeover is `if (reconnection.rejected) { assignBot(slot); }`. In PartyKit you write this yourself.

3. **Bot execution**: `setSimulationInterval` is the game loop. Bots are objects that respond to game state changes by calling `this.room.processMove(botId, move)`. They live in the same process, same memory, sub-millisecond latency. No external trigger needed.

Beyond those, Colyseus's `Room` class gives you structured lifecycle hooks, binary delta serialization (efficient for card hand updates — only changed cards are transmitted), and an official `turnbased-cards-demo` that is the closest public reference to what guandan-online needs.

**Deployment**: Fly.io with a 2GB machine (~$10/mo). Minimum 1 machine to avoid cold starts. `fly.toml` allows zero-downtime deploys. Colyseus Cloud ($15/mo) is a drop-in upgrade if you want managed infra later.

**Frontend**: Stays on Vercel. Colyseus server is at `wss://guandan-game.fly.dev`. The `@colyseus/sdk` client library connects directly.

### Backup Pick: PartyKit (cloud-prem on your own Cloudflare account)

If Colyseus's Node.js ops overhead is unacceptable for a personal project, PartyKit is the next best option. The Durable Object model gives you:

- Native WebSocket with hibernation (zero cost when rooms are idle)
- In-DO bot execution (natural fit)
- Near-zero infrastructure management via `partykit deploy`

The trade-off is that you implement `StateView` manually: maintain a `Map<playerId, Hand>` on the DO, and in each `onMessage` handler send public state to all connections and private hand state only to the relevant `Connection`. It is ~100 lines of code you write once and never touch, but it's not framework-enforced.

**Why not top pick**: PartyKit's documentation is less mature for game use cases, the 24h state reset on the free managed tier is a non-starter for persistent games, and the hidden-state implementation is manual rather than declarative. For a card game where hand visibility is the security boundary, declarative enforcement (Colyseus `@view`) is safer over time.

### If you want zero ops and are willing to live with SSE

The Vercel-native stack is viable for a prototype. Use Upstash Redis pub/sub to broadcast public game events (played cards, turn changes) via SSE to all clients, and send private hand state only via the initial room join response and targeted `POST` responses. Move validation runs in a Vercel Function with Upstash KV optimistic locking. This costs essentially $0 and requires no external server. Accept the trade-offs: no true WebSocket (SSE is one-directional, client-to-server is HTTP POST), bot moves require QStash triggers (adding ~500ms latency), and you write all reconnection handling from scratch.

---

## Decisions That Are Not Portable (Colyseus-Specific)

These three decisions are forced by the Colyseus choice and cannot be abstracted away. Design around them explicitly:

1. **Room pinning to a single Node process**: All game state for a room lives in one Node.js process. This means zero-downtime deploys disconnect all active games (Fly.io's rolling deploys do not help here — a new process has no room state). Design for it: persist round state to Postgres/Redis on every state transition, not just at game end. On server restart, rooms can be reconstructed from DB rather than from memory. This is not needed for a prototype but is required before inviting real users.

2. **`StateView` is a server-side compile-time constraint, not a runtime ACL**: `StateView` prevents accidental broadcast of private state; it does not prevent a malicious server-side bug from calling `client.send(anotherPlayersHand)` directly. The security model is "trust the server to implement `@view` correctly" — which is appropriate for a server-authoritative game, but you must audit every `broadcast` call to confirm it sends the public-state schema only, never a full-state snapshot.

3. **Bot logic is synchronous in the game loop**: Colyseus's `setSimulationInterval` is synchronous and single-threaded per room. A bot that takes >16ms to pick a move on a 60Hz tick will stall all state mutations for that room during that tick. For Guandan's AI (rule-based card evaluation), this is fine. If you later want to add neural-net inference for bots, move AI computation to a worker thread or external service and inject the result as a deferred move — do not block the Colyseus game loop.

---

## References

- Vercel community: "WebSockets are still not supported on Vercel, even with Fluid Compute enabled" (January 2026) — https://community.vercel.com/t/does-vercel-support-websockets-now-that-we-have-fluid-compute/27205
- Ably: "WebSockets on Vercel: why serverless functions can't host them" (May 2026) — https://ably.com/topic/ai-stack/websockets-on-vercel-why-serverless-functions-cant-host-them
- Vercel Fluid Compute — https://vercel.com/fluid
- PartyKit docs: how it works — https://docs.partykit.io/how-partykit-works/
- PartyKit cloud-prem pricing — https://docs.partykit.io/guides/deploy-to-cloudflare/
- Cloudflare DO pricing — https://developers.cloudflare.com/durable-objects/platform/pricing/
- Cloudflare DO WebSocket hibernation — https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- Colyseus StateView docs (context7 /colyseus/docs)
- Colyseus `allowReconnection` docs (context7 /colyseus/docs)
- Colyseus pricing — https://colyseus.io/pricing/
- Colyseus turnbased cards demo — https://docs.colyseus.io/learn
- Liveblocks limits — https://liveblocks.io/docs/platform/limits
- Fly.io pricing — https://www.withorb.com/blog/flyio-pricing
- Upstash Redis + Vercel SSE tutorial — https://upstash.com/blog/realtime-notifications

---

## Update — 2026-05-16: Re-examining the Vercel SSE+POST verdict

After this document was written, an internal review challenged the "Vercel native = marginal" verdict (Option 1). On closer examination, two of the agent's downsides are softer than originally stated.

### 1. Bot execution latency is not 500ms–5s

The original analysis assumed bot moves require external triggers (Vercel Cron / QStash). They do not. The same Vercel Function that handles `POST /api/game/[room]/move` can:

1. Validate and persist the player's move
2. Detect "next turn is a bot"
3. Compute the bot move inline (rule-based: ~10ms, WASM solver: ~50ms)
4. Publish both moves to Upstash Redis pub/sub in one batch
5. Return

Bot total latency ≈ player latency ≈ 50–150ms end-to-end — within Guandan's 200ms target. Only constraint: bot AI must complete within the function's request timeout (300s on Fluid Compute — not a limiter for rule-based or single-pass LLM bots).

### 2. SSE 300s reconnect is not painful for a card game

The 300s SSE limit was framed as "added complexity." In a card game with a typical 15–40 minute session, the client reconnects the stream every ~5 minutes. `EventSource` has automatic reconnection built into the spec (`Last-Event-ID` header replays missed events). Client-side: one event-listener-attached-once. Server-side: the new SSE handler reads the latest room state from KV and replays from the last `lastEventId`. ~30 lines of glue.

### Revised verdict on Option 1

**Co-equal top pick with Colyseus.** The decision is now framed as:

| | Vercel SSE+POST | Colyseus on Fly.io |
|---|---|---|
| Move latency | 55–165ms | 30–80ms |
| Hosting surface | Vercel only | Vercel (FE) + Fly.io (server) |
| Marginal cost @ 100 rooms | ~$0 (within free tiers) | ~$10/mo |
| Hidden-state filtering | Manual, ~50 lines per handler | Declarative via `@view` decorator |
| Reconnection | EventSource native + KV replay | `allowReconnection(client, 60s)` |
| Concurrent-move races | Optimistic locking on KV (Lua scripts) | Free linearization (single DO) |
| Glue code you write | ~200 lines | ~0 lines |
| Vendor lock-in | Vercel + Upstash | Node.js (portable) |
| Matches sibling scorer pattern | ✅ | ❌ |

**Pick Vercel SSE+POST if**: you value platform unity, already deep in Vercel ecosystem, willing to write ~200 lines of careful glue once.

**Pick Colyseus if**: you want framework-enforced safety on the trickiest parts (hidden state ACL, reconnection token, bot inline), and are OK adding Fly.io to your ops surface.

Both are within Guandan's latency and complexity budgets. `SUMMARY.md` reflects this revision.

### What does NOT work (workarounds considered in review)

- **Vercel Queues** — producer/consumer durable event stream meant for background processing (e.g., post-game stat sync, leaderboard recompute). Not a pub/sub fanout. Cannot replace Redis pub/sub for the "broadcast played card to all room peers" path.
- **Vercel Workflow DevKit (WDK)** — durable step-based workflows. Useful for crash-safe game-state authority (one workflow per round, steps = trick → tribute → score), but doesn't push to clients. Still need SSE / polling on top. Net: +complexity, no realtime-push problem solved unless durability is a hard requirement (and for an ephemeral card game, it isn't).

These were not in the original analysis because they don't address the realtime-fanout problem, but they were raised in review and are recorded here for future reference.

### Follow-up research (queued)

A dedicated deep-dive on realtime sync mechanisms for production card games (poker.online, chess.com, real-money mahjong apps, WebTransport, WebRTC data channels) is queued — see [`realtime-sync-deep-dive.md`](realtime-sync-deep-dive.md) when written.
