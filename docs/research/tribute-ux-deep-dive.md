# Tribute Mechanic — UX and Implementation Deep Dive

> **Audience**: Engineer implementing the tribute phase for guandan-online server-authoritative engine.
> **Sources cited**: NUIST tournament PDF (gh.nuist.edu.cn), SEU/Dongda PDF (ddgh.seu.edu.cn), CUP PDF (cup.edu.cn), 中国掼蛋研究院《掼蛋娱乐规则》(game.xiaomi.com/viewpoint/1133127342), gameabc.com, gametea.net, ahjgxy.edu.cn. All four tournament PDFs agree on core 4-player rules; regional variance is noted explicitly.
> **Prior context**: `game-rules.md` established the rule baseline (tribute vocabulary, 4-player single/double tribute, 抗贡 condition). This document goes three levels deeper: per-mode direction matrices, edge cases, UX/animation spec, implementation hooks, and configurable room axes.

---

## 1. Rule Clarification Per Mode

### 4-Player Mode (2 teams, 2 players each)

The four-player case is the canonical form. All tournament PDFs agree on every detail.

**Outcome → tribute mode mapping:**

| Previous round result | Tribute mode | Who tributes | Who receives |
|---|---|---|---|
| Winning team positions: 1 & 2 (双下 for losers) | 双贡 (double tribute) | Both losers (positions 3 & 4) | Both winners (1 & 2) |
| Winning team positions: 1 & 3 | 单贡 (single tribute) | Loser at position 4 (末游) | Winner at position 1 (头游) |
| Winning team positions: 1 & 4 | 单贡 (single tribute) | Loser at position 4 (末游) | Winner at position 1 (头游) |
| 抗贡 triggered | No tribute | — | — |

**Key clarification — positions 1 & 3 and 1 & 4 are both "single tribute":** the 末游 (last-place player) tributes to 头游 (first-place) in both cases. The game-rules.md baseline was correct. Positions 1 & 3 means the winning team's other player is in third — the loser at third place does NOT tribute (only the 末游 does). Confirmed by: NUIST PDF "单下：末游向头游进贡"; SEU PDF "单下（就对门只有一方是最后的输方），末家向赢家进贡"; 中国掼蛋研究院 "由上副牌的下游向上游进贡".

**双下 rule (both losers at positions 3 & 4):**
- Both position-3 and position-4 players tribute their biggest non-exempt card.
- 头游 (1st place) receives the larger tribute card; their partner (2nd place, 二游) receives the smaller.
- If both tribute cards are the same rank: the rule is "贡左还右" — the player to the LEFT of 头游 (in play order, which is counter-clockwise) pays tribute left, receives return from the right. Practically: 头游 takes the tribute from their clockwise neighbor, 二游 takes the one from the other loser. Both winners return cards face-down simultaneously; both losers flip simultaneously. Source: 中国掼蛋研究院 "贡左还右" rule + CUP PDF "按顺时针方向进贡，对应还牌".
- Who leads first: the player who gave the LARGER tribute card leads first. If tribute cards are the same rank, 头游's next player in play order leads first (i.e., 头游's downstream neighbor). Source: NUIST PDF "贡牌最大者先出牌，如遇贡牌相同，则头游的下一家先出牌".

**Tournament rule on 双下 — who tributes?** All four tournament PDFs agree: BOTH 3rd and 4th place (both members of the losing team) tribute when the result is 双下 (losing team is both 3rd and 4th). There is no "only 4th place tributes in 双下" variant in any surveyed authoritative source. The NUIST PDF is unambiguous: "双下：两个末游要向两个上游（赢家）各进贡一张". 中国掼蛋研究院: "双下方两位牌手均向对方进贡".

### 6-Player Mode (2 or 3 teams)

The standard 6-player mode in guandan-scorer is **2 teams of 3 players each** (same team structure, more players). This is distinct from a 3-team variant sometimes played regionally.

**2-team, 6-player tribute (canonical):**

Positions are 1–6. The winning team is determined by who holds position 1 (头游). Tribute logic mirrors 4-player:

| Previous round result | Tribute mode | Who tributes | Who receives |
|---|---|---|---|
| Winning team holds positions 1 & 2 (双下 scenario) | 双贡 | Players at positions 5 & 6 (both losers) | Players at positions 1 & 2 |
| Winning team holds 1 + one non-last position | 单贡 | Player at position 6 (末游) | Player at position 1 (头游) |

The mechanism is the same as 4-player: 头游 takes the larger tribute; the pattern of "largest tribute card wins lead" applies. Heart-suit level card is always exempt.

**3-team, 6-player tribute (regional variant — mark as configurable):**

When 6 players form 3 teams of 2, the finishing positions determine win order across three competing pairs. This variant is NOT in the NUIST/SEU/CUP tournament PDFs (those are all 4-player events). Surveyed regional rules describe a "winning team / middle team / losing team" structure:

| Team positions | Tribute obligation |
|---|---|
| Last-place team (positions 5 & 6) | Both players tribute to 1st-place team |
| Middle team (positions 3 & 4) | No tribute obligation (played to completion without winning or losing full tribute) |
| 1st-place team (positions 1 & 2) | Receives tribute, returns cards |

Direction: position-6 tributes to position-1 (头游); position-5 tributes to position-2 (二游). Same selection rule: 头游 picks the larger, 二游 takes the smaller. Middle team plays normally from the next hand without tribute handicap.

**Recommendation**: Implement the 2-team 6-player form as the default (it is a natural extension of the 4-player rules). Gate 3-team form as a room-configurable variant. Mark clearly in the UI when 3-team mode is active.

### 8-Player Mode (4 teams of 2 players each)

This is the most variant-prone mode. No authoritative tournament PDF covers it because organized competitive Guandan is universally 4-player. The following is synthesized from community rules and regional practice.

**Canonical 8-player tribute (most common reported pattern):**

Positions 1–8. Two winning teams, two losing teams. The "tier" concept applies:

| Finishing tier | Team members' positions | Tribute status |
|---|---|---|
| Tier 1 (winners) | 1 & 2 | Receive tribute |
| Tier 2 (middle-high) | 3 & 4 | Neither tribute nor receive (neutral) |
| Tier 3 (middle-low) | 5 & 6 | Tribute to Tier 1 |
| Tier 4 (losers) | 7 & 8 | Tribute to Tier 1 |

Direction matrix:

| Tributer | Receives tribute |
|---|---|
| Position 7 (3rd末游) | Position 1 (头游) |
| Position 8 (末游) | Position 2 (二游) |
| Position 5 | Position 1 or 2 (varies by variant — see below) |
| Position 6 | Position 2 or 1 (varies by variant — see below) |

**Variant A — Tier pair tribute (most common reported):**
- The "worst-off" team (positions 7 & 8) tributes to the top team (positions 1 & 2).
- The second-worst team (positions 5 & 6) tributes to the second-best team (positions 3 & 4).
- Four tributes total. Each team pair does a double tribute internally.

**Variant B — Cross-tier tribute (some regional groups):**
- Positions 7 & 8 tribute to positions 1 & 2 only.
- Positions 5 & 6 do not tribute (middle teams are exempt both ways).
- Only two tributes total — simpler, fewer rounds of tribute ceremony.

**Variant C — Single-winner tribute (simplest, used in casual play):**
- Only position 8 (末游) tributes to position 1 (头游).
- All other positions: no tribute.
- One tribute only. Fast, low-ceremony.

**Recommendation for room creation UI**: expose "8-player tribute intensity" as a selector:
- `full` (Variant A — 4 tributes, 2 pairs)
- `top-only` (Variant B — 2 tributes, only worst team pays)
- `single` (Variant C — 1 tribute, classic fast)

Default: `top-only` (Variant B) — balances rule complexity with game pace. Mark as "configurable per room."

---

## 2. 抗贡 (Anti-Tribute) Condition

### Standard condition (all authoritative sources agree)

抗贡 (kàng gòng, tribute resistance) is triggered when the **losing side collectively holds both 大王 (Red Jokers / Big Jokers)** before the tribute exchange:

- **Two 大王 held by a single losing player**: that player — and their partner — resist. No tribute from either loser.
- **One 大王 held by each losing player** (in 双下 / double-tribute scenario): both resist. No tribute.

**Critical: the jokers must be specifically 大王 (Red Joker, 大鬼), NOT 小王 (Black Joker, 小鬼).** Sources are consistent:
- NUIST PDF: "末游任何一方或双方一共有两张大王则抗贡"
- SEU PDF: "每人各有一张大王或者一人有两张大王，可抗贡"
- 中国掼蛋研究院: "如应进贡者（下游或双下方）抓到两个大王，则不须进贡（抗贡）"
- gametea.net: "两位玩家各拿到一个大王或是其中一个人拿到了两张大王"

**One 大王 + one 小王 does NOT qualify.** The small joker is irrelevant to 抗贡. Only the two Red Jokers count. This is the single most-misunderstood rule in casual play.

### Regional variant — any two jokers (非标，casualplay only)

Some regional house rules accept "two jokers of any kind" (大王 + 小王 counting together) as the 抗贡 condition. This variant is mentioned in some older casual rule documents. It is NOT present in any tournament PDF. Mark this as a non-default room option:

```
抗贡条件: [两张大王 (standard)] / [任意双王 (casual variant)] / [关闭 (tribute always)]
```

### Single-tribute scenario edge case

When the result is single tribute (positions 1 & 3 or 1 & 4 for the winner):
- Only the 末游 is required to tribute.
- 抗贡 check applies only to the 末游.
- If the 末游 holds both 大王: 抗贡 declared, no tribute, 头游 leads.
- If the other loser (3rd place) holds both 大王: irrelevant — they were not going to tribute anyway.

### Double-tribute scenario — partial 抗贡

When the result is 双下 (both losers must tribute), the 抗贡 condition is evaluated across the losing side collectively:
- If EITHER loser holds two 大王, OR if each holds one 大王: the entire losing team resists. Neither player tributes. Source: NUIST PDF "末游任何一方或双方一共有两张大王则抗贡".
- The losing team does not need BOTH players to individually hold jokers — one player holding both 大王 is sufficient to exempt the entire losing side.

### What happens after 抗贡

After 抗贡 is declared:
- No cards are exchanged.
- 头游 (first place winner) leads the first trick of the new round. This is the key "penalty" for the losers — they lose the leading advantage that the tribute-giver normally earns.
- The 抗贡 is typically announced to all players (the server broadcasts the event) before the deal phase.

### Implementation: when does the server detect 抗贡?

The server checks 抗贡 eligibility after dealing new hands but before requesting tribute cards. The check must run on the newly-dealt hands (the losing players' current hands for the new round, not their discarded hands from the previous round). The sequence:

```
RoundEnd → Level update → Deal new hands → [Check 抗贡 condition] → TributePending or AntiTribute event
```

The 抗贡 check is deterministic: server reads the losing players' hand arrays, counts 大王 cards, evaluates the condition, and publishes the appropriate event before any client interaction is required.

---

## 3. Tribute Card Selection Rules

### What card must be tributed

The loser must tribute their **single highest-ranked non-exempt card**:
1. Exempt: heart-suit current-level card (红心级牌 / 逢人配). Cannot be tributed even if it is the highest card.
2. The card with the highest rank in the standard ordering: `大王 > 小王 > level rank > A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3 > 2`.
3. If the loser's highest non-exempt card appears in multiple copies (e.g., two black Aces), they hold multiple cards of the same rank — they must give one of them.

### Server picks vs. player picks

**The sources are split on this, reflecting casual vs. tournament practice:**

**Tournament rule — server picks deterministically (no player choice):**
- The system selects one card from the set of highest-rank non-exempt cards. When multiple cards of equal highest rank exist, the system picks by fixed priority: ♠ > ♥ > ♣ > ♦ (standard suit ordering). This removes player agency from tribute selection, speeds up the game, and eliminates ambiguity.
- No evidence in the tournament PDFs that players choose WHICH of their identical-rank cards to tribute. The rule says "最大的牌" (the biggest card), implying the system determines it. GuanDanInOffice (the most complete open-source implementation) implements auto-pick: "AI automatically tributes highest non-wild card."

**Casual rule — player picks (preserves agency, slows game):**
- Some casual groups allow the loser to choose which suit to tribute when they hold multiple cards of the same highest rank. The gameabc.com article mentions players making strategic suit choices to avoid giving opponents a straight flush setup.
- This is genuine strategic depth: if you hold ♠A and ♥A (non-wildcard ♥A since level is not A), you can choose which A is less dangerous to the winner's hand.

**Recommendation**: server picks automatically by default (tournament mode). Expose "tribute card selection" as a room option: `自动选最大 (auto-pick)` / `玩家手选 (player picks)`. Default `auto-pick` for competitive rooms; `player picks` for casual.

**Implementation note for auto-pick**: when multiple cards tie for highest rank, pick by suit priority ♠ > ♣ > ♦ > ♥ (excluding ♥ because it could be the wildcard, and even when ♥ level card is non-present, ♠ is a conventional "safer" tribute by suit). Make the priority constant and document it — players need to predict the server's behavior.

---

## 4. 还贡 (Return Tribute) — The Part Most Apps Skip

### What the winner returns

After receiving the tribute card, the winner (recipient) returns exactly one card from their hand to the tributer. Rules:
- The returned card must be **≤ 10 in rank** (10, 9, 8, 7, 6, 5, 4, 3, 2 — face value only; level cards and jokers are not "≤10" regardless of their numeric position).
- **If ALL cards in the winner's hand are above 10** (J, Q, K, A, level cards, jokers): the winner returns their **smallest card** (no cap applies — they are forced to return regardless). Source: CUP PDF "如全手牌均大于10，则还最小的牌"; same in NUIST PDF.
- The winner has full choice among their ≤10 cards. This is a meaningful strategic decision — they want to avoid helping the tributer complete strong hand combinations.

### Return card — winner's choice or restricted?

In ALL surveyed sources, 还贡 is the winner's free choice (subject to the ≤10 constraint). There is no "auto-pick" for 还贡 — the winner deliberately selects. This is where the strategic depth lives: an attentive winner picks a "dead" card that cannot help the tributer complete a bomb or straight flush.

### 还贡 UI flow

After 进贡 completes (tribute card received by winner), the 还贡 phase opens:
1. The winner sees: (a) the tribute card they received, highlighted/floating; (b) their full hand.
2. They tap any card ≤10 (or their smallest if all are > 10) to select.
3. A "Confirm Return" button completes the exchange.
4. The returned card travels (animated) back to the tributer's hand position.
5. The tribute panel dismisses; the game-start lead sequence begins.

**For 双下 / double tribute**: both winners return simultaneously (face-down), both tributers flip simultaneously. The UI must show a "waiting for partner to return" indicator when one winner has confirmed but the other has not.

**Timeout**: 15 seconds default (host-configurable). If the winner times out, the server auto-picks their lowest ≤10 card. If all cards are >10, server picks smallest card overall. The auto-pick is deterministic — same card-rank/suit priority as the tribute auto-pick.

**Time limit recommendation per room axis**: 10s / 15s / 30s. Default: 15s.

---

## 5. Tribute Phase UI/UX

### Screen architecture (per wireframe #04 in `demos/index.html`)

The current wireframe shows the correct structure:
- **Full-screen modal overlay**: darkened (0.65 opacity) + blurred (2px backdrop-filter) game table behind.
- **Centered panel** (480px wide on desktop; full-width minus padding on mobile).
- **Three-zone layout**: loser (left) → animated arrow → winner (right).
- **Countdown chip** (top-right of panel): 3s in the wireframe, but 15s is the recommended default for player-picks mode.
- **Rule explanation strip** at bottom: real-time explanation of why this specific card is being tributed. Critical for new players.

### Animation spec

**进贡 card travel (tribute card leaving loser):**
```
Duration:    450ms
Easing:      cubic-bezier(0.22, 1, 0.36, 1)  // ease-out cubic (fast start, decelerate)
Transform:   translateX(N) where N = distance from loser position to winner position
Card state:  face-DOWN during first 200ms (card was private to loser), flip to face-UP at 200ms
Hold:        800ms pause at destination before dismissing panel
```

Card flip at 200ms: implemented as two sub-animations in sequence:
- Phase 1 (0–200ms): scaleX 1 → 0 (card rotates "away")
- At 200ms: swap card face content (blank back → actual rank/suit)
- Phase 2 (200–350ms): scaleX 0 → 1 (card rotates "toward" viewer, now face-up)

**为何 face-down → face-up**: In physical Guandan, the tribute card is selected from the loser's hand (face-down to opponents). The winner flips it when received. This animation makes the rule legible without explanation.

**For multi-tribute (双下):**
```
Option A — Sequential (recommended): 
  Tribute 1 travels first (position-6 → position-1): 450ms + 800ms hold.
  Brief transition (300ms): panel updates to "tribute 2 of 2".
  Tribute 2 travels (position-5 → position-2): 450ms + 800ms hold.
  → Total ceremony: ~3s before 还贡 phase opens.

Option B — Parallel (faster, harder to read):
  Both cards travel simultaneously from their respective positions.
  → Total ceremony: ~1.3s but directional arrows overlap — harder to parse on a small phone screen.
```
**Recommendation: sequential (Option A)**. On a landscape phone (797×335 effective play area), two simultaneous card animations from opposite corners are visually confusing. Sequential with a "1/2 → 2/2" indicator is clearer. A "skip animation" button (host-controlled) reduces this to near-instant for experienced players.

**Audio cue**: a card-whoosh sound (0.5–1s, high-pitched swoosh) triggers on card departure. A soft "click" when the card lands. These are single SFX, not voice callouts. Volume follows the global SFX slider.

**抗贡 banner state** (separate from tribute panel):
```
When 抗贡 triggers, show the tribute panel in a different state:
- Title: "@饭团 / @老郭 持双大王 — 抗贡!"
- Visual: two 大王 card faces displayed side-by-side, red shield icon overlay
- Rule strip: "进贡豁免。败方持两张大王，无需进贡。头游先出牌。"
- Duration: 2.5s auto-dismiss (no user action needed — fully deterministic)
- No card animation (nothing moves)
```

### 还贡 phase visual distinction

The 还贡 phase uses the same overlay structure but with color-coded inversion:
- Panel header changes from `var(--accent)` eyebrow color to a muted `var(--ink-3)` tone (the "still in tribute" but reversed direction)
- Arrow direction reverses: winner (left) → loser (right)
- Card slot on winner's side shows the tributed card they received (now "theirs"), highlighted with a subtle glow
- Their full hand is rendered as a mini row of card backs below the panel (tapping selects a card)
- Selected card lifts with a blue ring + translateY(-8px) animation (same pattern as regular card selection)
- "Confirm Return" button activates only after a valid (≤10) card is selected

**Multi-tribute 还贡**: if two tributes occurred, both winners return simultaneously:
```
Winner A's panel activates first (same order as the tribute sequence).
Winner A selects return card + confirms.
System shows "Waiting for @二游 to return..." state.
Winner B confirms.
Both returned cards animate simultaneously back to their respective tributers.
```
OR: the server can allow both winners to select independently and trigger the "both flip simultaneously" reveal only when both have confirmed. This is more faithful to the physical game rule "还牌时，将牌面向下，两位进贡者同时亮牌." Recommend this approach.

### Multi-tribute progress indicator

When chaining sequential tributes, show `1/2` or `2/2` in the panel's top-right corner (replacing the countdown chip during the animation pause, reverting to the countdown when it's the next player's turn to interact).

---

## 6. Edge Cases

### Partial 抗贡 in double-tribute

Only one of the two 双下 losers holds 大王 (not two 大王 combined — the condition is met at the team level):

**Scenario**: Position 7 holds one 大王, Position 8 holds one 大王. Combined = two 大王 on the losing side.
**Result**: Full 抗贡. Neither player tributes. Source: NUIST "末游任何一方或双方一共有两张大王则抗贡" — "任何一方或双方" = "either player or both players together."

**Scenario**: Position 7 holds one 大王, Position 8 holds one 小王. Combined = one 大王 + one 小王.
**Result**: No 抗贡. 小王 does not count. Both players tribute normally.

**Scenario**: Position 7 holds two 大王, Position 8 holds none.
**Result**: Full 抗贡. Position 7 individually satisfies the condition, exempting both players on the losing side. Source: NUIST "任意一方...有两张大王则抗贡".

### Same-team double tribute — the "贡左还右" tiebreak

When both tribute cards are the same rank (e.g., both losers tribute ♠A):
1. 头游 must still pick one of them. The rule: pick the one from the loser to your LEFT (in counter-clockwise play order = the player immediately before you in play sequence).
2. The return card goes to the RIGHT (the other loser).
3. Source: 中国掼蛋研究院 English translation: "If the Tributes are ranked the same, the Third and the Dweller pay their Tributes to the Left Hand, the Banker and the Follower return their cards face down to the Right Hand."

Implementation: the server knows seat positions. When two tribute cards are equal rank, the server assigns: player at seat `(头游_seat - 1) mod 4` sends tribute to 头游; player at seat `(头游_seat - 2) mod 4` sends to 二游. "Left" in counter-clockwise play = the next player in turn order. This is deterministic — no client choice required.

**SEU PDF variant**: "进贡的牌大小相同时，赢家可以选择花色" — the winner may choose WHICH suit to take when ranks are equal. This differs from 中国掼蛋研究院's automatic "贡左还右" rule. Implement as a room option: `同大贡左还右 (auto)` / `同大头游选花色 (winner picks suit)`. Default: `auto`.

### Disconnect during tribute

**Loser disconnects before selecting their tribute card (player-picks mode)**:
- Server waits up to 30 seconds (the disconnect grace period from `realtime-sync-deep-dive.md`).
- If no reconnect: server auto-picks the tribute card (highest non-exempt, by suit priority ♠ > ♣ > ♦ > ♥) and the tribute completes without the player.
- Bot-fill can take over if reconnect does not happen within 30s.

**Winner disconnects before returning a card**:
- Server waits up to the 还贡 timeout (15s default). If the winner does not return within timeout, server auto-picks their lowest ≤10 card.
- If all winner's cards are >10, server picks their smallest card.

**All disconnects during the ceremony's animation phase** (no action required from players):
- The server completes the tribute ceremony deterministically. When clients reconnect, they receive a `SnapshotEvent` or `StateResyncEvent` that reflects post-tribute state. No re-animation on reconnect — the snapshot is sufficient.

### Bot tribute

AI players in bot-fill mode handle tribute automatically:
- **进贡**: bot auto-picks highest non-exempt card (same logic as auto-pick mode, no delay).
- **还贡**: bot picks the card most likely to be "dead" for the tributer. Simple heuristic: pick the lowest ≤10 card. Advanced heuristic: avoid completing the tributer's likely hand type (out of scope for v1 — use simple lowest-card for all difficulty tiers during tribute phase).
- **Animation**: the UI still plays the full card travel animation even for bot tribute (for human spectators and partners). The bot's "selection" happens instantly server-side; the client-side animation is purely cosmetic.

### Replay tribute later

When a round replay export is implemented, the tribute phase must be replayable:
- The `TributePending` and `TributeResolved` events in the event log contain all data needed for replay.
- Animation should be re-triggerable from the `TributeResolved` event payload: `{ from, to, tributeCard, returnCard }`.
- No separate storage needed beyond the event log.

### 抗贡 during 还贡 (impossible — clarification)

抗贡 is declared BEFORE any cards move. Once tribute begins (even if 还贡 hasn't happened yet), 抗贡 is no longer relevant. The 抗贡 window is exactly: after dealing new hands, before any tribute card is selected. There is no mid-tribute 抗贡.

---

## 7. Configurable Rule Axes for Room Creation

The following tribute-specific axes should be exposed in the room creation screen:

| Axis | Default | Options | Notes |
|---|---|---|---|
| `antiTributeCondition` | `dual_big_joker` | `dual_big_joker` / `any_dual_joker` / `disabled` | `dual_big_joker` = 两张大王 only (tournament standard). `any_dual_joker` = 大王+小王 counts. `disabled` = 抗贡 never triggers. |
| `returnCardCap` | `rank_10` | `rank_10` / `rank_jack` / `none` | `rank_10` = ≤10 (all tournament PDFs). `rank_jack` = ≤J (some regional casual). `none` = any card (fully open). |
| `tributeSelection` | `auto_pick` | `auto_pick` / `player_picks` | `auto_pick` = server deterministic. `player_picks` = loser selects. |
| `returnSelection` | `player_picks` | `player_picks` / `auto_pick_lowest` | `player_picks` is the canonical rule. `auto_pick_lowest` for speed/bots. |
| `returnTimeLimit` | `15` | `10` / `15` / `30` (seconds) | Applied to 还贡 phase only. Tribute selection timeout is same value. |
| `sameRankTiebreak` | `auto_left_right` | `auto_left_right` / `winner_picks_suit` | `auto_left_right` = 贡左还右 (中国掼蛋研究院). `winner_picks_suit` = SEU variant. |
| `mode8TributeDepth` | `top_only` | `full` / `top_only` / `single` | 8-player only. `full` = 4 tributes (two pairs). `top_only` = 2 tributes (worst team only). `single` = 1 tribute (末游 → 头游). |
| `tributeEnabled` | `true` | `true` / `false` | Master toggle. `false` disables tribute entirely for casual speed play. |
| `animationSpeed` | `normal` | `normal` / `fast` / `skip` | Host-scoped. `skip` = instant ceremony (for replay or experienced players). |

**TypeScript type for room config tribute section:**

```typescript
type TributeConfig = {
  antiTributeCondition: 'dual_big_joker' | 'any_dual_joker' | 'disabled';
  returnCardCap: 'rank_10' | 'rank_jack' | 'none';
  tributeSelection: 'auto_pick' | 'player_picks';
  returnSelection: 'player_picks' | 'auto_pick_lowest';
  returnTimeLimitSeconds: 10 | 15 | 30;
  sameRankTiebreak: 'auto_left_right' | 'winner_picks_suit';
  mode8TributeDepth: 'full' | 'top_only' | 'single';
  tributeEnabled: boolean;
};
```

---

## 8. Implementation Hooks for the Stack

### Server module: `lib/game/tribute.ts`

Responsibilities:
1. `computeTributeMode(previousRoundResult, config)` — determine: `none | single | double | anti_tribute`.
2. `checkAntiTribute(losingPlayersHands, config)` — evaluate 抗贡 condition.
3. `autoPickTributeCard(hand, levelRank)` — deterministic highest non-exempt card.
4. `autoPickReturnCard(hand, config)` — deterministic lowest ≤cap card.
5. `resolveTiebreak(tributeCards, seatingOrder, headYouSeat, config)` — assign which tribute goes to which winner when same rank.
6. `applyTribute(gameState, tributeCard, returnCard, from, to)` — mutate game state (move cards between hands).
7. `validatePlayerTributeCard(selectedCard, hand, levelRank)` — validate player-picked tribute card is legal.
8. `validatePlayerReturnCard(selectedCard, hand, config)` — validate player-picked return card is legal.

### Message flow (matching `realtime-sync-deep-dive.md` MessageType enum)

```
Server-side sequence:
  RoundEndEvent (published)
  → compute level upgrade
  → deal new hands
  → checkAntiTribute()
  IF anti_tribute:
    → publish TributePendingEvent { direction: "anti_tribute", obligations: [] }
    → publish TurnAdvancedEvent (head_you leads)
    → done
  ELSE:
    → compute tribute obligations (single | double)
    IF tributeSelection === 'auto_pick':
      → autoPickTributeCard() for each obligation
      → publish TributePendingEvent { direction, obligations, yourOwedCard? }
      → publish TributeCompletedEvent (进贡 side done)
      → open 还贡 phase (see below)
    ELSE: (player_picks)
      → publish TributeRequiredEvent (private event) to each loser
      → wait for POST /api/game/[room]/move { kind: "tribute_select", targetCard }
      → validate, apply, track which obligations are fulfilled
      → when all obligations fulfilled: publish TributeCompletedEvent
      → open 还贡 phase

  还贡 phase:
    IF returnSelection === 'auto_pick_lowest':
      → autoPickReturnCard() for each winner
      → apply exchanges
      → publish TributeResolvedEvent
    ELSE: (player_picks)
      → publish ReturnRequiredEvent (private event) to each winner
      → set return timer (returnTimeLimitSeconds)
      → wait for POST { kind: "tribute_return", targetCard }
      → timeout: auto-pick
      → when all returns fulfilled: publish TributeResolvedEvent
  
  → publish TurnAdvancedEvent (tribute-giver leads, or head_you if anti_tribute)
  → deal-ready signal → game resumes
```

**New event types needed (additions to the MessageType enum in `realtime-sync-deep-dive.md`):**

```typescript
// Additions to ServerEvent union:
| TributeRequiredEvent    // private: you must tribute a card
| ReturnRequiredEvent     // private: you must return a card
| TributeCompletedEvent   // public: 进贡 phase done, 还贡 phase starting
| TributeResolvedEvent    // public: full tribute ceremony complete
| AntiTributeEvent        // public: 抗贡 declared, no cards exchanged

type TributeRequiredEvent = {
  type: "tribute_required";
  version: number;
  to: PlayerId;                  // whom you must tribute to
  autoPickCard?: CardId;         // populated if tributeSelection === 'auto_pick'
  timeLimitSeconds: number;
};

type ReturnRequiredEvent = {
  type: "return_required";
  version: number;
  tributeCardReceived: CardId;   // the card you just got (to show in UI)
  returnCap: 'rank_10' | 'rank_jack' | 'none';
  timeLimitSeconds: number;
};

type TributeCompletedEvent = {
  type: "tribute_completed";
  version: number;
  exchanges: { from: PlayerId; to: PlayerId; card: CardId }[];  // 进贡 cards
  // NOTE: 还贡 cards NOT included here — they are in TributeResolvedEvent
};

type TributeResolvedEvent = {
  type: "tribute_resolved";
  version: number;
  tributeExchanges: { from: PlayerId; to: PlayerId; tributeCard: CardId; returnCard: CardId }[];
  firstLeader: PlayerId;  // who leads the first trick (tribute-giver or head_you for 抗贡)
};

type AntiTributeEvent = {
  type: "anti_tribute";
  version: number;
  declaredBy: PlayerId[];  // which losing player(s) triggered anti-tribute
  jokerCards: CardId[];    // the two 大王 cards (shown in UI banner)
  firstLeader: PlayerId;   // head_you (winner) leads after anti-tribute
};
```

**New command type (addition to MoveCommand union):**

```typescript
// Addition to MoveCommand:
| { kind: "tribute_return"; targetCard: CardId; fromVersion: number }
// (tribute_select already defined in realtime-sync-deep-dive.md)
```

### File structure

```
lib/
  game/
    tribute.ts          ← new: all tribute logic (computeMode, pick, validate, apply)
    tribute.test.ts     ← new: unit tests for every edge case in this document
api/
  game/
    [room]/
      move.ts           ← existing: add 'tribute_select' and 'tribute_return' handlers
```

No new API route needed — tribute commands go through the existing `POST /api/game/[room]/move` endpoint, using the `kind` discriminator.

---

## 9. UI Annotations and Screenshot Suggestions

### What the current wireframe #04 (`demos/index.html`) has right

- Full-screen veil overlay with blur + darkness: correct.
- Centered tribute panel with loser → arrow → winner layout: correct.
- Countdown chip in the top-right: correct.
- Rule explanation strip at the bottom: correct and essential.
- Card travel direction: correct (loser left, winner right in the current wireframe — in actual play this depends on seating, but the wireframe captures the symbolic direction).

### What should be added or refined

**1. 抗贡 banner state (missing from wireframe #04)**

Add a second variant of the tribute panel for when 抗贡 triggers:
```
Panel variant: anti-tribute
  - Eyebrow text (mono, accent color): "第 6 局 · 抗贡"
  - Title: "@饭团 / @老郭 持双大王 — 抗贡跳过"
  - Center visual: two 大王 card faces side-by-side (no arrow, no card travel)
  - Rule strip: "败方合持两张大王，本局豁免进贡。头游 @阿祥 先出牌。"
  - Auto-dismiss: 2.5s (no user action)
  - No countdown chip (no timer needed, fully automatic)
```

**2. Multi-tribute progress indicator (missing)**

When chaining double tributes sequentially, the panel header should show:
```
"@饭团 进贡 一张大牌 给 @阿祥  [1/2]"
"@老郭 进贡 一张大牌 给 @泉酱  [2/2]"
```
The `[1/2]` chip uses `var(--ink-3)` mono text, positioned beside the countdown chip. It's informational, not interactive.

**3. 还贡 phase visual differentiation**

The wireframe currently shows only the 进贡 phase. The 还贡 phase needs a distinct visual state:
```
Eyebrow text: "第 6 局 · 还贡"  (same mono accent style)
Title: "@阿祥 还贡 一张 ≤10 的牌 给 @饭团"
Arrow direction: REVERSED — winner (left) → loser (right) 
Center: winner's received tribute card shown prominently (glowing, floating)
         + winner's selectable hand (mini cards, only ≤10 highlighted, >10 dimmed)
Rule strip: "@阿祥 可以从手中 ≤10 的牌中选择一张还给 @饭团。倒计时 15s。"
```

The key UX signal that distinguishes 还贡 from 进贡:
- The arrow reverses direction.
- The title changes from "进贡" to "还贡".
- Cards above 10 in the winner's hand render dimmed/disabled (non-tappable).
- The received tribute card is shown above the winner's hand as a "new card" (not yet integrated into their hand).

**4. Post-tribute transition**

After `TributeResolvedEvent` arrives:
- The tribute panel fades out (200ms opacity 0).
- The card that was tributed appears "inserted" into the winner's hand representation with a brief highlight.
- The return card appears "inserted" into the tributer's hand representation.
- A `TurnAdvancedEvent` then announces who leads first, with their avatar pulsing to indicate their turn.

---

## Summary: Key Decisions for Implementation

| Decision | Canonical choice | Rationale |
|---|---|---|
| 4-player 双下: who tributes? | BOTH position-3 and position-4 | All four tournament PDFs; no "4th only" variant exists in authoritative sources |
| 抗贡 joker requirement | Only 大王 (Red Joker) count | All tournament PDFs explicit; 小王 irrelevant |
| 抗贡 scope in 双下 | Team-wide (either loser's jokers exempt both) | NUIST "任何一方或双方" |
| 贡牌selection | `auto_pick` by default | Tournament standard; speeds play; player-picks available as room option |
| 还贡 selection | Always player's choice | Canonical rule; strategic depth for winners |
| 还贡 timeout | 15s default, server auto-picks on timeout | Prevents deadlock |
| Same-rank tiebreak | 贡左还右 (auto left-right) | 中国掼蛋研究院 canonical; SEU suit-choice as room option |
| 6-player default | 2-team extension of 4-player rules | Authoritative; 3-team variant is room-configurable |
| 8-player default tribute depth | `top_only` (worst team tributes to best team) | Balance between complexity and pace |
| 抗贡 detection timing | After deal, before tribute phase starts | Server-side, deterministic; no client interaction needed |
| Animation: single vs parallel multi-tribute | Sequential | Clearer on small landscape phone; skip option for experienced players |
