# Realtime Sync Mechanisms — Deep Dive for Guandan Online

**Date**: 2026-05-16
**Status**: Research follow-up to [`architecture-options.md`](architecture-options.md). Sections 1–6 are framework-independent and serve as the canonical 2026 reference on "what realtime mechanism should I use for a turn-based hidden-information card game on the web." **Section 7 is prescriptive for the locked v1 stack: Vercel-native SSE+POST + Upstash Redis pub/sub.** Colyseus is now documented as backup-only ("if SSE hits a wall").
**Scope**: 4/6/8-player Guandan, hidden 27-card hands, <200ms move latency, 60s reconnection grace, bot-fill on dropout. Web-only, mobile-first.

---

## TL;DR

For a 2026 turn-based hidden-information card game on the web:

1. **Transport: WebSocket.** Every shipped production card game we could verify (Hearthstone, PokerStars, Mahjong Soul, Lichess, Skribbl, Codenames, boardgame.io, Colyseus, the Vercel community recommendation) uses some form of persistent push channel. WebSocket is the de-facto default. SSE+POST is a fully viable alternative on platforms that forbid WebSocket (Vercel Functions today), and the latency story is comparable — but it is a workaround for a platform constraint, not the inherent best choice. WebTransport reached Baseline status in March 2026 but is **overkill** for card games: it's optimized for unreliable datagrams, while card-game messages must be reliable+ordered.
2. **Sync model: event-driven, server-authoritative.** Card games universally use event-driven sync (no idle traffic, message-per-move). Fixed-tick simulation is for action games (Valorant 128Hz, CS2 64Hz); card games run a *match handler* that wakes on input and sleeps otherwise. Server-side determinism + per-client filtered DTO is the correct security model.
3. **State sync on join/reconnect: versioned snapshot + event replay.** Lichess pattern: client tracks a monotonically increasing `v` (version); server's WebSocket service keeps a versioned event log per game and replays from `lastKnownVersion+1`. Same pattern works for SSE via the standard `Last-Event-ID` header. Full snapshot on initial join, event replay on reconnect.
4. **Hidden state: server-side per-recipient DTO filtering.** Hearthstone's "dispatcher" pattern, PokerStars's selective broadcast, Colyseus's `@view` decorator, and boardgame.io's `playerView()` are all the same idea: the server never sends a player data they shouldn't see. Encryption-based hiding (mental poker) exists but is academic — no production game uses it because server-as-trusted-party is the universal practical choice.
5. **Idempotency: client-generated move ID with server-side dedupe.** Every move carries a UUID; server stores `seen_moves` per game and rejects duplicates. Lichess uses an acknowledgment counter `a`; Stripe-style "Idempotency-Key" is the more generally cited pattern. This is the single most important anti-cheat / reliability primitive for a turn-based game.
6. **Optimistic UI: yes, but minimal.** Show a card moving to the table on tap (visual ghost), but disable downstream interactions until server-ack arrives. Guandan latency budget (<200ms RTT for any production hosting choice) is loose enough that full client prediction is not necessary; the ghost animation hides the 50-150ms wait.
7. **Anti-cheat baseline for v1**: server-side move validation, idempotent move IDs, turn-owner check, room-token authentication, shuffle-on-send for card-order metadata. Crypto-shuffle commitments, bot detection ML, and side-channel collusion detection are deferred to v2+.

**Framework decision (locked)**: **Vercel-native SSE+POST + Upstash Redis pub/sub** is the v1 stack. Colyseus on Fly.io is backup-only — invoked only if the SSE path hits a wall during build (e.g., Vercel Fluid Compute pricing surprises, Upstash pub/sub fanout latency floor exceeds 200ms in practice, or the ~200 lines of glue prove unmanageable). Section 7 below is prescriptive for the locked SSE+POST path: concrete `MessageType` enum, idempotency-key design, hidden-state filtering function, reconnect handling, 300s SSE limit workaround, bot-inline-in-POST analysis, anti-cheat baseline, and file structure sketch.

---

## 1. What Do Production Multi-Player Card Games Actually Use?

There is a frustrating asymmetry in the public record: every major card-game company runs proprietary infrastructure and publishes almost nothing about its internals. What we have is community reverse-engineering, partial answers in forum threads, and inference from observable wire traffic. Where the evidence is thin I say so.

### PokerStars

- **Transport**: TCP+SSL/TLS. Confirmed via 2009 reverse-engineering ([daeken/Benjen analysis][pokerstars-reverse]) — packets framed as 16-bit big-endian size + flags byte + LZHL-compressed payload. This is the **desktop client** protocol, which has been the primary path until ~2023.
- **Web client (newer, 2023–2025)**: HTML5 browser play has expanded to "nearly all major formats" as of mid-2025 ([PokerStars Blog][pokerstars-html5]). No public technical disclosure on transport; almost certainly WebSocket given the era and the bidirectional realtime needs. Buy-ins are capped at $25 cash / $20 tournament and multitabling is still not supported — suggesting the web client is a limited subset of the desktop protocol, possibly mapped to WebSocket frames carrying similar binary payloads.
- **State shape**: Inferred from protocol opcodes — `0x10` async method calls, `0x38` service-provider connection, `0x39` connection response. Highly structured RPC over a binary frame protocol. Not JSON.
- **Hidden hands**: Server holds full state; client receives only own hole cards + community cards + opponent actions. The decompiled packet structure shows messages addressed to specific player IDs, suggesting server-side per-recipient filtering.
- **Anti-cheat**: PokerStars publishes more than most. The 2010 Australian Parliament submission ([PokerStars software security][pokerstars-aph]) describes a 249-bit entropy source combining user-input randomness and quantum hardware RNG, suggesting commit-verify of deck shuffles is auditable but not exposed to clients.

**Verifiable**: protocol is TCP+SSL+LZHL+custom-binary (desktop, 2009 era). **Speculative**: web client is WebSocket carrying the same opcode structure. No public confirmation either way.

### Chess.com Live

- **Transport**: WebSocket. Confirmed implicitly by the public forum thread ([Chess.com forum: low-latency multi-region WebSocket][chesscom-forum]) where staff acknowledged the question without disclosing details. The community speculation in that thread — **"one or two server locations, shielded by a worldwide CDN"** — is plausible given that a chess move is small (~10 bytes UCI) and the bottleneck is not server compute but cross-region network latency.
- **Tech stack**: Google Cloud Platform, MySQL primary, NoSQL secondary, on-prem hardware ([ntietz: chess.com servers melting][chesscom-melting]). The author of that post explicitly says **"we don't know the details of their systems"** — chess.com has not published its WebSocket architecture.
- **Scaling**: The 2023 outage post-mortems show their architecture was straining at the seams during traffic spikes (Hans Niemann controversy, post-Queens Gambit growth). This is instructive: even one of the world's largest realtime gaming sites can run on a relatively simple "WebSocket service + CDN + monolithic database" architecture until you hit unicorn scale.

**Verifiable**: WebSocket via Chess.com staff acknowledgement; GCP/MySQL stack via blog post. **Speculative**: anything finer-grained than that.

### Lichess (the comparable open-source reference)

This is the **best public reference** for a realtime game site because Lichess is fully open source.

- **Transport**: WebSocket. The URL pattern is `wss://socket2.lichess.org/play/{gameId}/v6?sri={sessionId}&v={versionNumber}` ([David Reis: what happens when you make a move in Lichess][lichess-move]).
- **Tech stack**: Scala 3 on a modified Play 2.8 framework. Two services: **`lila`** (game logic, MongoDB, business rules) and **`lila-ws`** (WebSocket connection layer). They communicate via **Redis Pub/Sub** ([lila-ws][lila-ws]).
- **Message format**: JSON with a tagged-type structure. Client → server move: `{"t":"move","d":{"u":"d2d4","l":32,"a":1}}` — `t` = type, `d` = data, `u` = UCI move, `a` = acknowledgment counter. Server → client acknowledgment: `{"t":"ack","d":1}`.
- **Versioning**: Clients include `v={versionNumber}` in the WebSocket URL. **`lila-ws` maintains a `ConcurrentHashMap` storing versioned events per game ID**, allowing reconnecting clients to request events from their last known version onward. This is the textbook event-replay reconciliation pattern.
- **Pub/sub semantics**: Redis Pub/Sub is at-most-once. The David Reis writeup explicitly notes this is acceptable because the WebSocket layer can request a re-sync if it detects a gap (via version mismatch).
- **Service separation rationale**: "If lila is momentarily down, lila-ws can still handle WebSocket connections; conversely, if lila-ws is down, lichess.org website stays online but you can't play games." Independent scaling and partial failure tolerance.

This is the architecture I'd recommend most closely modeling Guandan after, modulo language choice. Replace Scala with Node.js/TypeScript and the pattern is the same.

### Mahjong Soul (雀魂) / Majsoul

- **Transport**: WebSocket. Confirmed via extensive reverse-engineering ([MahjongRepository/mahjong_soul_api][majsoul-api], [Akagi][akagi]).
- **Wire format**: 5-layer structure: **type byte → Wrapper protobuf → inner message → action protobuf**. Protocol Buffers, not JSON. Highly compact — a single tile-draw event is ~20–40 bytes vs. 100–200 for the equivalent JSON.
- **Hidden tiles**: Like PokerStars, server holds the full wall + every player's hand; clients receive only their own 13-14 tiles plus opponent discards. No public details on the exact filter mechanism but the protobuf schemas published by Yostar make per-recipient filtering explicit at the message level (different `ActionDealTile` messages are sent to different players, with the opponents' versions omitting tile identity).
- **Regional deployment**: CN / JP / EN server groups — geographic sharding for latency, no global state synchronization between regions.

The takeaway: **protobuf over WebSocket** is the production-grade pattern when bandwidth matters and the team can afford schema discipline. For Guandan (4–8 players, low message volume per game), JSON-over-WebSocket is fine — protobuf is an optimization for v2+ if profiling shows JSON parsing dominates.

### Tenhou (天鳳)

- **Transport**: For the legacy desktop/Java client, **raw TCP socket with a JSON tag stream protocol** ([tenhou-python-bot][tenhou-bot]). For the web client (HTML5 since ~2017), almost certainly WebSocket carrying similar tag-stream messages, though the public reverse-engineering record is thinner than Majsoul's.
- **State shape**: Tag-stream is human-readable text — each message is something like `<T138/>` (draw tile 138) or `<D40/>` (discard tile 40). This is the **oldest production mahjong site still operating**, and its protocol shows that **simplicity scales**: tens of thousands of concurrent users on a stream of <50-byte XML-ish messages.

### Hearthstone (web/mobile client)

- **Transport**: **Not WebSocket.** TCP port 1119, custom protocol. **Protocol Buffers** for serialization ([Fireplace wiki][hearthstone-fireplace], [HearthSim docs][hearthstone-protocol]).
- **State shape**: **Entity-based**. "A Hearthstone game is a bucket of entities. Each entity is a key-value store of properties." Mutations come via:
  - `CREATE_GAME` — initialize Game + Player entities
  - `FULL_ENTITY` — create entities (non-player, non-game) with initial tags + optional CardID
  - `TAG_CHANGE` — update a single tag on an entity
  - `SHOW_ENTITY` / `HIDE_ENTITY` — reveal / hide entity tags to specific players
  - `ACTION_START` / `ACTION_END` — wrap atomic action blocks (attacks, plays, deaths)
  - `META_DATA` — animation hints (target, damage, healing)
- **Hidden cards**: Cards in hand and deck are sent as `FULL_ENTITY` packets, but **for opponents the CardID is omitted** — opponent sees only that an entity exists in your "hand" zone. When you play a card, a `SHOW_ENTITY` reveals the CardID to all observers. The server-side **"dispatcher"** is the component that holds back tag changes from players who shouldn't see them. This is the cleanest production example of declarative per-recipient state filtering.
- **Server authority**: Pure. "The client does not know anything about the game rules when it comes to which cards can be played and how. Instead, every input update, the server sends a list of 'options' to the current player." The client cannot construct a legal move without server permission — radically different from web card games that ship game rules to the browser.

**Why Hearthstone isn't WebSocket**: it predates WebSocket as a viable protocol (Hearthstone shipped 2014; Blizzard had built TCP-protobuf-based netcode for World of Warcraft years prior; the Battle.net protocol carried Hearthstone's traffic). A clean-slate 2026 Hearthstone would almost certainly use WebSocket. The entity-event design pattern is **transport-agnostic** — you can implement the same `FULL_ENTITY` / `TAG_CHANGE` model over WebSocket.

### Marvel Snap

- **Engine**: Unity.
- **Backend**: Unity Gaming Services — managed matchmaking, lobbies, leaderboards ([Unity case study][unitysnap]). Specifics are not public.
- **Transport**: Almost certainly Unity's Transport / NGO stack, which can be configured to use Relay (UDP via Unity Relay), WebSocket (for WebGL builds), or raw UDP (for native). For Snap's mobile + desktop targets, raw UDP via Unity Relay is the most likely default.
- **Simultaneous turns**: Snap is unusual in that both players make moves *simultaneously* and reveal at end of turn. This shifts the architectural model: it's still event-driven, but **the server batches both players' moves and applies them atomically**. Guandan is traditional one-at-a-time so this pattern doesn't directly apply.

The "Discord SDK transport" hypothesis didn't pan out — Snap is a mobile-first game with its own dedicated client, not a Discord activity. Discord SDK is used by smaller embedded games on Discord; Snap predates that surface.

### Skribbl.io (open-source reference, instructive)

- **Transport**: Socket.IO over WebSocket (falls back to long-polling) ([Skribbl.io protocol gist][skribbl-protocol]).
- **State shape**: JSON arrays. **Packet ID 19** carries draw commands: `["data",{"id":19,"data":[[tool,color,size,x1,y1,x2,y2]]}]`. **GameState** packet has `id`, `time` (remaining duration), `data` (phase-specific).
- **Catch-up on join**: The server sends a **Lobby Data** packet that includes the GameState with **historical draw commands** so latecomers can reconstruct the canvas. This is event-replay on join — a precedent for what we'd do on Guandan reconnect.
- **Server authority**: Strict. Players cannot draw unless it's their turn; word selection happens only when the player is the active drawer.

This is the **closest open-source analog to a small-scale turn-based web game**. The architecture is unsurprising — Socket.IO room per game, server-authoritative event broadcast, JSON payloads, event-replay-on-join. ~3000 lines of TypeScript total.

### Codenames Online ([yiliansource/codenames][codenames-yili])

- **Transport**: Socket.IO over WebSocket.
- **Hidden role state**: Game Masters receive the card-color solution; operatives do not. **Role-based state segregation** is implemented server-side — different message contents flow to different roles. Direct analog to Guandan's per-player hand filter.
- **Reconnection**: Not mentioned in the repo. Many open-source party-game implementations skip reconnection because the games are short (~10 min); a player who drops accepts losing that game.

### Jackbox Games (web client)

Pattern is well-known but not publicly documented in depth: Jackbox uses WebSocket from the player phone to a central server, with the TV display acting as a separate WebSocket client of the same room. Drawing data goes as binary frames (the games that involve drawing); other party games use JSON. Jackbox does **not** ship anti-cheat — these are casual party games with no competitive stakes.

### Among Us

- **Transport**: **UDP** on ports 22023-22923 ([roobscoob/among-us-protocol][amongus-protocol]). Custom Hazel protocol layered on UDP — `SendOption` byte distinguishes Normal (0x00), Reliable (0x01), Hello (0x08), Disconnect (0x09), Ack (0x0a). This is a hand-rolled reliable-UDP implementation.
- **Why UDP**: Among Us is a real-time movement game (you walk around the ship), so it needs UDP's latency profile for position updates. The "vote / impostor identity" hidden-info layer rides on top of the same protocol as discrete game events.
- **Web client**: Among Us shipped a browser client in 2023; the browser version uses WebSocket as the transport (TCP being the only browser option for reliable streams), tunneling the same Hazel protocol over WS frames. This confirms a general pattern: **a UDP-native game gets ported to browser via WebSocket-tunneled UDP**.

**Lesson for Guandan**: we don't need UDP. Turn-based card games have no position-update traffic — every message is discrete, all need reliable+ordered delivery. WebSocket is correctly the chosen primitive.

### Production card-game observability summary table

| Game | Transport | Format | Server Auth | Hidden State | Public Source |
|---|---|---|---|---|---|
| PokerStars (desktop) | TCP+SSL+LZHL | Custom binary | Strict | Server-side per-recipient | [Reverse-engineering 2009][pokerstars-reverse] |
| PokerStars (web 2024+) | WebSocket (inferred) | Binary (inferred) | Strict | Server-side per-recipient | [Marketing only][pokerstars-html5] |
| Chess.com Live | WebSocket | Likely JSON | Strict | n/a (chess is fully observable) | [Forum acknowledgement][chesscom-forum] |
| Lichess | WebSocket | JSON | Strict | n/a | [Open source][lichess-move] |
| Mahjong Soul | WebSocket | Protobuf (5-layer wrapper) | Strict | Server-side per-recipient | [Reverse-engineering][majsoul-api] |
| Tenhou | TCP (legacy) / WS (web) | Tag-stream XML/JSON | Strict | Server-side per-recipient | [Riichi wiki][tenhou-wiki] |
| Hearthstone | TCP (custom port 1119) | Protobuf | Strict | Dispatcher-based entity filter | [HearthSim][hearthstone-protocol] |
| Marvel Snap | Unity Transport (UDP/WS) | Unity NGO | Strict | Server-side | [Unity case study][unitysnap] |
| Skribbl.io | Socket.IO | JSON | Strict | Drawer-only | [Protocol gist][skribbl-protocol] |
| Codenames Online | Socket.IO | JSON | Strict | Role-based | [GitHub][codenames-yili] |
| Among Us | UDP/Hazel (native), WS (web) | Custom binary | Strict | Server-side | [Protocol docs][amongus-protocol] |
| Jackbox Games | WebSocket | JSON | Strict | n/a (mostly party games) | (no public docs) |

**The universal pattern**: persistent push channel (WebSocket overwhelmingly preferred for web targets, with TCP as legacy and UDP as exception for action games) + strict server authority + per-recipient state filtering for hidden information. Where a game is web-only and turn-based (Lichess, Skribbl, Codenames Online), Socket.IO / native WebSocket with JSON payloads is the universal answer.

---

## 2. WebSocket vs SSE vs Polling vs WebTransport (2026 State)

### Browser support and operational profile

| Transport | Browser support | Direction | Reconnect | Server cost | Wire size | Card-game fit |
|---|---|---|---|---|---|---|
| **WebSocket** | Universal since 2012 (>99% browsers) | Bidirectional | Manual / library | Persistent TCP, 1 socket per client | Frame overhead 2-14 bytes | Best fit — default |
| **SSE (EventSource)** | Universal since 2012; 6 connection limit per origin on HTTP/1.1 (lifted on HTTP/2) | Server → client only | Automatic via spec + `Last-Event-ID` | Long-lived HTTP response, can stream through CDN | Plain text, ~30% larger than WS JSON due to `event:` `data:` framing | Viable; pair with HTTP POST for client→server |
| **Long polling** | Universal | Bidirectional (request/response) | Each request reconnects | HTTP request per poll cycle | Full HTTP headers per poll | Fallback only; high latency at low intervals |
| **WebTransport** | Chrome 97+, Firefox 114+, Edge 98+, Safari **26.4 (March 2026)** | Bidirectional, multi-stream | Manual (HTTP/3 / QUIC handles) | Persistent QUIC, multiple streams per connection | Binary datagrams (unreliable) + reliable streams | **Overkill** — designed for unreliable low-latency |
| **WebRTC data channels** | Chrome 56+, Firefox 22+, Safari 11+ | P2P or via SFU relay | DTLS-encrypted, manual reconnect | Per-peer; SFU adds server cost | Binary | **Wrong abstraction** — P2P means client can read peers' hidden state |
| **HTTP/2 Server Push** | Deprecated in browsers 2022 | n/a | n/a | n/a | n/a | Not applicable |

### Deeper comparison — the four real candidates

#### WebSocket

- **The default for bidirectional realtime since 2012.** RFC 6455 is implemented universally; ws/wss URLs work through corporate proxies that allow `Upgrade: websocket`.
- **Server cost**: holds a TCP socket per client. A modest Node.js server can hold ~10K WebSocket connections on a $5–20/mo VM. Memory is the limiter, not CPU.
- **Reconnection**: not in the spec. You write it (or use a library — Socket.IO, `partysocket`, `@colyseus/sdk` all bundle reconnection logic).
- **Heartbeat**: not automatic. You implement ping/pong frames manually.
- **Platform limits**: Vercel Functions cannot host WebSocket connections (confirmed Jan 2026). Cloudflare Workers + Durable Objects do (PartyKit). Fly.io / Railway / standard VMs all work.

#### Server-Sent Events (SSE + EventSource)

- **One-direction server→client over plain HTTP.** Client→server is HTTP POST (separate request). This is **two transports composed** — `GET /stream` (SSE) + `POST /move` (HTTP).
- **Critical advantage for our use case**: The browser's `EventSource` API **auto-reconnects** and sends `Last-Event-ID` header on reconnect ([MDN: Server-sent events][mdn-sse]). If your server uses event IDs (which you should), missed events are replayed automatically on reconnect.
- **Server cost**: Long-lived HTTP responses. Each "connection" is a single response that never ends; the server writes events into the stream as they arrive. CDN-friendly with caveats — `Content-Type: text/event-stream` is recognized by Cloudflare, Vercel, AWS CloudFront, but most CDNs buffer responses, so you may need to disable buffering for the path.
- **Browser connection limit**: **6 concurrent SSE connections per origin on HTTP/1.1**. HTTP/2 lifts this to ~100. Vercel serves over HTTP/2 by default — not a constraint in practice for a card game with 1 stream per tab.
- **Vercel-native implementation**: [`vercel/resumable-stream`][vercel-resumable] uses Redis pub/sub under the hood, supports `resumeAt` offset, and integrates with Fluid Compute's `waitUntil`. This is the **production-ready library** for the Vercel-native pattern.
- **The "95% argument"**: [Multiple analyses][polliog-sse] published in 2025–2026 argue that SSE is the right default for 95% of real-time apps, and WebSocket is over-engineering when client→server traffic is sparse (which it is for a turn-based card game — a player sends one move every 5-30 seconds, while the server may push many events in that interval).

#### Long polling

- **Legacy.** The sibling scorer project uses 2s viewer polling — fine for scoreboard ledger updates, **inappropriate for card moves**. A 2s polling interval gives a worst-case 2s lag on the opponent's screen; players will perceive this as "the game froze."
- **Useful only as a fallback** for clients where SSE/WebSocket are blocked (corporate proxies, ancient browsers). For a 2026 personal project: skip.

#### WebTransport

- **Reached Baseline in March 2026** with Safari 26.4 ([WebRTC.ventures][webrtc-baseline]). Chrome, Edge, Firefox shipped earlier.
- **Built on HTTP/3 + QUIC.** Multiple independent streams per connection (no head-of-line blocking), datagrams for unreliable delivery, reliable streams when you want them.
- **Why it's overkill for card games**: The headline features (unreliable datagrams, stream multiplexing) are for scenarios where dropping stale frames is better than buffering — e.g., real-time voice, video, live game state snapshots in shooters. **For a card-play message, "drop on stale" is wrong** — every message is a unique, indispensable game event. You'd use only the reliable-stream path, at which point WebSocket gives you the same semantics with more mature tooling and zero infrastructure delta.
- **What the experts say** ([WebSocket.org][websocket-future]): "For turn-based card games, WebSockets are the better choice. They don't require ultra-low latency, benefit from guaranteed message ordering, and need broad device compatibility. WebTransport's advantages don't apply here."
- **Will revisit**: if Guandan adds live voice chat for tables (think Among Us-style in-game audio), the WebTransport datagram path would be the right transport for the voice stream specifically. But that's a v3+ feature.

#### WebRTC data channels

- **Security boundary collapses if peer-to-peer.** The data channel is encrypted in transit, but it is *between peers* — meaning each peer's client holds the data the channel sent it. If a Guandan client receives even encrypted opponent-hand data, a hacked client can decrypt and read it.
- **Relayed via SFU/TURN**: solvable in principle (server acts as relay, never sending data to peers it shouldn't see), but at that point you've built a custom WebSocket server with extra protocol overhead. Skip.

### Reconnection mechanics, head-to-head

| Mechanism | WebSocket | SSE | Long polling | WebTransport |
|---|---|---|---|---|
| Built-in browser reconnect | No (library writes it) | Yes (EventSource spec) | n/a (each poll is fresh) | No |
| Event-ID resume support | Manual (write `lastSeq` into each frame) | Automatic via `Last-Event-ID` header | n/a | Manual |
| Reconnect over network change (4G→WiFi) | Network-down event → manual retry | Automatic | n/a | Manual |
| Reconnect after server restart | Manual | Automatic (after server is back up) | n/a | Manual |
| Sticky session needed on LB? | Yes (if server holds per-conn state) | Yes (same reason) | No | Yes |

**For Guandan**: SSE's automatic reconnect + `Last-Event-ID` is genuinely lighter to implement than WebSocket's. Colyseus / Socket.IO hide WebSocket reconnection complexity, so if you use either of those the WS reconnect cost is also near-zero. **Raw WebSocket without a library means you write reconnection logic by hand — don't do that.**

### Latency, head-to-head

For Guandan's 200ms move-RTT budget:

| Transport + hosting | Server location | Client location | Estimated round-trip |
|---|---|---|---|
| Vercel SSE+POST (Edge functions) | US-east + EU + Asia | US-east player | ~30-50ms (function cold-start excluded) |
| Vercel SSE+POST (Edge functions) | US-east + EU + Asia | Asia player | ~150-200ms via region routing |
| Colyseus on Fly.io (lhr, ord, nrt) | Fly auto-routes to nearest region | US-east player | ~30-60ms |
| Colyseus on Fly.io | Fly auto-routes to nearest region | Asia player | ~50-100ms |
| Cloudflare Durable Objects (PartyKit) | DO pins to first-connector's region | Any player after pin | ~30-80ms if same region, ~150ms+ across regions |

All four hit the 200ms budget for primary markets. **None of them are meaningfully faster than the others for a turn-based game**; the bottleneck is the network round-trip, not the server runtime.

### Verdict for Guandan

**WebSocket is the default best choice** because it's the universal pattern in production card games and the developer ecosystem is mature. **SSE+POST is a legitimate alternative on Vercel** where WebSocket is unavailable, and the latency story is fine. **WebTransport, WebRTC, and long polling are all wrong fits** for this specific game.

---

## 3. Tick Rate vs Event-Driven Sync

This is the cleanest dichotomy in the document.

| Architecture | Examples | When to use |
|---|---|---|
| **Tick-based** (fixed 20-128 Hz simulation loop) | Valorant 128Hz, CS2 64Hz (with sub-tick interpolation), Rocket League 60Hz | Games where continuous state changes between player inputs — physics, projectile flight, character movement |
| **Event-driven** (server wakes on input, sleeps otherwise) | Hearthstone, PokerStars, Lichess, Mahjong Soul, Skribbl, Codenames | Games where state advances only when a player acts — card games, board games, turn-based strategy |

**Card games are universally event-driven.** Verified by:

- Hearthstone: "The server will hand off input to a player by giving that player 'Options' which blocks further state changes from happening until that player executes an option" ([Fireplace wiki][hearthstone-fireplace]).
- Lichess: messages flow only on moves; the `lila-ws` process is idle between moves.
- Colyseus: turn-based games use `setSimulationInterval` only for **per-turn timeout** enforcement (e.g., 30s to play a card). The core message flow is event-driven.
- The general principle from [the .NET card-game architecture writeup][devvoice-cards]: "Continuous tick-based loops are unnecessary overhead for turn-based games where state advances only when players act. Event-driven model: each move is processed in discrete steps."

### Rare exceptions where ticks creep in

1. **Turn timer countdown**: Server fires a `tick` every 1s (not 30Hz) to update the visible countdown on all clients. This is animation-driving, not state-driving.
2. **Presence pings**: To detect dropped clients, server may send a `ping` every 15-30s and expect a `pong` back. Standard WebSocket keepalive.
3. **AI move scheduling**: When a bot's turn comes up, the server schedules the move via `setTimeout(150 + random*500)` to simulate human thinking time. This is event-driven (the bot move is *one event*), not a tick loop.
4. **Live spectator updates**: If you want a "live scoreboard" view of an in-progress game for spectators, you might tick the leaderboard every 1-2s instead of pushing each event. Optimization, not a different architecture.

**For Guandan**: 100% event-driven. The server wakes on:
- Player connects to room (state push)
- Player makes a move (validate, update state, broadcast)
- Player disconnects (start 60s reconnection grace, schedule bot takeover)
- Turn timer expires (auto-pass, schedule next player)

All other time, the server should be doing nothing for that room.

### Nakama's choice — tick rate for turn-based games

Heroic Labs' Nakama framework uses a **fixed tick rate** even for turn-based games ([Nakama docs][nakama-auth]): "Your tick rate represents the desired frequency (per second) at which the server calls the match loop function. Typical frequencies range from once per second for turn-based games to dozens per second for fast-paced gameplay."

This is a different design choice from Colyseus / boardgame.io / Lichess. The advantage is **uniformity** — one match loop pattern works for everything. The disadvantage for card games specifically is wasted CPU during idle moments; for Guandan at 1 Hz the cost is negligible (a 1-second `setTimeout` per active room is ~free), but it's still a slight inelegance vs. truly event-driven.

If we end up using Nakama (we won't — it's overkill for our scale), we'd run match loops at 1 Hz purely for timeout enforcement and treat it as event-driven within that envelope.

---

## 4. State Reconciliation Patterns

For an event-driven, server-authoritative, turn-based card game, here are the canonical patterns. Each comes from a real production source.

### 4.1 Initial state sync on join

**Pattern**: Server sends a complete, per-recipient-filtered state snapshot on first connect.

```
GET /api/game/{roomId}/stream   (SSE init)
or
WebSocket: send {"t":"hello","r":"ABC123","token":"..."}
```

Server responds with:

```json
{
  "t": "snapshot",
  "v": 47,                 // current version
  "you": {
    "playerId": "p3",
    "hand": ["S5","S6","H10","HQ","DA","C2","CK", ...],  // your 27 cards
    "teamId": 1
  },
  "table": {
    "currentTurn": "p1",
    "trickHistory": [...],
    "tributePhase": false
  },
  "players": [
    {"id":"p1", "handCount": 27, "team": 0, "lastSeen": "2026-05-16T10:23:45Z"},
    {"id":"p2", "handCount": 27, "team": 1, "lastSeen": "..."},
    ...
  ]
}
```

Note `handCount` for opponents, full `hand` array only for `you`. This is the recipient-filter applied to the snapshot. Lichess does this on its first event after `wss://` connect; Hearthstone equivalent is `CREATE_GAME` + `FULL_ENTITY` packets (with CardIDs scrubbed for opponents).

### 4.2 Mid-game reconciliation on reconnect

**Pattern**: Client says "I have version X" → server sends events X+1, X+2, ..., N.

```
WS reconnect: send {"t":"resume","r":"ABC123","v":47,"token":"..."}
```

Server responds:

```json
{"t":"event","v":48,"e":{"type":"play","player":"p1","cards":["S7","S7"]}}
{"t":"event","v":49,"e":{"type":"play","player":"p2","cards":["S8","S8"]}}
{"t":"event","v":50,"e":{"type":"pass","player":"p3"}}
{"t":"event","v":51,"e":{"type":"trickWon","winner":"p4"}}
{"t":"caught_up","v":51}
```

**Implementation**: server keeps a `Map<roomId, RingBuffer<Event>>` of the last N events (e.g., last 200, which covers ~10 full tricks for a 4-player game). If the client's `lastKnownVersion` is older than the oldest buffered event, server falls back to a full snapshot. Lichess uses this exact pattern with a `ConcurrentHashMap` per game.

**For SSE**: the `Last-Event-ID` header carries the version automatically. The server-side handler reads it and either replays from buffer or falls back to snapshot. ~30 lines of glue.

**Why not CRDT**: CRDTs (conflict-free replicated data types) are designed for concurrent multi-writer scenarios where the order of edits is irrelevant. Card games are **strictly ordered** — playing card A before card B is fundamentally different from B-then-A. CRDTs would let two players "play simultaneously" and merge, which violates game rules. Skip.

**Why not event sourcing in the heavy sense**: Full event sourcing (write every event to a durable log, rebuild state by replay) is appropriate if you need exact replay for legal disputes or competitive integrity (PokerStars-grade). For Guandan v1, in-memory event buffer is fine; persist the final game state to KV for player-stat sync but don't persist every move. v2+ feature.

### 4.3 Event ordering guarantees

**FIFO per room is sufficient**. Inside a room, every player needs to observe events in the same order — otherwise different clients see different game histories. This is what server-authority gives you for free: every event passes through one server actor (Colyseus Room, PartyKit Party, lila-ws SSE handler, Vercel Function with optimistic KV locking).

**No cross-room ordering needed.** Room A's events and Room B's events are independent.

**Within an SSE stream**: server writes events sequentially, EventSource delivers in order. Built-in.

**Within a WebSocket**: frames are TCP-ordered; you get FIFO for free as long as you don't multiplex with multiple sockets.

**Multi-server scaling**: If you scale beyond one server process, all events for a given room must funnel through the same process (Colyseus pins rooms to one node, PartyKit pins to one DO, Vercel Functions per-request need an optimistic lock or actor-per-room pattern via Upstash). The "send moves through a coordinating actor" requirement is the **reason** every production card game pins room state to one logical server.

### 4.4 Idempotent move handling

**The critical primitive.** Without idempotency, a player taps "play card" twice (due to lag) and ends up playing two cards. Or worse, the client retries on network error and the second send goes through after the first one already did.

**Pattern** (Stripe / Lichess pattern):

```typescript
// Client side
const moveId = crypto.randomUUID();  // generate once per intent-to-play
ws.send({
  t: "play",
  moveId,
  cards: ["S7","S7"],
  fromVersion: 47,  // optimistic concurrency
});

// Server side
function handleMove(roomState, msg) {
  if (roomState.seenMoves.has(msg.moveId)) {
    // Idempotent retry — replay the original outcome
    return roomState.moveResults.get(msg.moveId);
  }
  if (msg.fromVersion !== roomState.version) {
    return { type: "stale", currentVersion: roomState.version };
  }
  const result = applyMove(roomState, msg);
  roomState.seenMoves.add(msg.moveId);
  roomState.moveResults.set(msg.moveId, result);
  // Trim seenMoves to last ~50 to bound memory
  return result;
}
```

**Lichess implementation**: an acknowledgment counter `a` in each move message. The client increments it on each new move; on retry it sends the same number. The server's response includes the same number so the client knows which intent succeeded. This is the lighter version of idempotency keys (a monotonic counter per game, not a UUID per move) and works because Lichess plays one move at a time per game.

**Recommendation for Guandan**: use Lichess's pattern — a monotonic per-game move counter generated client-side. Easier to debug than UUIDs. Server stores the last N moveCounters per game.

### 4.5 Optimistic UI for Guandan

The temptation: when the player taps a card, optimistically remove it from their hand and animate it to the table, *before* server acknowledges.

The constraint: if the server rejects the move (wrong turn, invalid combination, race lost to opponent), you need to roll it back. Rollback animation is jarring.

The middle path that PokerStars / Hearthstone / well-designed card games use:

1. **Tap a card** → card *lifts visually* (style change: shadow, scale 1.05) but stays in hand. No optimistic state change yet.
2. **Tap Play (or auto-Play after 200ms with selected combination)** → button enters loading state. Card slides toward table with ghost visual. Interactions disabled.
3. **Server ack arrives (typical 50-150ms)** → card lands on table, hand updates, turn passes to next player. UI re-enabled.
4. **Server reject (rare)** → ghost snaps back to hand, error toast appears.

This is "optimistic animation, conservative state." The user perceives instant feedback (the ghost moves immediately on tap), but the *state* only updates on confirmation. Rollback is cosmetic, not semantic.

**Recommendation**: ship this pattern. Don't ship full client-side prediction (where the client *believes* the move succeeded and shows the next state). Full prediction is for sub-100ms-latency action games; Guandan's 200ms budget is loose enough for "wait for ack" with a polish animation in front.

The [developersvoice article][devvoice-cards] frames this well: "Render a 'ghost' animation immediately where the card moves visually to the board but interactions remain disabled until confirmed."

### 4.6 Version vectors and snapshots — when needed

Version vectors (one counter per writer) are for systems with **multiple concurrent writers**. Card games have one writer (the server-authoritative actor for that room). A single monotonic counter suffices.

**Periodic snapshots**: if you persist the event log for long enough that replay-from-zero would be slow (millions of events), you periodically write a snapshot to KV. For Guandan v1: not needed. Rooms last <60 min and have <500 events. v2+ if you do replay.

---

## 5. Hidden Information Enforcement

The single most security-critical aspect of the realtime layer. A bug here means players can cheat by reading opponents' hands from network traffic.

### Five approaches

1. **Server-side per-recipient DTO filtering** (Hearthstone, PokerStars, Mahjong Soul, Lichess for chess960 starting position, Skribbl drawer-only state, Colyseus `@view`, boardgame.io `playerView`, Vercel-native manual filter)
2. **Encryption-based hiding** (mental poker, zero-knowledge card protocols)
3. **Schema-level views** (Colyseus `@view` decorator — declarative form of #1)
4. **P2P with cryptographic commitments** (blockchain poker, SecureTCG, FairShuffle)
5. **Audit-only** (everyone receives everything; cheating detected post-hoc by analyzing game logs)

Only **#1 and #3** are practical for a production card game. The rest are research, niche, or unsafe.

### Per-recipient DTO filtering (the canonical pattern)

**Idea**: The server holds the full game state. Every time it emits an event, it constructs a different message per recipient, including only what that recipient is entitled to see.

**Hearthstone implementation** ([HearthSim docs][hearthstone-protocol]): the "dispatcher" is a server component that sits between the simulation and the network. When a card moves from deck to hand, the simulation emits a `TAG_CHANGE` and `FULL_ENTITY`. The dispatcher decides: for the card's owner, send the full CardID. For all other players, send only the entity ID + zone (`hand`) without the CardID. The opponent sees "a card moved into your hand" but does not see *which* card.

**PokerStars implementation** (inferred from packet structure): every message is addressed to a specific player ID. Hole cards (your two private cards) flow only to your client; community cards (the flop / turn / river) flow to everyone. Server never sends a message to the wrong player.

**Vercel-native manual implementation**:

```typescript
// /api/game/[roomId]/move.ts
export async function POST(req: Request) {
  const move = await req.json();
  const room = await kv.get(`room:${roomId}`);
  // ... validate, apply move ...
  
  // Publish per-recipient events
  for (const playerId of room.players) {
    const personalView = filterEventForRecipient(event, room, playerId);
    await redis.publish(`game:${roomId}:player:${playerId}`, JSON.stringify(personalView));
  }
}
```

Each player's SSE stream subscribes to their personal channel: `redis.subscribe(`game:${roomId}:player:${playerId}`)`. The server-side filter is the security boundary. **You must write filter functions for every event type that can carry hidden state.**

**Colyseus declarative implementation**:

```typescript
class GuandanState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type([Card]) trickPile = new ArraySchema<Card>();
  // ... public state ...
}

class Player extends Schema {
  @type("string") id: string;
  @type("number") handCount: number;  // public
  @view() @type([Card]) hand = new ArraySchema<Card>();  // private
}

class GuandanRoom extends Room<GuandanState> {
  onJoin(client: Client) {
    const player = new Player();
    this.state.players.set(client.sessionId, player);
    client.view = new StateView();
    client.view.add(player.hand);  // only this client sees this player's hand
  }
}
```

The `@view()` decorator means: **this field is excluded from the broadcast unless explicitly added to a client's view.** Adding a player's `hand` only to that player's view enforces hidden state at the framework level. You cannot accidentally leak it by writing a typo in the message payload — there's no message payload, just the diff'd state.

**This is the strongest hidden-state primitive of any framework reviewed.** [Colyseus docs warn][colyseus-stateview]: "It is not recommended to rely on `StateView` for large datasets, as it is not optimized for that yet." For 27 cards per player × 8 players = 216 entities, this is fine — well within the optimized envelope.

### boardgame.io's playerView

```typescript
const game = {
  setup: () => ({ hands: { 0: [...], 1: [...] }, deck: [...] }),
  
  playerView: ({ G, ctx, playerID }) => {
    // Strip everything except this player's hand and public state
    return {
      ...G,
      hands: { [playerID]: G.hands[playerID] },  // only own hand
      deck: G.deck.map(() => "?"),  // hide deck contents
    };
  },
};
```

The function is invoked **server-side on every state change before broadcasting to each client**. It's an imperative version of Colyseus's declarative `@view`. Equally safe if implemented correctly; more error-prone if you forget to filter a new field added later.

### Encryption-based hiding (mental poker)

**Mental poker** is a 1979 cryptographic protocol (Shamir, Rivest, Adleman) for shuffling and dealing cards over a network without a trusted third party. Each player encrypts each card, and the protocol guarantees no player learns any other player's hand until the appropriate moment.

**Status in 2026**: Academic. The Wikipedia article ([mental poker][wiki-mentalpoker]) admits implementation efforts achieved only "modest real-world performance." The most-cited implementation is libtmcg's Skat (32 cards, 3 players), and even that is "substantially less computationally intensive than a 52-card poker game." For Guandan's 108 cards × 4-8 players, mental poker would be **dramatically slow** — probably 5-30 seconds to shuffle and deal.

**When you'd use it**: never, for ordinary card games. Even the original paper notes "under non-colluding server assumptions, significantly more efficient protocols may be realized." Server-as-trusted-party is universally accepted for production card games. Skip.

### Provably fair commit-reveal (lighter middle ground)

A weaker form of cryptographic fairness, used by crypto casinos:

1. Server generates a random `serverSeed`, publishes `SHA-256(serverSeed)` before the game starts
2. Players contribute a `clientSeed` each
3. Deck order = deterministic shuffle of `HMAC-SHA256(serverSeed, clientSeed1 || clientSeed2 || ... || nonce)`
4. After the game, server reveals `serverSeed`; players can verify the hash matches and recompute the shuffle to confirm fairness.

**Cost**: ~20 lines of server code, ~10 lines of client verification. Doesn't protect against in-game cheating (server still knows the deck) but does protect against server-side deck-stacking after-the-fact.

**Recommendation for Guandan v1**: skip. This is for adversarial-money contexts where players need cryptographic proof the operator isn't cheating. Personal-project Guandan with no money: not worth the UX overhead of "verify your game" buttons. v2+ if the project gains an adversarial user base.

### P2P with cryptographic commitments

[SecureTCG, FairShuffle][cheating-p2p] — research protocols where peers collaboratively shuffle without a trusted server. Conceptually elegant. Practically: no production game uses them.

Skip.

### Audit-only (everyone receives everything, detect cheating later)

Send the full game state to every player. Use TLS so network eavesdroppers can't read it, but trust each player's *client* not to display hidden info. Then run anomaly detection on game logs to flag accounts that play "too well" given the information they should have had.

**Why this is bad**: A determined cheater patches their client to display the data. You'll catch them in aggregate (statistical anomalies over many games) but every individual game they play is compromised.

**The only justifiable use**: development / debugging mode where you want to see the whole table state. Hard-coded `if (env === "dev") { sendFullState() }`.

### What real card games do — the dispatcher pattern

**Universal answer**: server-side per-recipient filtering, implemented as a dispatcher / filter / view function between the simulation and the network.

**Audit pattern for "did private state leak"**:

```typescript
// In your message-send pipeline
function sendToPlayer(playerId: string, msg: Event) {
  // Hard assertion: opponent hand contents must not appear in messages
  for (const otherId of room.players.filter(p => p !== playerId)) {
    if (containsCardIdentities(msg, room.hands[otherId])) {
      logger.error("HIDDEN STATE LEAK", { playerId, otherId, msg });
      throw new Error("HiddenStateLeakError");
    }
  }
  // ... send ...
}
```

This is a runtime assertion you can ship in development and disable in production (or keep enabled if performance allows; the check is microseconds). Catches the most common bug: "developer added a new event type, forgot to filter the opponent's hand from it."

PokerStars takes hidden-state enforcement as seriously as authentication. Every outbound message goes through a filter. Logging is grep-able for `"opponentCards":["..."]` patterns that would indicate a leak.

### Verdict for Guandan

**Use Colyseus `@view` (declarative) if Colyseus is the chosen framework.** The strongest enforcement primitive available, framework-enforced rather than relying on developer discipline.

**Use server-side per-recipient filter functions if Vercel SSE+POST is the chosen path.** Write a `filterEventForRecipient(event, recipient, gameState)` function with one branch per event type. Pair with a runtime leak detector in development.

**Both are safe if implemented correctly.** The declarative form has a slight edge because it catches "new field added without filter" automatically; the imperative form catches more general filter logic but requires discipline.

---

## 6. Anti-Cheat at the Transport Layer

Beyond hidden-state filtering, what cheats exist for online card games and what's tractable for a personal project at launch?

### Move replay (duplicate moves)

**Threat**: Player sends "play card S7" twice due to client retry or lag, server processes both, player ends up "playing the same card twice."

**Mitigation**: Idempotency keys (see Section 4.4). Every move carries a unique ID; server dedupes.

**Implementation cost**: ~20 lines. **Ship in v1.**

### Move injection (out-of-turn moves)

**Threat**: Player sends "play card S7" when it's not their turn, hoping the server has a bug that accepts it.

**Mitigation**: Server validates `move.senderId === currentTurnPlayer`. Reject otherwise with `{"error":"NotYourTurn"}`. Standard.

**Implementation cost**: 1 line in the move handler. **Ship in v1.**

### Bot / automation detection

**Threat**: Player runs a script that plays optimally without thinking time, gaining advantage in tournaments or rating systems.

**Mitigation tier 1** (cheap, ship in v1): track move timings server-side. Flag accounts with anomalously fast / consistent move times (e.g., every move played within 50ms of optimal).

**Mitigation tier 2** (v2+): ML-based behavioral fingerprinting (mouse movement patterns, tap-pressure variance on mobile, decision-tree analysis). PokerStars and Chess.com both do this. ~Person-months of work.

**Mitigation tier 3** (overkill for personal project): real-name verification, deposit-required accounts, in-app advertising IDs. Skip.

**Recommendation for Guandan**: tier 1 in v1, surface as a flag in the player profile (not auto-ban). v2+ for tier 2 if community grows large enough that ML-grade detection is needed.

### Collusion via side channel

**Threat**: Two partners on the same Guandan team coordinate via Discord / WhatsApp / IRL phone call, signaling cards they hold. This is *the* canonical cheat in partner card games and is fundamentally not solvable at the transport layer — the side channel is by definition outside the game's traffic.

**Mitigation**: 
- Tier 1: forbid signaling via in-game chat (filter chat messages for suspicious patterns — "I have a bomb in hearts" etc.). Cheap, ship in v1.
- Tier 2 (v2+): statistical play analysis — partners who play "too well together" relative to baseline get flagged. Same ML investment as bot detection.
- Tier 3 (impractical for personal project): voice-only chat with VAD analysis, real-name accounts.

For a personal-project Guandan, **don't try.** The audience is friends-of-friends; the cost of false-positive accusations is higher than the cost of letting determined cheaters do their thing.

### Client-side card sorting tells

**Threat**: When the server sends "you played [S7, S7, S8, S8]", the order of cards in the array could leak which suits the player has grouped together — revealing partial hand structure.

**Mitigation**: Shuffle-on-send for opponent-visible card arrays. The server's broadcast normalizes order: sort by rank, then by a per-message random salt. Trivial.

**Implementation cost**: 2 lines. **Ship in v1.**

### Network timing side channel

**Threat**: Player measures the time between their "play card" send and the broadcast they receive of the opponent's response. Long pauses might indicate the opponent is "thinking hard" — revealing strategic information about close decisions.

**Mitigation**: Add randomized server-side delay (50-150ms jitter) before broadcasting opponent's move. Or, more elegantly, the server only broadcasts the move when the opponent's turn timer runs out OR when the opponent has decided — but only after a minimum delay of N seconds, regardless. Used by PokerStars to prevent "tank-and-snap" reading.

**Implementation cost**: ~10 lines. **Ship in v1.** Required for any competitive integrity. Even non-tournament Guandan benefits.

### Crypto-shuffle commitments (provably fair)

See Section 5. **Skip for v1.** Personal-project Guandan doesn't need cryptographic proof of fairness; the server is trusted by definition.

### Anti-cheat summary table for Guandan

| Cheat | Mitigation | Cost | Ship in |
|---|---|---|---|
| Move replay | Idempotency keys | ~20 LOC | v1 |
| Out-of-turn moves | `senderId === currentTurn` check | ~1 LOC | v1 |
| Bot automation | Move-timing flagging | ~50 LOC | v1 |
| Bot automation (ML) | Behavioral fingerprinting | Person-months | v3+ |
| Collusion (chat signal) | Chat filter | ~30 LOC | v1 |
| Collusion (side channel) | Statistical play analysis | Person-months | v3+ |
| Card-sorting tells | Shuffle-on-send for opponent-visible arrays | ~2 LOC | v1 |
| Timing tells | Minimum-delay broadcast on opponent moves | ~10 LOC | v1 |
| Hidden-state leak (server bug) | Runtime leak detector in dev | ~30 LOC | v1 |
| Provably-fair shuffle | SHA-256 commit-reveal | ~30 LOC | v2 |
| Real-name verification | KYC integration | weeks | not personal-project |

**v1 anti-cheat total**: ~130 LOC of straightforward server code. Achievable in 1-2 days of focused work.

---

## 7. Recommended Sync Architecture for Guandan (Vercel SSE+POST — locked)

**Status**: The v1 stack has been locked to **Vercel-native SSE+POST + Upstash Redis pub/sub**. Sections 1–6 are framework-independent. This section is prescriptive for the SSE+POST path: it provides the message contract, idempotency design, hidden-state enforcement, reconnect mechanics, the 300s SSE limit workaround, bot-inline-in-POST analysis, anti-cheat baseline, and file layout. Colyseus is **backup-only** ("if SSE hits a wall") — pointers at the end of the section, but no parallel architecture.

### 7.1 Architecture at a glance

```
Browser
  │
  │  GET /api/game/[room]/stream            (long-lived SSE; server → client events)
  │  POST /api/game/[room]/move             (one-shot HTTP; client → server commands)
  │  POST /api/game/[room]/join             (one-shot; returns initial snapshot)
  │
  ↓
Vercel Function (Fluid Compute, edge runtime in Node)
  │
  │  Redis pub/sub fanout
  │
  ↓
Upstash Redis
  ├─ channel game:{roomId}:player:{playerId}  (one channel per recipient)
  ├─ stream  game:{roomId}:events             (append-only event log w/ versions)
  ├─ key     game:{roomId}:state              (current authoritative state JSON)
  ├─ key     game:{roomId}:seen:{playerId}    (Map of seen move-IDs → cached results)
  └─ key     idem:{moveId}                    (SETNX dedupe; TTL ~5min)
```

Three Vercel functions:

- `POST /api/game/[room]/join` — authenticates, validates room state, returns a filtered snapshot of game state for the joining player.
- `POST /api/game/[room]/move` — accepts a client command (play, pass, tribute, etc.), validates, mutates state in Redis, publishes per-recipient events, and (if it's a bot's turn next) computes the bot move inline and publishes that too. Returns ACK to caller.
- `GET /api/game/[room]/stream` — long-lived SSE function. Subscribes to the joining player's personal Redis channel and writes events into the SSE response. Honors `Last-Event-ID` header for resume.

### 7.2 Concrete `MessageType` enum (locked for SSE+POST shape)

Two protocol surfaces: **events** (server → client, SSE) and **commands** (client → server, POST). The shape diverges slightly from the WebSocket bidirectional `t` discriminator pattern in Section 4 — POST commands take their type from the URL path, not a message field.

```typescript
// ──────────────────────────────────────────────────────────────────
// CLIENT → SERVER (POST body shapes)
// ──────────────────────────────────────────────────────────────────

// POST /api/game/[room]/join
type JoinRequest = {
  handle: PlayerHandle;          // @fufu
  token: AuthToken;              // room-scoped, issued by /api/game/create
  resumeFromVersion?: number;    // optional — if set, server tries event replay
};

type JoinResponse =
  | { ok: true; snapshot: SnapshotEvent; sseToken: string }   // sseToken authenticates the SSE connection
  | { ok: false; error: ErrorCode; message: string };

// POST /api/game/[room]/move
type MoveCommand =
  | { kind: "play"; cards: CardId[]; fromVersion: number }
  | { kind: "pass"; fromVersion: number }
  | { kind: "tribute_select"; targetCard: CardId; fromVersion: number }   // 进贡 — pick a card to give
  | { kind: "anti_tribute"; fromVersion: number }                          // 抗贡 — declare anti-tribute
  | { kind: "report_card"; cards: CardId[]; fromVersion: number }          // 报牌
  | { kind: "ready"; fromVersion: number };                                // pre-game ready signal

type MoveRequest = {
  moveId: string;            // client-generated UUID v4 — idempotency key
  command: MoveCommand;
};

type MoveResponse =
  | { ok: true; appliedVersion: number; result: "applied" | "replayed" }
  | { ok: false; error: "stale_version" | "not_your_turn" | "invalid_move" | "rate_limited" | "auth_failed"; details?: string };

// ──────────────────────────────────────────────────────────────────
// SERVER → CLIENT (SSE event shapes, all framed as text/event-stream)
// ──────────────────────────────────────────────────────────────────

// Each SSE message frame:
//   id: <version>           ← Last-Event-ID semantics; client tracks this
//   event: <type>           ← optional, for EventSource.addEventListener('type')
//   data: <JSON>            ← payload
//   <blank line>

type ServerEvent =
  | SnapshotEvent              // sent immediately after SSE connect or after resume gap
  | RoomJoinedEvent            // someone (could be self) joined
  | RoomLeftEvent              // someone left or disconnected
  | DealEvent                  // initial deal — per-recipient (your hand) + public (handCounts)
  | MovePlayedEvent            // a card play happened
  | MovePassedEvent
  | TrickWonEvent
  | TributePendingEvent        // tribute phase started, you owe / are owed cards
  | TributeResolvedEvent
  | RoundEndEvent              // a round finished (one team out)
  | GameEndEvent               // match finished (someone reached A-level victory)
  | StateResyncEvent           // server forces full resync (rare; sent if event buffer exhausted)
  | TurnAdvancedEvent          // turn ownership changed (with deadline)
  | HeartbeatEvent             // 10s keepalive, also doubles as latency probe
  | StreamClosingEvent;        // sent before server-initiated close (e.g., 270s mark — see §7.7)

type SnapshotEvent = {
  type: "snapshot";
  version: number;
  you: PrivatePlayerState;       // your hand, your team, etc.
  table: PublicTableState;       // turn, trick pile, levels, etc.
  players: PlayerSummary[];      // hand counts, statuses
};

type DealEvent = {
  type: "deal";
  version: number;
  yourHand: CardId[];            // 27 cards (4-player) or 13-14 (8-player)
  publicHandCounts: Record<PlayerId, number>;
  roundOwner: TeamId;
};

type MovePlayedEvent = {
  type: "move_played";
  version: number;
  player: PlayerId;              // who played
  cards: CardId[];               // shuffled per §6 "shuffle-on-send"
  combinationLabel: string;      // "Pair", "Bomb (4×7)", "Straight Flush"
  nextTurn: PlayerId;
  turnDeadline: ISOTimestamp;
};

type TributePendingEvent = {
  type: "tribute_pending";
  version: number;
  direction: "single" | "double" | "anti_tribute";
  obligations: {
    from: PlayerId;
    to: PlayerId;
    constraint: "highest_non_heart" | "any";  // 还贡 constraint differs
  }[];
  yourOwedCard?: CardId;         // populated only if this player has been given a tribute card
};

type StateResyncEvent = {
  type: "state_resync";
  version: number;
  snapshot: SnapshotEvent;
  reason: "buffer_exhausted" | "version_mismatch" | "schema_upgrade";
};

type HeartbeatEvent = {
  type: "heartbeat";
  version: number;
  serverTime: ISOTimestamp;
};

// ──────────────────────────────────────────────────────────────────
// SHARED DTOs (all hidden-state filtered)
// ──────────────────────────────────────────────────────────────────

type PrivatePlayerState = {
  playerId: PlayerId;
  hand: CardId[];
  teamId: TeamId;
  partnerId: PlayerId;
};

type PublicTableState = {
  currentTurn: PlayerId;
  currentTrick: { player: PlayerId; cards: CardId[] }[];
  lastTrick: { player: PlayerId; cards: CardId[] } | null;
  teamLevels: Record<TeamId, Level>;
  roundOwner: TeamId;
  phase: "lobby" | "dealing" | "tribute" | "playing" | "scoring" | "ended";
  turnDeadline: ISOTimestamp;
};

type PlayerSummary = {
  id: PlayerId;
  handle: PlayerHandle;
  team: TeamId;
  handCount: number;
  status: "connected" | "disconnected" | "bot";
  rank: GameRank | null;
};
```

**Why each command goes via POST, not a single endpoint**: cleaner URL routing in `app/api/`, easier to write per-route rate limits and middleware, and matches REST conventions. The protocol is *not* RESTful — each POST is a side-effecting command — but the URL grammar reads well in logs.

**Why one Redis channel per recipient instead of one per room**: per-room channel + filter-on-publish would require every SSE handler to filter every event for every player. Per-recipient channel means the publisher does the filtering once, and the SSE handler does zero filtering work. Trades CPU for memory (one subscribe per active player vs one shared subscribe per room) — the right trade at our scale (max 8 players per room, max ~100 concurrent rooms in v1).

### 7.3 Idempotency-key design for `POST /move`

**Threat model**: client retries `POST /move` after network blip. Server must accept the retry, return the original result, and **not** re-apply the move. Without this, a single tap on a flaky network could play the same card twice or, worse, advance the turn twice.

**Mechanism**: Stripe-style idempotency keys with Upstash Redis `SETNX`.

```typescript
// /api/game/[room]/move.ts
import { Redis } from "@upstash/redis";

const IDEMPOTENCY_TTL_SEC = 300;  // 5 minutes — covers any reasonable retry window

export async function POST(req: Request, { params }: { params: { room: string } }) {
  const body: MoveRequest = await req.json();
  const { moveId, command } = body;
  
  if (!isValidUUID(moveId)) {
    return Response.json({ ok: false, error: "invalid_move_id" }, { status: 400 });
  }
  
  // Step 1: idempotency lock. SETNX succeeds only if no prior request used this moveId.
  const idemKey = `idem:${params.room}:${moveId}`;
  const locked = await redis.set(idemKey, "PENDING", { nx: true, ex: IDEMPOTENCY_TTL_SEC });
  
  if (locked === null) {
    // Duplicate. Look up the cached result.
    const cached = await redis.get<MoveResponse>(idemKey);
    if (cached === "PENDING") {
      // The first request is still mid-flight. Return 425 Too Early; client retries with backoff.
      return Response.json({ ok: false, error: "in_flight" }, { status: 425 });
    }
    // Cached completed result. Return as-is.
    return Response.json(cached);
  }
  
  // Step 2: this is the first time we've seen this moveId. Process the move.
  try {
    const result = await processMove(params.room, body);
    // Cache the result keyed by the same moveId.
    await redis.set(idemKey, result, { ex: IDEMPOTENCY_TTL_SEC });
    return Response.json(result);
  } catch (e) {
    // On error, we still cache the error response so retries see the same outcome.
    const errResponse: MoveResponse = { ok: false, error: "invalid_move", details: String(e) };
    await redis.set(idemKey, errResponse, { ex: IDEMPOTENCY_TTL_SEC });
    throw e;
  }
}
```

**Key design notes**:

1. **`moveId` is a client-generated UUID v4** — collision probability is negligible across the lifetime of the game. The client mints the UUID *once* per intent-to-play and reuses it across all retries.
2. **`SETNX` (atomic) is the lock**. There's no race between the dedupe check and the write — Redis handles atomicity. This is the textbook idempotency pattern from Stripe / Zuplo / Boundedcontext writeups.
3. **`PENDING` sentinel value** lets the server distinguish "another request is mid-flight" (return 425, client backs off) from "completed result is cached" (return the cached response).
4. **5-minute TTL** is the typical Stripe default. Long enough that any reasonable retry hits the cache; short enough that the Redis key space stays small.
5. **`fromVersion` is separate from `moveId`**. The version is for optimistic-concurrency rejection of stale-state commands; the moveId is for retry safety. Both are needed — a non-stale retry should be deduped (idempotent), and a stale command should be rejected (not idempotent — different responses for different versions).

**Why not just use `fromVersion` for both?** Because the same player can retry a command after the version has advanced (e.g., they sent move at v=47, but their connection blipped and they didn't see the ACK; they retry; meanwhile the server has advanced to v=48 because the move did apply). Without `moveId`, the server sees `fromVersion=47` and rejects as stale, even though the move was successful. With `moveId`, the server returns the cached ACK from the first attempt. This is the **exact failure mode the Lichess `a` counter is designed to handle**.

### 7.4 Hidden-state filtering — `buildClientPayload`

**Centralize all per-recipient filtering in one function.** Every server-side event-publish path must go through this function — no exceptions. The discipline is enforced by the unit test below.

```typescript
// lib/realtime/buildClientPayload.ts

import { Event, GameState, PlayerId } from "@/lib/game/types";

/**
 * Build the per-recipient payload for an event. This is the SINGLE place where
 * hidden-state filtering happens. All publishes must go through this function.
 *
 * @param recipient   the player who will receive this payload
 * @param event       the canonical (full-information) event from the simulation
 * @param state       the authoritative game state (used for filtering decisions)
 * @returns the recipient-safe payload, or null if the recipient should not receive this event
 */
export function buildClientPayload(
  recipient: PlayerId,
  event: Event,
  state: GameState,
): ServerEvent | null {
  switch (event.type) {
    case "deal":
      // Each player gets their own hand; everyone gets the hand counts.
      return {
        type: "deal",
        version: event.version,
        yourHand: event.hands[recipient],
        publicHandCounts: mapValues(event.hands, (h) => h.length),
        roundOwner: event.roundOwner,
      };
    
    case "move_played":
      // Played cards are public. Shuffle the array order to avoid sort-tells (§6).
      return {
        type: "move_played",
        version: event.version,
        player: event.player,
        cards: shuffleArray(event.cards, event.version),  // deterministic shuffle per version
        combinationLabel: event.combinationLabel,
        nextTurn: event.nextTurn,
        turnDeadline: event.turnDeadline,
      };
    
    case "tribute_pending":
      // Only the affected players get the "your owed card" detail.
      const myObligation = event.obligations.find(
        (o) => o.from === recipient || o.to === recipient,
      );
      return {
        type: "tribute_pending",
        version: event.version,
        direction: event.direction,
        obligations: event.obligations.map(stripHiddenFromObligation),
        yourOwedCard:
          myObligation && myObligation.to === recipient
            ? event.privatePayloads[recipient]?.owedCard
            : undefined,
      };
    
    case "snapshot":
    case "state_resync":
      // Full state filter — separate function for clarity.
      return buildSnapshotForRecipient(recipient, event, state);
    
    case "heartbeat":
    case "room_joined":
    case "room_left":
    case "trick_won":
    case "round_end":
    case "game_end":
    case "turn_advanced":
    case "stream_closing":
    case "tribute_resolved":
      // These events carry no hidden state — pass through as-is.
      return event;
    
    default:
      // Exhaustiveness check — TypeScript will error if a new event type is added without a case.
      const _exhaustive: never = event;
      throw new Error(`Unhandled event type in buildClientPayload: ${(_exhaustive as Event).type}`);
  }
}

function buildSnapshotForRecipient(
  recipient: PlayerId,
  event: SnapshotEvent | StateResyncEvent,
  state: GameState,
): ServerEvent {
  return {
    ...event,
    you: {
      playerId: recipient,
      hand: state.hands[recipient],            // OWN hand only
      teamId: state.teams[recipient],
      partnerId: state.partners[recipient],
    },
    players: Object.entries(state.hands).map(([id, hand]) => ({
      id,
      handle: state.handles[id],
      team: state.teams[id],
      handCount: hand.length,                  // count only, never identity
      status: state.statuses[id],
      rank: state.ranks[id],
    })),
  };
}
```

**Publish wrapper that enforces the discipline**:

```typescript
// lib/realtime/publish.ts

export async function publishEvent(
  roomId: string,
  event: Event,
  state: GameState,
): Promise<void> {
  // Hard rule: nothing publishes events except through this function.
  for (const recipient of Object.keys(state.hands) as PlayerId[]) {
    const payload = buildClientPayload(recipient, event, state);
    if (payload === null) continue;
    
    // Dev-mode leak detector: scan the serialized payload for opponents' card identities.
    if (process.env.NODE_ENV !== "production") {
      assertNoOpponentHandLeak(payload, recipient, state);
    }
    
    // Also append to the event log for resume support — see §7.5.
    await redis.xadd(
      `game:${roomId}:events:${recipient}`,
      "*",
      "version", String(event.version),
      "payload", JSON.stringify(payload),
    );
    
    await redis.publish(`game:${roomId}:player:${recipient}`, JSON.stringify(payload));
  }
}

function assertNoOpponentHandLeak(
  payload: ServerEvent,
  recipient: PlayerId,
  state: GameState,
): void {
  const serialized = JSON.stringify(payload);
  for (const [otherId, otherHand] of Object.entries(state.hands)) {
    if (otherId === recipient) continue;
    for (const card of otherHand) {
      // Card identities have the form "S7", "HK", "JOK_R", etc.
      // If any opponent's specific cards appear in the recipient's payload, that's a leak.
      if (serialized.includes(`"${card}"`)) {
        throw new Error(
          `HIDDEN_STATE_LEAK: payload for ${recipient} contains opponent ${otherId}'s card ${card}`,
        );
      }
    }
  }
}
```

### 7.4.1 Unit-test grep pattern — "no raw room state ever leaves the server"

This is the most important test in the codebase. It enforces by code-review pattern that **no code path publishes events except through `publishEvent` / `buildClientPayload`**.

```typescript
// __tests__/no-direct-publish.test.ts

import { readFileSync } from "fs";
import { glob } from "glob";

test("no source file publishes Redis events outside of lib/realtime/publish.ts", () => {
  const files = glob.sync("{api,app,lib,src}/**/*.ts", {
    ignore: ["lib/realtime/publish.ts", "**/*.test.ts", "node_modules/**"],
  });
  
  const violations: { file: string; line: number; content: string }[] = [];
  
  const forbidden = [
    /redis\.publish\(/,            // direct Redis pub/sub
    /redis\.xadd\(/,                // direct stream append
    /res\.write\(.*data:/,          // direct SSE frame write outside lib/realtime/
    /Response\(.*text\/event-stream/, // direct SSE response construction
  ];
  
  for (const file of files) {
    const lines = readFileSync(file, "utf-8").split("\n");
    lines.forEach((line, i) => {
      for (const pat of forbidden) {
        if (pat.test(line)) {
          violations.push({ file, line: i + 1, content: line.trim() });
        }
      }
    });
  }
  
  expect(violations).toEqual([]);
});

test("buildClientPayload exhaustively handles every Event union member", async () => {
  // Compile-time check via TypeScript exhaustiveness. Adding a new event type without
  // a corresponding case in buildClientPayload's switch fails the build.
  // This test runs `tsc --noEmit` via execFile (no shell, no injection surface).
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const { stdout, stderr } = await run("npx", ["tsc", "--noEmit"]);
  expect(stderr).toBe("");
});

test("for every event type, recipient payload never contains opponent hand cards", () => {
  // Property-based test: for each event type, construct a game state with known
  // hand assignments, run the event through buildClientPayload, then assert that
  // serializing the result never yields a substring matching another player's
  // card identity.
  const eventTypes: Event["type"][] = [
    "deal", "move_played", "tribute_pending", "snapshot",
    "state_resync", "trick_won", "round_end", "game_end",
  ];
  
  for (const type of eventTypes) {
    const state = buildTestGameState({ recipient: "p1", hands: testHandsMatrix });
    const event = synthesizeEvent(type, state);
    const payload = buildClientPayload("p1", event, state);
    if (payload === null) continue;
    
    const serialized = JSON.stringify(payload);
    for (const opponentCard of [...state.hands.p2, ...state.hands.p3, ...state.hands.p4]) {
      expect(serialized).not.toContain(`"${opponentCard}"`);
    }
  }
});
```

The first test is the **grep**: a single regex check catches the dev-mistake "I'll just `redis.publish` from this endpoint real quick." The second enforces exhaustive matching at type level. The third does property-based runtime verification.

### 7.5 State resync on SSE reconnect — `Last-Event-ID` semantics

**The browser handles the easy half automatically.** `EventSource` reconnects on disconnect with the `Last-Event-ID` header set to the last `id:` it observed. We just need the server side to:

1. Read `Last-Event-ID` header on the GET handler.
2. Replay events from version `Last-Event-ID + 1` to current `state.version`.
3. If the requested version is too old (beyond our event-log retention), send a `state_resync` event with a full snapshot instead.

**Event log structure** (Redis Streams):

```
XADD game:{roomId}:events:{playerId} * version <N> payload <JSON>
XADD game:{roomId}:events:{playerId} * version <N+1> payload <JSON>
...
```

**Per-player event log** because each player has different filtered payloads. Retention: trim with `XADD ... MAXLEN ~ 500` so each stream holds the last ~500 events (covers ~1 hour of gameplay even in the densest scenarios).

**SSE stream handler**:

```typescript
// /api/game/[room]/stream/route.ts

import { Redis } from "@upstash/redis";

export const runtime = "nodejs";  // Fluid Compute; need Node for Redis stream subscribe

export async function GET(req: Request, { params }: { params: { room: string } }) {
  // Authenticate via sseToken in query — see §7.6 for why not Cookie or Authorization
  const url = new URL(req.url);
  const sseToken = url.searchParams.get("token");
  const player = await authenticateSseToken(sseToken, params.room);
  if (!player) return new Response("unauthorized", { status: 401 });
  
  const lastEventId = req.headers.get("Last-Event-ID");  // browser-set on reconnect
  const resumeFromVersion = lastEventId ? parseInt(lastEventId, 10) : null;
  
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // ─── 1. Catch-up replay ───
      if (resumeFromVersion !== null) {
        const events = await redis.xrange(
          `game:${params.room}:events:${player.id}`,
          `(${resumeFromVersion}-0`,  // exclusive start; XRANGE supports stream IDs
          "+",
          "COUNT", 500,
        );
        
        if (events.length === 0 && resumeFromVersion > 0) {
          // Buffer exhausted — fall back to full resync.
          const snapshot = await buildFullSnapshot(params.room, player.id);
          controller.enqueue(encodeSseFrame(snapshot.version, "state_resync", snapshot));
        } else {
          for (const [id, fields] of events) {
            const version = parseInt(fields.version, 10);
            const payload = JSON.parse(fields.payload);
            controller.enqueue(encodeSseFrame(version, payload.type, payload));
          }
        }
      } else {
        // Fresh connect — send full snapshot.
        const snapshot = await buildFullSnapshot(params.room, player.id);
        controller.enqueue(encodeSseFrame(snapshot.version, "snapshot", snapshot));
      }
      
      // ─── 2. Live subscription ───
      const subscriber = redis.subscriber(`game:${params.room}:player:${player.id}`);
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": heartbeat\n\n"));  // SSE comment, no version
      }, 15_000);
      
      subscriber.on("message", (channel, message) => {
        const payload = JSON.parse(message);
        controller.enqueue(encodeSseFrame(payload.version, payload.type, payload));
      });
      
      // ─── 3. Proactive close at 270s ───
      // See §7.7 — close before Vercel's 300s limit, signaling client to reconnect cleanly.
      setTimeout(() => {
        controller.enqueue(encodeSseFrame(0, "stream_closing", { reason: "rotation" }));
        clearInterval(heartbeat);
        subscriber.unsubscribe();
        controller.close();
      }, 270_000);
      
      // Cleanup on client disconnect (browser tab close, network drop)
      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        subscriber.unsubscribe();
        controller.close();
      });
    },
  });
  
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",  // disable nginx/CDN buffering — critical for SSE
    },
  });
}

function encodeSseFrame(version: number, eventType: string, payload: object): Uint8Array {
  // SSE wire format:
  //   id: <version>\n
  //   event: <type>\n
  //   data: <JSON>\n
  //   \n
  const frame =
    `id: ${version}\n` +
    `event: ${eventType}\n` +
    `data: ${JSON.stringify(payload)}\n\n`;
  return new TextEncoder().encode(frame);
}
```

**Client-side**:

```typescript
// src/lib/realtime/sseClient.ts

const eventSource = new EventSource(
  `/api/game/${roomId}/stream?token=${sseToken}`,
  { withCredentials: false },
);

eventSource.addEventListener("snapshot", (e) => {
  const snapshot: SnapshotEvent = JSON.parse(e.data);
  store.applySnapshot(snapshot);
});

eventSource.addEventListener("move_played", (e) => {
  const event: MovePlayedEvent = JSON.parse(e.data);
  store.applyMove(event);
});

eventSource.addEventListener("state_resync", (e) => {
  const event: StateResyncEvent = JSON.parse(e.data);
  store.applySnapshot(event);  // wholesale replace
});

eventSource.addEventListener("stream_closing", (e) => {
  // Server is rotating before 300s limit. The browser will auto-reconnect;
  // when it does, Last-Event-ID will be set, and we'll resume cleanly.
  console.debug("Server rotating SSE — reconnect imminent");
});

// EventSource auto-reconnects with Last-Event-ID. No manual code needed.
```

**The Last-Event-ID flow**:

1. Server sends `id: 47` for an event. Browser remembers `47` as the last event ID.
2. Stream dies (network blip, server rotation, hibernation).
3. After `retry:` delay (default 3s, configurable per stream), browser reconnects to the same URL.
4. Browser includes header `Last-Event-ID: 47`.
5. Server's stream handler reads the header, calls `redis.xrange(..., "(47-0", "+", "COUNT", 500)`, and replays events 48, 49, 50, ..., N.
6. After catch-up, switches to live pub/sub for new events.

This is fully spec-compliant SSE behavior. No custom reconnection logic on the client — `EventSource` is enough.

### 7.6 The 300s SSE limit — proactive rotation

**Vercel Function wall-clock limit is 300s even on Fluid Compute.** If we hold the SSE stream open past 300s, the function terminates abruptly — the client sees the stream die, reconnects, and resumes from `Last-Event-ID`. This works correctly but adds an ugly observable: the user might see a 3s gap (default `EventSource` retry interval) every 5 minutes.

**Fix**: rotate the stream proactively at **270s** (10% margin). The server:

1. Sends a `stream_closing` event (decorative — client doesn't need to act, but it makes the rotation visible in dev logs).
2. Closes the stream gracefully.
3. The browser's `EventSource` auto-reconnects within `retry:` ms.
4. The new connection's `Last-Event-ID` header carries the last seen version → server replays any events from the gap.

**Tuning `retry`**: send `retry: 100\n\n` at stream start. This sets the browser's auto-reconnect delay to 100ms instead of the default 3000ms. The 270s rotation + 100ms reconnect = ~100ms perceived gap, completely invisible to the player.

```typescript
// At stream start, before any events:
controller.enqueue(encoder.encode("retry: 100\n\n"));
```

**Why 270s, not 290s?** Vercel's wall-clock limit is enforced after the response has been initiated; there's some uncertainty around exactly when the timer starts. 270s gives a comfortable margin. Also: leaving 30s of headroom for the catch-up replay on reconnect, in case the player has been disconnected for ~15s during a network roam.

### 7.7 Bot move execution — inline in POST handler

**Goal**: when a player POSTs a move and the next turn belongs to a bot, the bot's move should fire from *the same function invocation*. The alternative — schedule the bot move via QStash or a separate trigger — adds 1-5s of latency (the cron poll interval) and breaks the "feels-like-realtime" illusion.

**Latency budget** for the all-inline path:

| Step | Time |
|---|---|
| Client POST → Vercel edge | 20-60ms |
| Function cold start (worst case, Fluid pre-warmed: ~0) | 0-200ms |
| Validate move + Redis SETNX idempotency | 5-15ms |
| Apply move to state + publish events | 10-30ms |
| **(if bot next)** Compute bot move (rule-based / WASM solver) | 10-50ms |
| **(if bot next)** Apply bot move + publish events | 10-30ms |
| Return ACK to client | 5ms |
| ACK arrives at client | 20-60ms |
| **Total RTT (client perceives)** | **80-200ms** |

Within Guandan's 200ms budget. The constraint: **bot AI must complete in <50ms inside the function**. Rule-based bots (Easy / Medium tiers from the AI strategy doc) fit comfortably; the WASM solver's typical path runs ~20-50ms; the LLM-based Hard tier (~3-5s) does **not** fit and needs a different mechanism (see below).

**Code shape**:

```typescript
// api/game/[room]/move.ts

async function processMove(roomId: string, req: MoveRequest): Promise<MoveResponse> {
  const state = await loadGameState(roomId);
  
  // 1. Validate human player's move
  const validation = validateMove(state, req);
  if (!validation.ok) return { ok: false, error: validation.error };
  
  // 2. Apply human move
  const eventsHuman = applyMove(state, req);
  for (const event of eventsHuman) {
    await publishEvent(roomId, event, state);
  }
  
  // 3. If next turn is a bot, compute and apply bot move inline
  while (state.players[state.currentTurn].kind === "bot" && !isGameOver(state)) {
    const botMove = computeBotMove(state, state.currentTurn);  // synchronous, <50ms
    const eventsBot = applyMove(state, { kind: botMove, fromVersion: state.version });
    for (const event of eventsBot) {
      await publishEvent(roomId, event, state);
    }
    // Loop continues if the next turn is also a bot.
  }
  
  // 4. Save updated state
  await saveGameState(roomId, state);
  
  return { ok: true, appliedVersion: state.version, result: "applied" };
}
```

**The `while` loop is intentional** — in a 4-player game with 3 bots and 1 human, after the human plays, all three bot turns fire from this single POST. The client sees the human's move and all bot moves arrive in sequence via SSE within ~150ms. Without the loop, each bot turn would need a separate trigger (cron, QStash) and the game would take 3-15s per round.

**Bound the loop** — `MAX_INLINE_BOT_MOVES = 8` so a misconfigured game (all bots) doesn't run forever in a single function invocation. After 8, schedule the rest via QStash with a 0s delay.

**LLM-based Hard tier**: doesn't fit in <50ms. Pattern: when it's a Hard-tier bot's turn, the move handler publishes a `bot_thinking` event (UI shows "Bot is thinking…" indicator) and enqueues a separate function call via QStash. The QStash worker runs the LLM, then POSTs the result back through the standard move endpoint. Latency goes from ~150ms to ~3-5s for Hard moves — acceptable because LLM bots are explicitly slower-thinking by design (mimics human pause).

### 7.8 Anti-cheat baseline — applied to SSE+POST

The anti-cheat list from Section 6 maps directly to this architecture:

| Cheat | Mitigation in SSE+POST | Implementation site |
|---|---|---|
| Move replay | UUID `moveId` + Redis SETNX idempotency | `api/game/[room]/move.ts` |
| Out-of-turn injection | `validateMove(state, req)` checks `senderId === currentTurn` | `lib/game/validate.ts` |
| Stale version | `fromVersion` mismatch returns `stale_version` error | `lib/game/validate.ts` |
| Hidden-state leak | `buildClientPayload` + unit test grep | `lib/realtime/buildClientPayload.ts` |
| Card-sort tells | `shuffleArray(cards, seed)` in `move_played` builder | `lib/realtime/buildClientPayload.ts` |
| Timing tells | Randomized 50-150ms delay before publishing opponent move | `lib/realtime/publish.ts` |
| Bot automation (basic) | Server logs `move_received_at - turn_started_at` per move; flag accounts with σ<100ms across 50+ moves | `lib/anti-cheat/timing.ts` |
| Auth bypass | sseToken validated on every SSE connect; `token` validated on every POST | `lib/auth/sseToken.ts` |
| Cross-room leak | Redis channels are scoped `game:{roomId}:player:{playerId}` — no cross-room subscribe possible | structural |

**The "timing-tell mitigation" deserves its own paragraph** because it's specific to the SSE+POST shape. Without it: a player POSTs a move at T=0, sees their own move accepted at T=80ms via SSE; the opponent receives the move at T=100ms via their SSE stream. Now if the opponent ponders and POSTs a response at T=15s, the original player sees that response at T=15.1s. They've measured the opponent's think time to within 100ms — useful information ("they sat on a hard decision"). Mitigation: server adds a uniform random delay `random(50, 150)ms` before publishing the opponent's move. The think-time signal is buried in jitter.

### 7.9 File-structure sketch

```
guandan-online/
├── api/
│   └── game/
│       ├── create.ts             POST — generate room, return code + host token
│       └── [room]/
│           ├── join.ts           POST — auth + snapshot (returns sseToken)
│           ├── move.ts           POST — single command endpoint (kind = play/pass/tribute/...)
│           └── stream.ts         GET  — SSE; calls /api/game/[room]/stream/route.ts under the hood
│
├── lib/
│   ├── realtime/
│   │   ├── publish.ts            publishEvent() — sole writer of pub/sub + event log
│   │   ├── buildClientPayload.ts buildClientPayload() — sole writer of per-recipient DTOs
│   │   ├── sseFrame.ts           encodeSseFrame() — SSE wire format
│   │   ├── eventLog.ts           XRANGE / XADD wrappers; retention via MAXLEN
│   │   └── auth.ts               sseToken issue + verify (HMAC-signed, short TTL)
│   │
│   ├── game/
│   │   ├── types.ts              CardId, PlayerId, GameState, Event union, etc.
│   │   ├── validate.ts           validateMove(state, req) — single source of move legality
│   │   ├── apply.ts              applyMove(state, move) — returns updated state + Event[]
│   │   ├── rules.ts              ported from sibling guandan-scorer (A-level, scoring, tribute)
│   │   ├── tricks.ts             ported from hash-panda/guandan-guide (combination recognition)
│   │   └── shuffle.ts            deterministic shuffle for shuffle-on-send
│   │
│   ├── ai/
│   │   ├── easy.ts               rule-based, random temperature 0.3
│   │   ├── medium.ts             WASM solver invocation
│   │   ├── hard.ts               LLM (DeepSeek via Vercel AI Gateway) — async path
│   │   └── pickBot.ts            dispatch by difficulty tier
│   │
│   ├── anti-cheat/
│   │   ├── idempotency.ts        SETNX wrapper
│   │   ├── timing.ts             move-timing logger + anomaly flag
│   │   └── leakDetector.ts       runtime assertion (dev-only)
│   │
│   └── kv/
│       ├── client.ts             Upstash Redis client singleton
│       ├── state.ts              loadGameState / saveGameState
│       └── locks.ts              optimistic locking for state mutations
│
├── src/                          frontend (Vite + React + TypeScript)
│   ├── lib/realtime/
│   │   ├── sseClient.ts          EventSource wrapper + typed handlers
│   │   ├── postMove.ts           generates moveId UUID, POSTs, handles retries
│   │   └── store.ts              Zustand store; applies events to local state
│   ├── components/
│   │   ├── Table/
│   │   ├── Hand/
│   │   ├── PlayButton/
│   │   └── ...
│   └── hooks/
│       └── useRealtime.ts        SSE subscribe + reconnect coordination
│
└── __tests__/
    ├── no-direct-publish.test.ts      the grep test from §7.4.1
    ├── exhaustive-payload.test.ts     buildClientPayload covers every Event
    ├── leak-detector.test.ts          property-based; recipient never sees opponent cards
    ├── idempotency.test.ts            duplicate moveId returns cached response
    ├── version-mismatch.test.ts       stale fromVersion is rejected
    └── reconnect-replay.test.ts       Last-Event-ID replay produces same state
```

**Two columns to call out**:

- **`lib/realtime/publish.ts` is the only file that writes to Redis pub/sub or appends to event log.** This is enforced by `no-direct-publish.test.ts`. Anywhere else in the codebase that wants to emit an event calls `publishEvent(roomId, event, state)`.
- **`lib/realtime/buildClientPayload.ts` is the only file that decides what each recipient sees.** Adding a new event type forces a new case in its `switch`, caught by TypeScript exhaustiveness + `exhaustive-payload.test.ts`.

### 7.10 What if SSE hits a wall — the Colyseus backup

The locked plan is Vercel SSE+POST. If during implementation any of the following blocks us:

- **Bot inline latency floor** > 200ms in practice (e.g., Upstash pub/sub fanout to 8 subscribers is slower than expected).
- **300s SSE rotation glitch** visible to users despite the 100ms `retry:` tuning (e.g., Vercel's actual close timing is unpredictable enough that ~5% of rotations produce a >1s gap).
- **Concurrent-write race conditions** at high room counts overwhelm the optimistic locking pattern (mitigation: switch to single-writer via a per-room dispatcher actor on Upstash QStash — but this is a bigger refactor).

…the fallback is **Colyseus on Fly.io** per Section 4 of [`architecture-options.md`](architecture-options.md). The message contract from §7.2 maps directly:

- `JoinRequest` / `MoveCommand` → Colyseus client messages (`room.send("play", {...})`).
- `ServerEvent` union → Colyseus state schema (with `@view` on private fields).
- `moveId` idempotency → still needed (Colyseus doesn't auto-dedupe).
- `buildClientPayload` → replaced by `@view` decorators (declarative).
- `Last-Event-ID` replay → replaced by Colyseus `allowReconnection(client, 60000)`.

The protocol semantics carry over; the framework changes. Per `architecture-options.md`, the migration cost is **~200 LOC of glue removed** + **~50 LOC of Schema decorators added** + Fly.io ops surface. ~2 days of work.

**This is documented for completeness; the v1 plan is SSE+POST and there is no parallel build path.**

---

## 8. Mechanism × framework matrix (revised)

Final table reflecting the locked decision:

| Mechanism / capability | Vercel SSE+POST (v1, **locked**) | Colyseus on Fly.io (**backup only**) | PartyKit (rejected) | Liveblocks (rejected) | Socket.IO+Fly (rejected) |
|---|---|---|---|---|---|
| Transport | SSE (server→client) + POST (client→server) | WebSocket | WebSocket | WebSocket | WebSocket |
| Hidden-state filter | `buildClientPayload` (imperative, 1 file) | `@view` decorator (declarative) | Manual | Architectural mismatch | Manual |
| Reconnect | `Last-Event-ID` (browser-native) | `allowReconnection` (framework) | DO holds connection | Managed | Socket.IO built-in |
| Idempotency | Redis SETNX + UUID moveId | Manual + UUID moveId | Manual | Manual | Manual |
| Bot inline | Yes — same function invocation | Yes — `setSimulationInterval` | Yes — Party.Server | n/a | Yes — Node loop |
| 300s wall-clock | 270s proactive rotation | Always-on Node | Always-on DO | Managed | Always-on Node |
| Cost @ 100 rooms | ~$0 (Vercel free + Upstash free) | ~$10/mo (Fly machine + Upstash) | ~$10/mo (CF DO) | ~$20+/mo | ~$10/mo (Fly + Upstash) |
| Hosting surface | Vercel only | Vercel (FE) + Fly.io (server) | Vercel (FE) + CF (server) | Vercel + Liveblocks SaaS | Vercel (FE) + Fly.io (server) |
| Matches sibling scorer | ✅ | ❌ | ❌ | ❌ | ❌ |

**Decision rationale**: platform unity, no second ops surface, $0 marginal cost match the personal-project shape. The ~200 LOC of glue is well-scoped (mostly in `lib/realtime/`) and the discipline (single publisher, single filter, grep-test enforcement) is easy to keep clean in a one-person codebase.

---

---

## Annex A: Verifiability scoring

For each claim made about a production game's architecture, here's how strong the evidence is:

| Claim | Evidence | Verifiability |
|---|---|---|
| Hearthstone uses protobuf over TCP | Open-source community decompiled protos exist; multiple independent reverse-engineering writeups | **Strong** |
| Mahjong Soul uses 5-layer protobuf wrapper over WebSocket | Multiple working reverse-engineered clients exist | **Strong** |
| Lichess uses WebSocket + Redis pub/sub + Scala | Open source; David Reis writeup with verbatim message formats | **Strong** |
| Chess.com uses WebSocket | Forum staff acknowledged the question; community speculation about CDN topology | **Medium** |
| Chess.com uses Google Cloud + MySQL | Cited in ntietz blog with public references | **Medium** |
| PokerStars desktop is TCP+SSL+LZHL+custom binary | 2009 reverse-engineering with detailed packet captures | **Strong (for 2009 era)** |
| PokerStars web client is WebSocket | Speculative; no public source | **Speculative** |
| Marvel Snap uses Unity Gaming Services | Unity case study publishes this | **Strong** |
| Marvel Snap uses Unity Transport / UDP | Speculative — based on Unity's defaults for mobile | **Speculative** |
| Skribbl.io uses Socket.IO + JSON | Reverse-engineering gist with verbatim message structures | **Strong** |
| Codenames Online (yiliansource) uses Socket.IO | Repo is open source | **Strong** |
| Among Us native uses UDP+Hazel | Multiple reverse-engineering writeups | **Strong** |
| Among Us web uses WebSocket-tunneled Hazel | Plausible inference from "they shipped a browser version" + WebSocket being the only browser-reliable option | **Medium** |
| Jackbox web uses WebSocket | No public source; only third-party blogs | **Weak** |
| Riichi City uses WebSocket+protobuf | Akagi tool intercepts WebSocket frames, confirming the transport | **Strong** |

If you act on any **Speculative** or **Weak** claim, validate it directly before relying on it.

## Annex B: Sources cited

[pokerstars-reverse]: https://github.com/daeken/Benjen/blob/master/daeken.com/entries/reversing-the-pokerstars-protocol-part-1-comp.md "PokerStars protocol reverse engineering, 2009"
[pokerstars-html5]: https://www.pokerstarsnj.com/poker/learn/news/web-poker/ "PokerStars web poker article"
[pokerstars-aph]: https://www.aph.gov.au/DocumentStore.ashx?id=0b05a62d-6bda-4eef-9699-be9655360d9e&subId=514005 "PokerStars software security submission to Australian Parliament"
[chesscom-forum]: https://www.chess.com/forum/view/general-chess-discussion/tech-question-curious-about-your-low-latency-multi-region-websocket-architecture-74351661 "Chess.com forum thread on WebSocket architecture"
[chesscom-melting]: https://ntietz.com/blog/chess-com-servers-melting-why/ "Why chess.com servers were melting"
[lichess-move]: https://www.davidreis.me/2024/what-happens-when-you-make-a-move-in-lichess "What happens when you make a move in Lichess"
[lila-ws]: https://github.com/lichess-org/lila-ws "Lichess WebSocket service repository"
[majsoul-api]: https://github.com/MahjongRepository/mahjong_soul_api "Mahjong Soul protobuf API wrapper"
[akagi]: https://github.com/shinkuan/Akagi "Akagi multi-platform mahjong assistant"
[tenhou-bot]: https://github.com/MahjongRepository/tenhou-python-bot "Tenhou Python bot reference implementation"
[tenhou-wiki]: https://riichi.wiki/Tenhou.net_client "Tenhou client reverse-engineering wiki"
[hearthstone-fireplace]: https://github.com/jleclanche/fireplace/wiki/Understanding-the-Hearthstone-Protocol "Fireplace wiki on Hearthstone protocol"
[hearthstone-protocol]: https://hearthsim.info/docs/gamestate-protocol/ "HearthSim Game State Protocol documentation"
[skribbl-protocol]: https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814 "Skribbl.io reverse-engineered protocol"
[codenames-yili]: https://github.com/yiliansource/codenames "Yilian Codenames open-source implementation"
[amongus-protocol]: https://github.com/roobscoob/among-us-protocol "Among Us network protocol writeup"
[unitysnap]: https://unity.com/case-study/marvel-snap "Unity case study on Marvel Snap"
[mdn-sse]: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events "MDN: Server-Sent Events"
[vercel-resumable]: https://github.com/vercel/resumable-stream "vercel/resumable-stream library"
[polliog-sse]: https://dev.to/polliog/server-sent-events-beat-websockets-for-95-of-real-time-apps-heres-why-a4l "SSE beats WebSockets for 95% of real-time apps"
[webrtc-baseline]: https://webrtc.ventures/2026/04/webtransport-is-now-baseline-what-it-means-for-real-time-media/ "WebTransport reaching Baseline status, April 2026"
[websocket-future]: https://websocket.org/guides/future-of-websockets/ "WebSocket.org on the future of WebSockets"
[devvoice-cards]: https://developersvoice.com/blog/practical-design/realtime-card-games-net-architecture-guide/ "Real-Time Multiplayer Card Games in .NET architecture guide"
[nakama-auth]: https://heroiclabs.com/docs/nakama/concepts/multiplayer/authoritative/ "Nakama authoritative multiplayer documentation"
[colyseus-stateview]: https://docs.colyseus.io/state/view "Colyseus StateView documentation"
[wiki-mentalpoker]: https://en.wikipedia.org/wiki/Mental_poker "Mental poker on Wikipedia"
[cheating-p2p]: https://sol.sbc.org.br/index.php/sbseg/article/download/19544/19372/ "Cheating detection in P2P online trading card games"

- PokerStars protocol reverse engineering: <https://github.com/daeken/Benjen/blob/master/daeken.com/entries/reversing-the-pokerstars-protocol-part-1-comp.md>
- PokerStars web poker expansion: <https://www.pokerstarsnj.com/poker/learn/news/web-poker/>
- PokerStars browser-based instant play expansion (2025): <https://rakerace.com/news/poker-rooms/2025/07/24/pokerstars-expands-browser-based-instant-play-across-nearly-all-game-formats>
- Chess.com WebSocket forum thread: <https://www.chess.com/forum/view/general-chess-discussion/tech-question-curious-about-your-low-latency-multi-region-websocket-architecture-74351661>
- Chess.com servers melting (ntietz): <https://ntietz.com/blog/chess-com-servers-melting-why/>
- Lichess "what happens when you make a move": <https://www.davidreis.me/2024/what-happens-when-you-make-a-move-in-lichess>
- Lichess WebSocket service (lila-ws): <https://github.com/lichess-org/lila-ws>
- Mahjong Soul API wrapper: <https://github.com/MahjongRepository/mahjong_soul_api>
- Akagi mahjong AI assistant: <https://github.com/shinkuan/Akagi>
- HearthSim Game State Protocol: <https://hearthsim.info/docs/gamestate-protocol/>
- Fireplace wiki on Hearthstone protocol: <https://github.com/jleclanche/fireplace/wiki/Understanding-the-Hearthstone-Protocol>
- Skribbl.io reverse-engineered protocol: <https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814>
- Codenames Online (yiliansource): <https://github.com/yiliansource/codenames>
- Among Us protocol writeup: <https://github.com/roobscoob/among-us-protocol>
- Unity case study on Marvel Snap: <https://unity.com/case-study/marvel-snap>
- MDN on Server-Sent Events: <https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events>
- Vercel resumable-stream library: <https://github.com/vercel/resumable-stream>
- SSE beats WebSockets for 95% of real-time apps: <https://dev.to/polliog/server-sent-events-beat-websockets-for-95-of-real-time-apps-heres-why-a4l>
- WebTransport reaching Baseline (April 2026): <https://webrtc.ventures/2026/04/webtransport-is-now-baseline-what-it-means-for-real-time-media/>
- WebSocket.org on the future of WebSockets: <https://websocket.org/guides/future-of-websockets/>
- Real-Time Card Games in .NET: <https://developersvoice.com/blog/practical-design/realtime-card-games-net-architecture-guide/>
- Building Scalable Real-Time Multiplayer Card Games: <https://dev.to/krishanvijay/building-scalable-real-time-multiplayer-card-games-3kn6>
- Nakama authoritative multiplayer: <https://heroiclabs.com/docs/nakama/concepts/multiplayer/authoritative/>
- Colyseus StateView documentation: <https://docs.colyseus.io/state/view>
- Colyseus turn-based cards demo: <https://colyseus.io/blog/new-demos-realtime-tanks-turnbased-cards/>
- boardgame.io secret state: <https://github.com/boardgameio/boardgame.io/blob/main/docs/documentation/secret-state.md>
- Mental poker on Wikipedia: <https://en.wikipedia.org/wiki/Mental_poker>
- Cheating detection in P2P online trading card games (research paper): <https://sol.sbc.org.br/index.php/sbseg/article/download/19544/19372/>
- Ably: WebSockets vs SSE: <https://ably.com/blog/websockets-vs-sse>
- Networking of a turn-based game (Longwelwind): <https://longwelwind.net/blog/networking-turn-based-game/>
- Server tick rates compared (Diamond Lobby): <https://diamondlobby.com/server-tick-rates/>
- Valorant 128-tick servers: <https://technology.riotgames.com/news/valorants-128-tick-servers>
- CS2 sub-tick architecture: <https://primagames.com/tips/counter-strike-2-tick-rate-changes-explained>
- Hathora scalable WebSocket architecture: <https://blog.hathora.dev/scalable-websocket-architecture/>
- Provably fair casinos technical guide: <https://br15.minipi.io/en/articles/provably-fair-casinos-guide>
