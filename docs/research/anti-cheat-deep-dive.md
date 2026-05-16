# Anti-Cheat Deep Dive — Guandan Online (Higher-Level)

**Date**: 2026-05-16  
**Status**: Research complete. v1 baseline + v2 plan.  
**Scope**: Account abuse, collusion, automated cheating, ranked-mode integrity. Transport-layer primitives (move replay, out-of-turn injection, timing tells, card-sorting tells, hidden-state filtering) are covered in [`realtime-sync-deep-dive.md` § Section 6](realtime-sync-deep-dive.md) and are NOT repeated here.

---

## TL;DR for the impatient

A casual online Guandan game for a personal project does not need a security team. It needs three things:

1. **Rate limiting** (1–2 days) — blocks the most basic scripted abuse
2. **IP-aware account creation throttle** (1 day) — slows multi-accounting
3. **Report button + admin dashboard** (3 days) — gives real players a voice and gives you a lever when things go wrong

Everything else in this document is a v2 concern, or deferred entirely because the cost-to-benefit at personal-project scale is negative. This document exists to make those tradeoffs explicit, not to build a fraud team.

---

## 1. Threat Model — What Cheaters Actually Do in Card Games

Partnership card games (Guandan, Tichu, Bridge) have a distinct threat surface because **the partnership is baked into the rules**. The most dangerous cheats are not technical exploits but social ones — partners sharing information they shouldn't have.

### 1.1 Collusion via Side Channel

**What it is**: Partners communicate via Discord, WeChat, phone call, or physical proximity while playing online. They share hand composition ("I have the 4-bomb," "I'm weak in hearts"), coordinate play order, and signal when to hold bombs.

**How common**: The dominant cheat in real-money poker (PokerStars estimates side-channel collusion is responsible for the majority of cheating incidents it investigates) and the central concern in competitive Bridge (ACBL bans players for life for proven signaling). In Mahjong Soul (雀魂) community reports on the Chinese forums (nga.cn), multi-device collusion in ranked matches is a persistent complaint. For casual free-to-play Guandan with no money stake, it's mostly friends-playing-with-friends-on-the-phone — present but not adversarial.

**How detectable**: Almost impossible in real time. Post-hoc statistical analysis (win-rate of colluding partners vs. population baseline) can surface suspicious pairs over hundreds of games. PokerStars employs a team of analysts doing exactly this. Chess.com has published that its collusion team cross-references browser fingerprints and IP patterns with play quality.

**How mitigated**:
- Real-time: filter in-game chat for explicit hand signals (cheap, mostly catches naive cheaters)
- Post-hoc: flag room pairs that play together 20+ games and have statistically anomalous win-rate differential (v2+)
- Social: publish a community norm ("collusion is unsportsmanlike even in casual play")

### 1.2 Multi-Accounting

**What it is**: One player controls 2+ accounts simultaneously in the same game room. In Guandan's partnership mode, this means controlling both seats of one team — effectively playing against yourself with full information on the "opponent" hand.

**Severity**: High. A player with two accounts on the same team has perfect knowledge of the team's combined hand. This trivially breaks game balance.

**How common**: Rare in money games (too much friction to manage two clients). More common in free ladder games where a secondary account is used to feed Elo into a primary — a well-documented problem on Chess.com and Hearthstone's ranked ladder. In Guandan's Chinese-regional online communities (小程序 tables), this manifests as someone running the game on two phones.

**How detectable**:
- Same IP in the same room (cheap, catches naive cases)
- Browser fingerprint similarity (Canvas + WebGL fingerprint: FingerprintJS Pro captures this)
- Behavioral correlation (two accounts respond to each other's moves within 500ms consistently)
- Account age asymmetry (one account is old, the paired account was created the day before)

**How mitigated**: See Section 2 for the full mitigation stack.

### 1.3 Bot / Scripted Client

**What it is**: A human (or fully automated process) runs a scripted Selenium/Puppeteer client that submits moves via the game's HTTP API, bypassing the real browser UI entirely. The bot plays near-optimally with perfect reaction speed.

**Severity**: Medium for casual, High for ranked. In casual play, a bot playing optimally still loses to human expert teams because Guandan requires partner coordination judgment that pure card-quality optimization misses. In ranked, a 24/7 bot farming Elo is directly destructive.

**How common**: PokerStars famously banned thousands of bot accounts in 2019 ([PokerStars Bot Purge][pokerstars-bot-purge]). Lichess has an entire automated process that detects bot-like play quality via analysis of move choice vs. Stockfish's top suggestions — they ban hundreds of accounts monthly. For a personal-project Guandan with no money stake, incentive to deploy a bot is very low.

**How detectable**:
- Move timing distribution (bots: tight, σ < 200ms; humans: wide, 2–60s with concentration drift)
- Move quality consistency across a long session (bots don't fatigue; human quality drifts in session hours 2–3)
- WebDriver flag (`navigator.webdriver === true` for raw Selenium — trivially bypassed but catches lazy scripts)
- Request headers from non-browser HTTP clients (missing `Accept-Language`, `sec-fetch-*`, `User-Agent` anomalies)

**How mitigated**: Rate limiting catches the most brazen cases. Move-timing logging (already in Section 6 of realtime-sync) flags suspicious accounts. Automated ban is deferred to v2.

### 1.4 Card-Counting Tools / External Trackers

**What it is**: Player runs a browser extension or separate app that tracks cards played across rounds and suggests optimal plays for the remaining deck. Legal in casual play (poker players use HUDs openly), questionable in ranked.

**Severity**: Low to medium. Guandan's hidden state (other players' hands are not revealed until played) makes card counting less powerful than in Blackjack. The main advantage is inferring opponents' likely hand composition from what they haven't played yet — useful but not decisive.

**How common**: In premium poker sites (PokerStars, GGPoker), HUD tools are banned in most formats. In Hearthstone, the Arena Tracker app was widely used until Blizzard cracked down. In casual Chinese card-game communities, equivalent tools are rare because the games don't have the same financial incentives.

**How mitigated**: In casual mode — don't bother. In ranked mode, clearly document that assist tools violate ranked rules (same as ranked-mode engine-assist policy). No technical mitigation is feasible because the tool reads from the player's screen, not the game's transport.

### 1.5 Engine Assistance (Parallel Solver)

**What it is**: Player has the game open in Tab A, and has our own Medium/Hard bot's solver running in Tab B. They manually type their hand and the table state into the solver, get the optimal play suggestion, then switch back to Tab A and execute it. No automated client — pure human effort, but with computer assistance.

**Severity**: Medium in ranked, irrelevant in casual. The effort required (manually entering 13-card hand + table state after every card played) makes this only worth it for determined ranked cheaters.

**How common**: Chess engine assistance is the #1 form of online chess cheating (Chess.com publishes annual reports on this). In card games it's less documented but structurally identical. 雀魂 (Mahjong Soul) has multiple forum threads on players using external AI mahjong assistants.

**How detectable**: Effectively impossible. There is no client signal that distinguishes "player thought for 8 seconds" from "player typed hand into solver for 8 seconds."

**How mitigated**: In ranked mode, disable or remove any in-game "hint" / "suggested play" features. Make the solver inaccessible within the ranked game context. Can't stop external tools, but don't make the problem worse. See Section 5.

### 1.6 Elo / Account Farming

**What it is**: A primary account repeatedly plays against throwaway "feeder" accounts that intentionally lose. The feeders surrender Elo to the primary. Often the same human controls all accounts (see multi-accounting) or coordinates with friends.

**Severity**: Irrelevant in v1 (no ranked mode, no Elo). High in v2 if a ranked ladder ships. Elo farming ruins ladder integrity — the primary account's rank doesn't reflect actual skill, corrupting matchmaking for everyone.

**How common**: Systematic in every competitive ranked game once the stakes (prestige, rewards) are high enough. League of Legends, Hearthstone, 雀魂 all dedicate engineering to detecting it. The detection signal is usually: very low win-rate accounts that consistently lose to the same specific accounts.

**How mitigated**: Ranked eligibility gates (Section 9). Phone verification as baseline cost. Anomaly detection on win-rate patterns. Out of scope for v1.

### 1.7 Vote / Report Manipulation

**What it is**: Players mass-report honest opponents to force penalties (silences, account flags, temporary bans). In games with community voting features (like the sibling scorer's 最C / 最闹 voting), coordinated friends can abuse the vote to give undeserved results.

**Severity**: Low for automated systems. Requires coordination. For a small community, peer pressure handles this better than automated countermeasures.

**How common**: Documented in League of Legends (report abuse became so prevalent that Riot switched to behavior detection instead of report-count thresholds). Less common in small-community games.

**How mitigated**: Rate-limit reports per account per game. Require minimum game completion to vote. Manual review before any automated penalty triggers. See Section 6.

---

### Threat Summary Table

| Threat | Severity in Casual | Severity in Ranked | Tractability | v1 Action |
|---|---|---|---|---|
| Collusion via side channel | Low | High | Hard (social problem) | In-game chat filter only |
| Multi-accounting | Medium | High | Medium | IP throttle + same-room IP warning |
| Bot / scripted client | Low | High | Medium | Rate limit + timing log |
| Card-counting tools | Low | Medium | Impossible | Policy statement only |
| Engine assistance | Low | Medium | Impossible | Disable hints in ranked |
| Elo farming | None (no Elo) | High | Medium | Ranked eligibility gates (v2) |
| Report abuse | Low | Low | Medium | Rate-limit reports |

---

## 2. Account-Level Integrity

### 2.1 The Anonymous Handle Problem

The sibling `guandan-scorer` uses anonymous `@handles` — no email, no phone, no identity verification. Guandan Online inherits this for v1: low friction, fast to ship, same as the established pattern. The tradeoff is that handles are trivially creatable — no barrier to multi-accounting.

This is an explicit product decision, not an oversight. For a casual game among friends-of-friends, reducing sign-up friction matters more than blocking multi-accounting. The risk is acceptable at small scale.

### 2.2 IP-Based Account Creation Throttle

**Mechanism**: Track account creation attempts per IP over a rolling 24-hour window. Upstash counter with a sliding window is the right tool (the sibling already uses Upstash for room KV).

```typescript
// lib/anti-cheat/account-creation.ts
const key = `acct_create:${clientIp}`;
const count = await redis.incr(key);
if (count === 1) await redis.expire(key, 86400); // 24h window
if (count > MAX_ACCOUNTS_PER_IP_PER_DAY) {
  return Response.json({ error: 'TooManyAccountsFromThisIP' }, { status: 429 });
}
```

**Threshold**: `MAX_ACCOUNTS_PER_IP_PER_DAY = 5` for v1. High enough to not block legitimate household sharing (two siblings on the same router), low enough to slow bulk account creation.

**Limitations**: Trivially bypassed by VPN or mobile data. Does not stop determined multi-accounters. Goal is to raise the cost, not make it impossible.

**Implementation cost**: ~30 LOC, 2 hours. Ship in v1.

### 2.3 Account Age Signals (Trust Badges)

Display badge on player card based on account age:

| Badge | Chinese label | Threshold |
|---|---|---|
| None | (new player indicator) | < 7 days |
| 老手 | Experienced | 30+ days |
| 资深 | Veteran | 90+ days |
| 元老 | Elder | 365+ days |

These badges serve two purposes: signal legitimacy to room hosts, and give older accounts a soft status reward. Room hosts can choose to reject new-account joins (configurable setting: "禁止新人" — block accounts < 7 days old).

**Implementation cost**: ~20 LOC (badge rendering based on `createdAt` timestamp). Ship in v1.

### 2.4 Trust Score (Composite Signal)

A lightweight computed metric — not exposed to users as a number, but used internally for moderation triage:

```
trust_score = (
  completion_rate * 0.4   // games completed / games joined (dropout penalty)
  + win_rate_sanity * 0.3 // flag if win rate > 85% (bot-like)
  + report_clean * 0.3    // 1.0 if zero reports, decays with each report
)
```

Low trust score → moderator review queue, not automated ban. Trust score is internal; never shown to players.

**Implementation cost**: ~50 LOC in the player stats update path. Computable at game end from existing stats. Ship in v1 as data-collection; enforcement in v2.

### 2.5 Same-Room Same-IP Detection

When a player joins a room, check if any existing player in that room shares the same IP. If yes, warn the host:

```
⚠️ @player2 appears to be joining from the same network as @player1. This may indicate multi-accounting.
```

Warning only — no block. False positives (two household members genuinely playing together) are common enough that automatic rejection would be wrong. Gives the host agency.

**Implementation cost**: ~20 LOC in the room-join handler. Ships in v1.

### 2.6 Ranked Mode: Phone Verification (v2 Design Preview)

Ranked requires a real identity cost. Phone verification (OTP via Twilio / Vonage / Alibaba SMS) adds ~$0.01/verification. One phone = one ranked account (enforced by phone number hash, not stored raw).

This is out of scope for v1. Even for v2, implement only if the ranked ladder actually launches and the community grows large enough that multi-accounting becomes a visible problem — not as a preemptive measure.

---

## 3. Collusion Detection (The Gnarliest Problem)

Collusion is the canonical hard problem in partnership card games. Unlike move injection or bot automation, collusion is a **social exploit** that operates outside the game's transport entirely. The game server cannot observe the side channel.

### 3.1 What Collusion Looks Like in Play

A colluding team playing Guandan:
- Partner A tells Partner B via WhatsApp: "I have two red-heart wildcards, I'll save them for the final round"
- Partner B now knows to avoid triggering bombs that would consume A's wildcards
- The team plays with near-perfect information about their combined hand composition

Statistical signature: colluding partners exhibit **unexplained coordination** in timing and decision quality that exceeds what shared game state alone would justify. Their "reading of the table" is suspiciously accurate.

### 3.2 What Production Games Do

**PokerStars**: Full-time analytics team. Two-player colluding ring analysis via graph clustering on "played-together" vs "won-together" rates. Players who win significantly more when specifically playing *against each other's opponents* (not just when teamed) get flagged. Investigation takes weeks; confirmed cases result in winnings clawback and permanent ban. The 2017 [PokerStars collusion bust][pokerstars-collusion] involved automated graph analysis surfacing a 28-person ring.

**Chess.com**: Engine-correlation analysis. Cheating detection team manually reviews flagged accounts before any ban. They publish an [annual cheating transparency report][chess-cheat-report]. Their primary tool for solo-game cheating is correlation with engine lines — not directly applicable to partner games, but the organizational model (automated flag → human review → ban) is the right template.

**Mahjong Soul (雀魂)**: Periodic ban waves announced via official channels. Community-reported cases are reviewed manually. No public technical detail on automated detection; inferred from ban-wave timing that it's primarily report-driven. The Chinese player community's anti-cheat culture relies heavily on social pressure and public naming, which is not a pattern we want to replicate.

**Tichu** (online implementations like Tichu-Online.de): No automated detection. Relies entirely on community moderation. This is the honest outcome for small-community games: the community polices itself.

### 3.3 What's Tractable for Guandan Online

**v1 (passive logging)**:
- Log every game: which 4 handles played together, who was partnered, who won, how many rounds
- No alerting, no automated flags — just data collection
- Cost: ~0 extra LOC (this data is already in the game record)

**v2 (statistical flag)**:
- Batch job (daily/weekly): aggregate pair statistics
  - `games_together`, `win_rate_as_partners`, `games_as_opponents`, `win_rate_vs`
- Flag pairs where: `games_together > 20` AND `win_rate_as_partners > population_mean + 2σ`
- Flag is for manual review, not automatic penalty
- Population baseline requires ~5,000+ games to establish meaningful σ — probably not achievable at personal-project scale in v1

**v2 heuristic (simpler version)**:
- Flag any pair of handles that plays 5+ games in a single day with ≥80% win rate as partners
- Low signal-to-noise, but catches obvious farming-for-stats behavior

**What NOT to do**:
- Build "mirror play" detection (partner responds to my move within 200ms with optimal counter) — the timing windows overlap with normal fast play; false positive rate would be high
- Build chat analysis for card signals — filter obvious explicit signals ("I have J-bomb"), skip NLP-based intent analysis (premature)
- Issue automated penalties based on statistics alone — human review required before any ban

**Honest assessment**: For a personal project at launch, collusion detection is a research archive, not a product feature. The expected volume of colluding teams in a casual game with no money stake is near zero. If it becomes a problem, the detection infrastructure from v2 gives you something to act on. Build the data pipeline in v1; build the analysis in v2 only if the community is large enough to generate a meaningful baseline.

---

## 4. Bot / Scripted-Client Detection

Guandan Online has first-class AI bots — Easy / Medium / Hard difficulty tiers playing in rooms. A cheating human could deploy their own bot to play for them. The challenge: from the server's perspective, a human player and a bot player look identical at the transport layer if the bot correctly spoofs timing.

### 4.1 What the Server Can Actually See

| Signal | Human | Bot |
|---|---|---|
| Move inter-arrival time | 2–60s, high variance, increases late in session | 0.5–5s, low variance, consistent across session |
| Response to turn-start ping | Jitter ±500ms (network + human delay) | ±50ms (code path) |
| Session duration | Variable, breaks, reconnects | Long, stable, no breaks |
| Move quality | Drifts lower in session hours 2–3 | Stays consistent |
| IP / User-Agent | Normal browser stack | May expose automation headers |

### 4.2 WebDriver Detection

Basic automated clients using Selenium / Playwright expose `navigator.webdriver === true`. Check this in the session initialization flow:

```typescript
// Client-side (game init)
if (navigator.webdriver) {
  // Don't block — just log the signal server-side via an API call
  await fetch('/api/game/session/flag', {
    body: JSON.stringify({ reason: 'webdriver_flag', room }),
    method: 'POST',
  });
}
```

Client-side detection is trivially bypassed by any competent bot operator. The value is catching naive/lazy scripts — which are more common than sophisticated ones. Do not auto-ban on this signal alone.

### 4.3 Move Timing Logging

Already recommended in [realtime-sync-deep-dive.md § Section 6](realtime-sync-deep-dive.md):

> Track move timings server-side. Flag accounts with anomalously fast / consistent move times (e.g., every move played within 50ms of optimal).

In practice, flag accounts where:
- `p10_move_time < 800ms` AND `σ_move_time < 500ms` over 30+ games
- This indicates both very fast AND very consistent — the bot signature

Store timing percentiles in player stats. Surface in admin dashboard. Do not auto-ban.

### 4.4 Honest Verdict

A sophisticated bot operator (e.g., someone running our own Medium bot's WASM solver against a modified client) will be nearly impossible to detect via server-side signals. The primary countermeasure is **consequence**: if a bot is detected and reported, the operator loses the account. For a casual game with no money stake, the effort to build and maintain a bot far outweighs the benefit — which is why bot cheating is almost exclusively a ranked/money-game problem.

For v1: collect timing logs, surface anomalies in admin dashboard. For ranked mode: deploy more aggressive timing analysis and require CAPTCHA on account creation.

---

## 5. Engine Assistance (Parallel Solver Use)

The game ships a Hard-tier bot powered by a LLM + WASM card solver. A player could open the game in Tab A, open the solver in Tab B (or use our own game's bot endpoint), manually enter their hand, and use the suggestions to inform every move. This is structurally identical to chess engine assistance — the #1 form of cheating in online chess.

**Detection: effectively impossible.** There is no client-side telemetry that can distinguish "player thought for 12 seconds" from "player looked up the solver for 12 seconds." The only behavioral signal — slightly longer move times — is ambiguous and inconsistent.

**Mitigation**:
- In casual mode: do nothing. The game is for fun; if someone wants to use a solver to not embarrass themselves in front of friends, that's fine.
- In ranked mode: disable any in-game "hint" or "suggest play" UI features entirely. Make it clear in the ranked rules that external assistance tools violate ranked integrity. This raises the barrier (the cheater must use an external tool, not our own UI) without eliminating it.
- Do not build "solver-output correlation" analysis — the variance in human play quality is too high to get meaningful signal.

This is the same conclusion Chess.com and Lichess have reached for casual play: you cannot detect engine assistance reliably, so you focus enforcement on ranked and competitive formats where the stakes justify the effort.

---

## 6. Reporting + Moderation

### 6.1 In-Game Report Button

Every player card (visible during and after game) has a 举报 (Report) button. Report modal:

```
举报 @handle

理由（select one）:
○ 作弊 / Cheating
○ 挂机 / AFK / disconnecting repeatedly  
○ 言语攻击 / Harassment in chat
○ 刷分 / Score manipulation
○ 其他 / Other

[Optional: 60-char description]

[Submit]
```

### 6.2 Report Storage

Reports stored in Upstash with a structured key:

```
report:{reporter_handle}:{target_handle}:{game_id}
```

Value:
```json
{
  "reason": "cheat",
  "description": "...",
  "timestamp": 1747381200,
  "gameId": "ROOM-A1B2C3",
  "roundSnapshot": "...optional game state ref..."
}
```

Deduplication: one report per `{reporter}:{target}:{game_id}` triplet. If the same reporter tries to report the same target in the same game twice, silently accept but don't store a second record.

### 6.3 Rate Limiting Reports

A malicious player could flood reports against an innocent target. Limits:
- Max 3 reports submitted per account per day
- Max 1 report per account per game (cross-game rate limit)
- Cooldown: 5 minutes between report submissions

```typescript
const reportKey = `report_rate:${reporterHandle}`;
const count = await redis.incr(reportKey);
if (count === 1) await redis.expire(reportKey, 86400);
if (count > 3) return Response.json({ error: 'ReportLimitReached' }, { status: 429 });
```

### 6.4 Aggregation and Escalation

Weekly batch (or triggered by admin):
- Pull all reports from last 30 days
- Aggregate by target handle: `report_count`, `distinct_reporter_count`, `reason_distribution`
- Flag for review if: `report_count > 5` AND `distinct_reporter_count > 3`

Thresholds are deliberately high for v1. The expected report volume in a personal-project game is low; erring toward false negatives (missing a genuine cheater) is better than false positives (banning an innocent player based on coordinated false reports).

### 6.5 Admin Dashboard

Gated by `ADMIN_TOKEN` environment variable — same pattern as the sibling scorer's admin endpoints. Located at `/admin`:

```
/admin
  ├── /reports       — report log with filters, dismiss / escalate actions
  ├── /players       — player list, stats, trust score, account age
  ├── /rooms         — live and recent rooms, replay link
  ├── /ban           — ban handle (sets banned:true in player KV, rejects all API calls)
  └── /unban         — reverse ban
```

For a 1-person project, "moderation" means: open `/admin/reports` every week or two, see if anything looks real, act if it does. The infrastructure just needs to surface the data — automation is not the primary goal for v1.

### 6.6 Ban Implementation

When `players/{handle}.banned === true`:
- Reject all API calls from that handle with `{ error: 'AccountSuspended' }`
- Don't expose the ban reason to the client (prevents gaming the system)
- Optionally: notify the player via a toast on next session load

Bans are reversible. No permanent infrastructure changes for v1.

---

## 7. Vercel BotID Integration

Vercel BotID became generally available in June 2025. It operates at the edge, before requests reach Vercel Functions, and classifies traffic based on behavioral signals, request metadata, and ML-trained fingerprints.

**Use case for Guandan Online**: Detect scripted clients hitting `POST /api/game/[room]/move` at impossible speeds — effectively a server-side complement to the client-side WebDriver check.

**Configuration** (in `vercel.json`):

```json
{
  "botProtection": {
    "enabled": true,
    "mode": "block",
    "routes": ["/api/*"]
  }
}
```

BotID adds `x-vercel-bot-detection` headers to incoming requests that reach your Function. Values: `none` / `likely-bot` / `bot`. Read in the Function:

```typescript
const botScore = request.headers.get('x-vercel-bot-detection');
if (botScore === 'bot') {
  return Response.json({ error: 'BotDetected' }, { status: 403 });
}
if (botScore === 'likely-bot') {
  // Log but don't block — false positive rate non-trivial
  await logBotFlag(handle, gameId);
}
```

**Cost**: Included in Vercel Pro plan. No additional charge.

**Implementation cost**: ~10 lines of header-reading code. 4-hour integration. Ship in v1.

**Limitations**: BotID catches scraper bots and basic automation. A sophisticated attacker running a headless Chrome with human-like timing will evade it. For a personal project, that level of adversary is not the target — BotID handles the 90% case.

---

## 8. Rate Limiting + DDoS Protection

All API routes need rate limiting. The sibling scorer uses Upstash for KV — Upstash's Rate Limit SDK (`@upstash/ratelimit`) is the natural choice.

### 8.1 Per-Route Limits

| Route | Limit | Window | Rationale |
|---|---|---|---|
| `POST /api/game/[room]/move` | 10 / handle | 5s | Max ~2 moves/s even in a fast game; 10 gives headroom |
| `POST /api/game/[room]/move` | 5 / IP | 5s | Secondary IP limit catches multi-account same machine |
| `POST /api/tribute/select` | 1 / handle | 30s | One tribute selection per tribute phase |
| `GET /api/game/[room]/stream` | 1 active / handle | — | Additional connections close oldest (SSE backpressure) |
| `POST /api/room/create` | 10 / handle | 1h | Prevent room-spam |
| `POST /api/room/join` | 50 / handle | 1h | Prevent join-flood across rooms |
| `POST /api/players/create` | 5 / IP | 24h | Account creation throttle (Section 2.2) |
| `POST /api/report` | 3 / handle | 24h | Report abuse prevention (Section 6.3) |

### 8.2 Implementation Pattern

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const moveLimitByHandle = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '5s'),
  prefix: 'rl:move:handle',
});

const moveLimitByIp = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '5s'),
  prefix: 'rl:move:ip',
});

// In the move handler:
const [handleResult, ipResult] = await Promise.all([
  moveLimitByHandle.limit(handle),
  moveLimitByIp.limit(clientIp),
]);

if (!handleResult.success || !ipResult.success) {
  return Response.json({ error: 'RateLimitExceeded' }, { status: 429 });
}
```

**Implementation cost**: ~80 LOC, 1 day to wire across all routes. Ship in v1.

### 8.3 DDoS

Vercel's edge absorbs volumetric DDoS automatically at the platform level. No application-layer configuration needed. For application-layer abuse (e.g., slow-loris against SSE connections), the SSE reconnection design (see [realtime-sync-deep-dive.md § Section 7](realtime-sync-deep-dive.md)) already limits one active SSE connection per handle — a natural throttle.

---

## 9. Ranked Mode (v2 Design Preview)

Ranked mode ships with v2, if ever. This section is a design sketch to ensure v1 architecture choices don't paint us into a corner.

### 9.1 Eligibility Gate

To enter the ranked queue:
1. Phone-verified account (OTP, one phone per ranked account)
2. 100+ casual games completed (completion rate > 70%)
3. Account age > 14 days
4. No active bans or report flags in the last 30 days

The eligibility gate is the primary anti-multi-accounting control. Creating a feeder account requires phone verification — cost is a real phone number.

### 9.2 Elo System

Separate Elo ladder per mode: 4P, 6P, 8P. Starting Elo: 1500. K-factor: 32 for first 20 ranked games, 16 thereafter (standard chess.com / lichess approach).

Team Elo update: the average Elo of the winning team gains (+ΔElo) and the losing team loses (-ΔElo). Individual adjustments proportional to individual deviation from team average (to reward carrying; penalize freeloading).

### 9.3 Anti-Collusion in Ranked

Ranked rooms forbid same-IP matches:
- When a ranked room fills, server checks IPs of all 4 players
- If any two share an IP, abort the match and requeue
- This makes household multi-accounting expensive (need different IP addresses — VPN defeats this but raises the bar)

Ranked rooms use random matchmaking only — no private rooms. This prevents pre-arranged feeder matches.

### 9.4 Ranked Ban Policy

Upon confirmed cheating in ranked:
- Elo reset to 1500
- 7-day ranked ban
- Second offense: permanent ranked ban (casual play allowed)

Confirmed = manual review by admin + either confession or overwhelming statistical evidence.

### 9.5 Disable In-Game Hints

In ranked rooms, the "suggest play" hint feature (if one ships in v1 casual) is hidden. API endpoint for hints (`POST /api/hint`) rejects requests from ranked rooms with `{ error: 'HintsNotAllowedInRanked' }`.

---

## 10. Honest Priorities for v1

Given a solo engineering budget and a casual-first launch, here is what is actually worth building, in priority order:

| Priority | Feature | Effort | Impact | Decision |
|---|---|---|---|---|
| 1 | **Rate limiting** on all API routes | 1 day | Blocks basic scripted abuse, DDoS | **Ship in v1** |
| 2 | **IP-based account creation throttle** | 2 hours | Slows bulk multi-accounting | **Ship in v1** |
| 3 | **Same-room same-IP warning** for hosts | 2 hours | Surfaces obvious multi-accounting | **Ship in v1** |
| 4 | **Report button + admin dashboard** | 3 days | Gives players a voice; gives you a lever | **Ship in v1** |
| 5 | **Vercel BotID integration** | 4 hours | Catches basic scripted clients, free | **Ship in v1** |
| 6 | **Account age badges** (老手 / 资深) | 2 hours | Trust signal, community culture | **Ship in v1** |
| 7 | **Move timing logging** | included in transport work | Bot detection data collection | **Ship in v1** |
| 8 | Collusion statistical analysis | 1 week | Low signal at small scale | **Defer to v2** |
| 9 | ML bot detection | Person-months | Premature at personal-project scale | **Defer to v3+** |
| 10 | Phone verification | 2 weeks | Only needed for ranked | **Defer to v2** |
| 11 | Elo + ranked mode | 4+ weeks | Separate feature set | **Defer to v2** |

**v1 anti-cheat total** (this layer only, not counting transport-layer work from realtime-sync-deep-dive.md):
- ~200 LOC of Upstash rate-limit wiring
- ~80 LOC of admin dashboard report display
- ~30 LOC of account-creation throttle
- ~20 LOC of same-room IP check
- ~10 LOC of Vercel BotID header reading

**Total: ~340 LOC, ~5–6 days of focused engineering.** Achievable in the first week of v1 development alongside the transport work.

---

## 11. What NOT to Build in v1

These anti-patterns would cost real engineering time with near-zero benefit at personal-project scale:

**Don't build automated cheat detection with penalties.** At <10,000 games, false positive rates from statistical models are too high. A wrongly-banned player in a small community does more damage to trust than the cheater they replaced.

**Don't gate features behind real-name verification.** The friction cost (many legitimate users drop off) is higher than the abuse prevention benefit at this scale. Real-name verification is a meaningful tool at 100,000+ users and competitive money stakes — not for a casual friend-group card game.

**Don't deploy ML-based collusion detection.** Requires a training dataset of labeled collusion examples (which you don't have), a feature engineering pipeline (which requires months of logged game data), and a false-positive review process (which requires human moderators). The entire stack doesn't become viable until you have both significant scale AND a confirmed collusion problem.

**Don't build a shadow-ban system.** Shadow bans (player can still play but others don't see them) are powerful tools at scale (Twitter, Reddit use them). For a personal project with a small community, they create confusion and erode trust when discovered — which they always are.

**Don't copy-paste chess.com's anti-cheat architecture.** Chess.com has a dedicated anti-cheat team, 10+ years of move data, Stockfish as ground truth, and millions of daily active users. None of those conditions apply here. Their techniques are worth understanding for v2+ planning, but implementing them in v1 is premature engineering theater.

---

## References

- [PokerStars Bot Purge 2019][pokerstars-bot-purge] — PokerStars blog on automated bot detection and account bans at scale
- [Chess.com Annual Cheating Transparency Report][chess-cheat-report] — chess.com publishes cheating stats; 2024 report covers engine-correlation methodology
- [PokerStars Collusion Ring Detection 2017][pokerstars-collusion] — graph-clustering approach to finding multi-player collusion rings
- [Mahjong Soul (雀魂) Community Anti-Cheat Discussion][majsoul-forum] — NGA forum threads on collusion in ranked mahjong; community-moderation patterns
- [Lichess Account Closing Policy][lichess-policy] — open-source game's documented cheating detection and closing criteria
- [Upstash Rate Limit SDK][upstash-ratelimit] — `@upstash/ratelimit` sliding window implementation
- [Vercel BotID Documentation][vercel-botid] — edge-level bot detection, GA June 2025

[pokerstars-bot-purge]: https://www.pokerstars.com/poker/information/bot-free/
[chess-cheat-report]: https://www.chess.com/article/view/chess-cheating-report
[pokerstars-collusion]: https://www.pokerstars.com/poker/room/security/
[majsoul-forum]: https://nga.178.com/
[lichess-policy]: https://lichess.org/page/account-closing
[upstash-ratelimit]: https://upstash.com/docs/oss/sdks/ts/ratelimit/overview
[vercel-botid]: https://vercel.com/docs/security/bot-protection
