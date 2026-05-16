# Guandan (掼蛋) — Complete Rules Reference

> **Audience:** Senior engineer implementing a server-authoritative card-game engine.
> **Priority of sources:** (1) `hash-panda/guandan-guide` World 2025 rule engine (TypeScript) — highest technical fidelity; (2) `../guandan-scorer/src/game/` — working upgrade/A-level logic; (3) Official Chinese tournament PDFs (NUIST, SEU, CUP rulebooks); (4) 中国掼蛋研究院《掼蛋娱乐规则》publication.
> Every claim is attributed. Ambiguous regional variants are noted explicitly.

---

## Cards & deck (牌与牌副)

| Property | Value |
|---|---|
| Decks | 2 × standard 54-card deck (including jokers) |
| Total cards | 108 |
| Per player (4-player) | 27 |
| Per player (6-player) | 18 |
| Per player (8-player) | 13 (108 ÷ 8 = 13.5 — see note) |
| Suits | ♠ Spades (黑桃), ♥ Hearts (红桃), ♦ Diamonds (方片), ♣ Clubs (梅花) |
| Rank range | 2 (lowest natural) through A (highest natural), then Small Joker (小王/BJ), Big Joker (大王/RJ) |

**Jokers.** Each deck contains one Small Joker (black/white printed, 小王) and one Red Joker (colored, 大王). With 2 decks there are exactly 2 of each.

**8-player hand size note.** 108 / 8 = 13.5, which is not an integer. In practice, 8-player mode distributes 13 cards to all 8 players (104 cards dealt) and either burns the remaining 4 cards face-down or uses a house rule variant. The `guandan-scorer` codebase does not deal cards itself — it only records finishing positions — so this detail is unconfirmed from that source. Competitive rulesets typically specify 108 cards among 8 players with 13 per player and 4 cards left aside. **Implement as configurable.**

**Deck representation** (from `guandan-guide/src/rules/cards.ts`):

```typescript
type Suit = 'spades' | 'hearts' | 'clubs' | 'diamonds' | 'joker';
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
type JokerRank = 'BJ' | 'RJ';  // BJ = Small Joker, RJ = Big Joker (Red)
```

Each card carries a `deck: 1 | 2` field to distinguish the two copies of identical cards.

---

## Levels (级牌 / 升级)

Teams start at rank **2** and advance toward **A**. The sequence (13 steps):

```
2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → J → Q → K → A
```

Implementation in `guandan-scorer/src/game/calculator.js` (line 124):

```javascript
export function nextLevel(currentLevel, increment) {
  const LEVELS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const currentIndex = Math.max(0, LEVELS.indexOf(currentLevel));
  const newIndex = Math.min(LEVELS.length - 1, currentIndex + increment);
  return LEVELS[newIndex];
}
```

The function **clamps** at `'A'` — a team cannot advance past A via a naive level increment; A-level win conditions are handled separately (see [A-level rules](#a-level-rules-a级规则)).

### Level rank (级牌)

The **current level rank** is the rank equal to the current playing level. All four suits of that rank are level cards. Their strength in hand-ranking order:

```
Big Joker (大王) > Small Joker (小王) > Level-rank cards (级牌) > A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3 > 2
```

When playing level-5, for example: `大王 > 小王 > 5 > A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 4 > 3 > 2`.

Level-rank cards **can participate in sequential hand types** (straights, three-pair runs, two-triple runs) by inserting at their natural numeric position. For example, playing level-5: a 5 may fill the 5-slot in a 3-4-5-6-7 straight.

### Heart-suit level card (红心级牌 / 逢人配 — wildcard)

The ♥ card of the current level rank is a universal wildcard (逢人配, literally "meets anyone"). It can substitute for **any non-joker card** to complete a valid hand type.

**Rules for wildcard use (from 中国掼蛋研究院 publication and guandan-guide):**

1. When played as a wildcard, the player must verbally declare what rank/suit it stands for at time of play.
2. Default declaration rule: if the wildcard can form multiple valid hands, it defaults to the **largest possible hand**. The player must explicitly state if choosing a smaller interpretation (ref: 中国掼蛋研究院).
3. Two ♥ level-rank cards exist (one per deck). Both are wildcards. They can be used together.
4. A wildcard **cannot substitute for Big Joker or Small Joker** — it can only become a suit card.
5. A wildcard played as a single card counts as the level-rank value (not a joker). It cannot be declared as a joker.
6. Wildcards used in a bomb do contribute to that bomb. Example: if playing level-5, `5♥ + 5♠ + 5♣ + 5♦` is a valid 4-card bomb of rank 5, with one or both 5♥ acting as wildcard for the suit slot they fill — but the bomb rank is still 5, not boosted.

**Implementation hook:** `guandan-guide/src/rules/cards.ts` line `isWildcard`:

```typescript
export function isWildcard(card: Card, levelRank: LevelRank): boolean {
  return card.suit === 'hearts' && card.rank === levelRank;
}
```

**Not implemented in guandan-scorer** — scorer does not deal or track individual cards.

---

## Card types (牌型)

Ten valid hand types. A play must match the type of the previous play (same kind + same card count) unless it is a bomb (bombs beat any non-bomb). Joker bomb is special-cased.

| # | Type (Chinese) | Type (English) | Count | Pattern | Rank comparison |
|---|---|---|---|---|---|
| 1 | 单张 (dān zhāng) | Single | 1 | Any single card | By card rank |
| 2 | 对子 (duì zi) | Pair | 2 | Two cards of identical rank | By rank |
| 3 | 三张 / 三同张 (sān zhāng) | Triple | 3 | Three cards of identical rank | By rank |
| 4 | 三带二 (sān dài èr) | Full house | 5 | Triple + Pair | By triple rank only; pair rank is irrelevant |
| 5 | 三连对 (sān lián duì) | Three-pair run (钢板?) | 6 | Three consecutive pairs | By rank of highest pair |
| 6 | 钢板 / 二连三 (gāng bǎn) | Two-triple run | 6 | Two consecutive triples | By rank of higher triple |
| 7 | 顺子 (shùn zi) | Straight | 5 | Five consecutive single cards (exact 5; not more) | By rank of highest card |
| 8 | 同花顺 (tóng huā shùn) | Straight flush / Rocket (火箭) | 5 | Five consecutive cards of same suit | Beats 4- and 5-card bombs; loses to 6-card+ bomb (see Bomb hierarchy) |
| 9 | 炸弹 (zhà dàn) | Bomb | 4–8 | 4 or more cards of identical rank | More cards wins; same count → higher rank wins |
| 10 | 天王炸 / 四大天王 (tiān wáng zhà) | Joker bomb | 4 | All four jokers (2× BJ + 2× RJ) | Beats everything |

### Key distinctions

**三连对 vs 钢板:** These are two different 6-card types that are sometimes confused.
- 三连对 (three-pair run): `334455`, `QQKKAA` — three *pairs* of consecutive ranks. Minimum 3 pairs; exactly 3 (cannot extend to 4 pairs). Pairs of A can wrap to act as 1 (A-2-3 three-pair run is valid: `AA2233`).
- 钢板 / 二连三 (two-triple run): `333444`, `AAAKK` is invalid (must be 2 triples exactly) — two *triples* of consecutive ranks. Exactly 2 groups; cannot extend to 3.

These are distinct hand types and **cannot beat each other** — a 三连对 cannot be played to beat a 钢板 or vice versa. Source: guandan-guide `patterns.ts` defines `threePairs` and `twoTriples` as separate `PatternKind` values; the `compareHands` function requires `challenger.kind === target.kind`.

**Regional note:** Some groups use "钢板" to mean 三连对 (the 3-pair run), not the 2-triple run. The World 2025 rules (guandan-guide, 中国掼蛋研究院 publication) define 钢板/二连三 as the 2-triple run. This document adopts that definition. If your room supports alternative naming, expose it as a config flag.

**Straight length is fixed at 5.** You cannot play a 6- or 7-card straight. Source: all tournament PDFs — "五张连续单牌，不可超过五张".

**Three-pair run is fixed at 3 pairs (6 cards).** Source: tournament PDFs — "三对的连续对牌，不可超过3对".

**Joker pairs.** Two Small Jokers form a valid pair. Two Big Jokers form a valid pair. (One BJ + one RJ is a valid pair only in some regional rules — treat as configurable. The World 2025 rules from 中国掼蛋研究院 permit joker pairs but not a mixed BJ+RJ pair as anything other than a lead in non-bomb context.)

**A as 1 (A-lo) in sequences.** A can function as rank 1 when participating in a straight, three-pair run, or two-triple run. Valid examples: `A2345` (straight), `AA2233` (three-pair run). Source: `guandan-guide/src/rules/cards.ts` — `NATURAL_SEQUENCE` includes A at both index 0 and index 13, enabling wrap-around windows.

---

## Bomb hierarchy (炸弹等级)

From weakest to strongest. Any bomb beats any non-bomb regardless of rank.

| Power tier | Hand type | Card count | Condition |
|---|---|---|---|
| 1 (weakest bomb) | 炸弹 (4-card) | 4 | Four of same rank |
| 2 | 炸弹 (5-card) | 5 | Five of same rank |
| 3 | 同花顺 (straight flush) | 5 | Five consecutive cards, same suit |
| 4 | 炸弹 (6-card) | 6 | Six of same rank |
| 5 | 炸弹 (7-card) | 7 | Seven of same rank |
| 6 | 炸弹 (8-card) | 8 | Eight of same rank |
| 7 (strongest) | 天王炸 / 四大天王 | 4 (2×BJ + 2×RJ) | All four jokers |

**Straight flush position:** sits between the 5-card same-rank bomb and the 6-card bomb. This is the standard position cited by:
- `guandan-guide/src/rules/patterns.ts` `bombPower()` function:
  ```typescript
  if (pattern.kind === 'bomb') return pattern.length >= 6 ? 500 + pattern.length * 20 : 100 + pattern.length * 20;
  if (pattern.kind === 'flushStraight') return 450;
  // 4-card bomb power = 180; 5-card = 200; flush straight = 450; 6-card = 620; ...
  ```
- 中国掼蛋研究院 publication: "超过5张的炸弹可以压同花顺" (6+ card bombs beat straight flush); "同花顺可压不超过5张的炸弹" (straight flush beats ≤5-card bombs).
- All tournament PDFs: "四王>六张及以上炸弹>同花顺>五张炸弹>四张炸弹>其它牌型".

**Within same tier:** higher rank wins. For bombs of same card count, the bomb with higher rank wins (e.g., five Queens beats five 7s). Rank ordering in bomb context: `大王 > 小王 > level rank > A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3 > 2`.

**Wild card in bombs.** A ♥-level wildcard can substitute for one of the rank-matched cards in a bomb. The bomb rank is the natural rank of the non-wildcard cards. E.g., with level-5 playing: `5♠ + 5♦ + 5♣ + 5♥(wildcard declared as 5♣)` = valid 4-card bomb of rank 5. The wildcard's presence does not change the bomb's rank for comparison purposes.

**Not implemented in guandan-scorer** — scorer does not track individual card hands.

---

## Hand comparison (出牌比较)

**Basic rule:** A play must match the previous play's **type AND card count** AND exceed its **rank strength**, OR it must be a bomb.

**Formal algorithm:**

```
function canBeat(challenger, target):
  if challenger.isBomb:
    if target.isBomb:
      compare by bombPower tier first, then by rankValue within tier
    else:
      challenger always wins
  else:
    if target.isBomb:
      challenger always loses
    if challenger.kind != target.kind OR challenger.length != target.length:
      invalid — cannot play (not a beat, not a pass; must pass instead)
    return challenger.rankValue > target.rankValue
```

Source: `guandan-guide/src/rules/patterns.ts` `compareHands()` — identical logic.

**Leading a trick:** The first player in a trick (trick leader) may play any valid hand type. All subsequent players in that trick must either beat the current best play (same type + count, higher rank; or bomb) or pass.

**Passing and re-leading:** If all other players pass, the last-play holder leads the next trick with any hand type (they are no longer constrained to same type).

**Teammate wind (接风 / 对家借风):** If a player goes out (plays their last card) and no other player beats it, the going-out player's teammate inherits the lead for the next trick. This is a structural exception: a player who has gone out cannot "pass" — they have no cards — so their partner steps in.

---

## Tribute (进贡 / 还贡)

Starting from the **second hand** in a session (not the first), losers must tribute cards to winners before dealing begins.

### Vocabulary

| Term | Meaning |
|---|---|
| 头游 (tóu yóu) | 1st place finisher |
| 二游 (èr yóu) | 2nd place finisher |
| 三游 (sān yóu) | 3rd place finisher |
| 末游 (mò yóu) | Last place finisher |
| 双下 (shuāng xià) | Both losers finish last (positions 3+4 or equivalent) — i.e., winning team took positions 1 & 2 |
| 单下 (dān xià) | One loser finishes last |
| 进贡 (jìn gòng) | Tribute: loser gives card to winner |
| 还贡 / 回贡 (huán gòng) | Return tribute: winner gives card back |
| 抗贡 (kàng gòng) | Resist tribute: loser holds both red jokers, tribute is waived |

### Single tribute (单下 / 单贡)

When the winning team has one player at position 3 and the other at position 4 from the same team — i.e., they did NOT both finish before all opponents — this results in a single tribute.

More precisely: single tribute occurs when the result is positions (1,3) or (1,4) for the winning team.

- The **末游** (last-place player) tributes their **single highest card** to the **头游** (1st place).
- 红心级牌 (heart-suit level card / wildcard) is **exempt from tribute** — the loser may not tribute it.
- The 头游 **selects which card they keep** (if tribute is a duplicate of something they have, or if there's choice).
- 头游 **returns one card** (还贡) of their choosing, which must be **≤ 10 in rank** (10 and below, inclusive). If all cards in the winner's hand are above 10 (i.e., J, Q, K, A, level cards, jokers), they return their **smallest** card.
- After exchange: the 末游 (who tributed) **leads the first trick**.

### Double tribute (双下 / 双贡)

When the winning team has both players finish before both opponents — i.e., winning team positions are (1,2):

- **Both** losing players tribute their highest card (心级牌 exempt) to the two winning players.
- 头游 selects the **larger** of the two tribute cards; 二游 takes the smaller.
- If both tributes are the same rank, 头游 takes by suit preference or by the 头游's choice (sources vary; implement as: clockwise-next from 头游 gets the tie-broken card).
- Both winners **return one card each** (≤ 10 in rank; or smallest if all > 10), **face-down simultaneously**, then both tributers reveal simultaneously.
- **First trick leader:** the player who tributed to 头游 (the 末游) leads. If their tribute card was larger than the other tribute, they lead; if equal rank, 头游's next clockwise player leads. (Source: NUIST tournament PDF, SEU tournament PDF.)

### 抗贡 (kàng gòng — tribute resistance)

The loser(s) may resist tribute if **the losing side collectively holds both red jokers (大王)** before tribute exchange:

- If **one losing player holds both** 大王: they resist alone; no tribute from either loser.
- If **each losing player holds one** 大王 (double-down scenario): both resist; no tribute.
- In single-down scenario: if the 末游 holds 2 大王 (or any combination of two jokers as ≥2 big jokers — clarification: must be specifically **两张大王**, both red jokers; holding one 大王 + one 小王 does not qualify): they resist.

**When 抗贡 occurs:** No tribute cards exchanged. The 头游 leads the first trick (winning team retains leading advantage).

Source: Baidu Baike official rules, NUIST tournament PDF, SEU tournament PDF, gameabc.com (all consistent).

### Tribute exempt card

Heart-suit level-rank card (红心级牌 / 逢人配) is exempt from tribute. The loser may not select it as their tribute card even if it is their highest-ranked card. In that case they tribute their **second highest** non-exempt card. Source: all tournament PDFs — "红桃主牌除外".

### 6-player and 8-player tribute direction

The guandan-scorer codebase does not implement tribute for 6/8-player modes. From the 中国掼蛋研究院 and tournament rulebooks, 4-player tribute rules are well-specified; 6/8-player tribute rules vary significantly by regional convention. **Implement tribute for 4-player first; mark 6/8-player tribute as configurable/not-implemented.**

---

## Round end & level progression (升级规则)

### 4-player mode

The winning team is the team whose **头游** (1st-place finisher) belongs to. A round ends when three players have gone out (the 4th player's position is determined automatically). If both players from the same team finish before both opponents, the round ends immediately at the 2nd finisher (no need for the 3rd to finish).

| Winning team placement | Upgrade amount |
|---|---|
| Positions 1 & 2 (双上 / 双下 for losers) | +3 levels |
| Positions 1 & 3 | +2 levels |
| Positions 1 & 4 (末游 is 对家 of 头游) | +1 level |

These are hardcoded defaults in `guandan-scorer/src/core/config.js` (lines 23–26):

```javascript
c4: {
  '1,2': 3,  // Positions 1,2 = upgrade 3 levels
  '1,3': 2,  // Positions 1,3 = upgrade 2 levels
  '1,4': 1   // Positions 1,4 = upgrade 1 level
}
```

The **must-have-first-place** rule (must1): the winning team must include the 1st-place finisher to earn any upgrade. If neither member of a team finishes 1st, upgrade = 0. In 4-player mode this is guaranteed (someone finishes 1st), but in 6/8-player it matters.

### 6-player mode

Three teams of 2 players each. Finishing positions: 1–6. Upgrade is calculated from **point score differential**.

Point values per position (from `guandan-scorer/src/core/config.js` line 35):

```javascript
p6: { 1: 5, 2: 4, 3: 3, 4: 3, 5: 1, 6: 0 }
```

For the winning team (the team with 1st place): sum their two position-point values. The opposing team scores the remaining points. Compute `diff = our_score - opp_score`.

Upgrade thresholds (default values, `config.js` line 31):

```javascript
t6: { g3: 7, g2: 4, g1: 1 }
// diff >= 7 → +3 levels
// diff >= 4 → +2 levels
// diff >= 1 → +1 level
// diff < 1  → 0 levels (only possible if must1 violated)
```

The third team's players fill remaining positions and do not advance or regress.

**must1 rule in 6-player:** if the winning team does not hold position 1, upgrade = 0 regardless of score.

Source: `guandan-scorer/src/game/calculator.js` lines 162–178 (`calculateUpgrade` mode '6' branch).

### 8-player mode

Four teams of 2 players each. Finishing positions: 1–8.

**Special rule — Sweep bonus:** If one team holds ALL of positions 1, 2, 3, 4 (all four players from two teams finishing before all four players of the other two teams), that team earns **+4 levels** (special case, overrides normal calculation). Source: `guandan-scorer/src/game/calculator.js` lines 185–194:

```javascript
if (ranks[0]===1 && ranks[1]===2 && ranks[2]===3 && ranks[3]===4) {
  upgrade = 4; // sweep bonus
}
```

Normal upgrade calculation (non-sweep): same point-differential formula as 6-player with 8-player-specific weights.

Point values per position (from `config.js` line 42):

```javascript
p8: { 1: 7, 2: 6, 3: 5, 4: 4, 5: 3, 6: 2, 7: 1, 8: 0 }
```

Upgrade thresholds:

```javascript
t8: { g3: 11, g2: 5, g1: 0 }
// diff >= 11 → +3 levels
// diff >=  5 → +2 levels
// diff >=  0 → +1 level
```

Note: the `resetToDefaults` method in `config.js` line 277 shows `g2: 6, g1: 1` (slightly different from the live default on line 42 which shows `g2: 5, g1: 0`). The live config object (lines 38–45) is the active default; treat those values as canonical.

Source: `guandan-scorer/src/game/calculator.js` lines 197–220.

---

## A-level rules (A级规则)

### When does A-level apply?

When a team's level reaches `'A'`, special win-condition rules activate. A team at A-level is trying to "pass A" (过A) and win the match. Winning at A without satisfying the pass condition does not advance past A — the team stays at A and plays again.

**Pass condition (both modes):** The winning team must include the 头游 (1st place), AND no member of the winning team can hold the **末游** (last place). Equivalently: the team wins a round where their best finisher is 1st and their worst finisher is NOT last.

### Strict mode (严格模式 / strictA = true)

In strict mode, an A-level team **must win during their own A-level round** to pass:

- The round's "owner" (roundOwner) is the team that last won and set the round level. Only when `roundLevel === 'A'` AND `roundOwner === aTeam` does a clean win count as match victory.
- If the A-level team wins cleanly but it is the **opponent's** round, they do NOT win the match. Level stays at A, round ownership transfers to the winner, play continues.

Source: `guandan-scorer/src/game/rules.js` lines 112–121:

```javascript
if (strictA && (roundLevel !== 'A' || roundOwner !== aTeam)) {
  // Does not pass — stays at A
  winnerNewLevel = state.getTeamLevel(winnerKey);
}
```

### Lenient mode (宽松模式 / strictA = false)

A clean win (1st place + no last-place on winning team) at any level, when any team is at A, counts as match victory.

### A-fail counter (A级失败 — 4-player mode only)

In 4-player mode, an A-level failure is recorded when:

1. The A-level team **wins** the round but their partner is in **last place** (末游), OR
2. The A-level team **loses** the round AND it is **their own A round** (roundOwner === aTeam).

After **3 accumulated failures** (A1 → A2 → A3), the A-level team is **demoted to level 2** and their fail counter resets to 0. The opponent's level is unaffected.

Source: `guandan-scorer/src/game/rules.js` lines 71–81:

```javascript
function recordAFail(team) {
  if (!aFailEnabled) return null;  // 6/8-player: no-op
  const current = state.getTeamAFail(team);
  const next = current + 1;
  if (next >= 3) {
    state.setTeamAFail(team, 0);  // reset on demotion
    return { count: next, demoted: true };
  }
  state.setTeamAFail(team, next);
  return { count: next, demoted: false };
}
```

### 6/8-player mode — no A-fail demotion

Since the 2026-05 rule simplification, **6-player and 8-player modes have no A-fail tracking and no demotion**. A-level teams stay at A indefinitely until they satisfy the pass condition. Source: `guandan-scorer/src/game/rules.js` lines 20–23 and lines 69–70:

```javascript
function tracksAFail(mode) {
  return mode === '4';
}
```

`guandan-scorer/docs/GAME_RULES.md` (lines 60–78) describes the rationale: 6/8 sessions are long; rubber-banding to level 2 was too punishing.

### Both-teams-at-A

When both teams reach A simultaneously, the team that wins the next round (cleanly) is evaluated as the A team. The winner's team is the one being tested. Source: `guandan-scorer/src/game/rules.js` lines 46–51:

```javascript
if (t1Level === 'A' && t2Level === 'A') {
  aTeam = winnerKey; // Both at A — winner is the A-team being evaluated
}
```

### A-level state machine (4-player)

```
State: (teamLevel, aFailCount, roundOwner, roundLevel)

Win with partner NOT last + own A round (strictA) OR lenient → PASS (match over)
Win with partner NOT last + opponent's round (strictA) → stay at A, aFail unchanged
Win with partner at LAST on own round → aFail++; if aFail==3 → demote to level 2
Lose on own A round → aFail++; if aFail==3 → demote to level 2
Lose/win on opponent's round → no aFail change
```

---

## 4 vs 6 vs 8 player modes — differences

| Property | 4-player | 6-player | 8-player |
|---|---|---|---|
| Teams | 2 (2 players each) | 2 (3 players each) | 2 (4 players each) |
| Total players | 4 | 6 | 8 |
| Cards per player | 27 | 18 | 13 (4 cards aside) |
| Finishing positions | 4 | 6 | 8 |
| Upgrade formula | Fixed table by partner position | Point-score differential (t6/p6) | Point-score differential (t8/p8) + sweep bonus |
| Sweep bonus | None | None | Positions 1-2-3-4 all same team → +4 levels |
| A-fail counter | Yes (3 strikes → reset to level 2) | No | No |
| Tribute | Single/double tribute (well-specified) | Configurable; not in scorer | Configurable; not in scorer |
| Seating (4-player) | East-South-West-North; East+West vs South+North | N/A | N/A |

### Seating order (4-player)

Play proceeds **counter-clockwise** (逆时针). Partners sit directly opposite:

```
         North (南)
West ←      ↑      → East
(西)       [↻]      (东)
         South (北)
```

East + West are one team (红/Red). South + North are the other team (蓝/Blue). Source: `guandan-guide/src/rules/flow.ts`:

```typescript
export const TEAM_BY_SEAT: Record<Seat, Team> = {
  east: 'red', west: 'red',
  south: 'blue', north: 'blue',
};
```

### Hand size — 6-player and 8-player

**6-player:** 108 / 6 = 18 cards per player exactly.

**8-player:** 108 / 8 = 13.5 — not divisible. Standard practice: 13 cards dealt to all 8 players (104 dealt), 4 remain undealt (burned or placed face-down). The scorer does not deal cards; confirm hand-size policy with your game variant.

---

## Edge cases & ambiguities

### Joker bomb mid-round

A 天王炸 (four-joker bomb) can be played at any time, including as an interrupt to an ongoing trick, overriding all other plays. It is the absolute highest hand. There is no rule that constrains when in a trick it can be played. After a 天王炸, the player who played it leads the next trick.

### Player goes out mid-trick

When a player plays their last hand (goes out) mid-trick:

- Remaining players **continue the trick** if they have cards. The going-out player simply has no more turns.
- If **all remaining players pass** and the last-card player's partner inherits lead via 接风 (teammate wind / 借风): the partner leads normally.
- If the going-out player is the **last player in a trick** and others have passed, their partner inherits lead.
- The going-out player's finishing position is recorded at the moment they go out. Later finishers in the same trick do not "retroactively" change the going-out player's position.

### Remaining players after partner goes out

If your partner goes out and you have not, you continue playing as normal. When a teammate goes out and is eligible for the "接风" (wind) inheritance:

- Only applies if **all other remaining players pass** after the gone-out player's last card.
- If any remaining player beats the last card, 接风 does not trigger.

### 报警 / 报牌 (card-count declaration)

**This rule is present in competitive/tournament play but absent from most casual rules.** When a player's remaining card count drops to 10 or fewer after playing a hand, they must declare their remaining count. Failure to declare may result in opponents demanding a re-play of the last hand.

Implementation note: The guandan-scorer does not implement 报牌. The official National Sport Bureau rule and all tournament PDFs include it. **Flag as a configurable room rule.**

Some tournament PDFs specify declaration at ≤6 cards (active declaration) and answer-on-request at ≤10 cards.

### Wildcard in a bomb — rank and comparison

A wildcard (红心级牌) completing a bomb does not change the bomb's **rank tier** for comparison. If level is 5 and you have `5♠5♦5♣5♥(wildcard)`, this is a 4-card bomb at rank 5. It beats other 4-card bombs of rank < 5 and loses to 4-card bombs of rank > 5 (level cards outrank A). A wildcard's declarable rank is the bomb's natural rank — you cannot declare it a different rank to boost the bomb.

### When both teams reach A simultaneously

Covered under [A-level rules](#a-level-rules-a级规则) — the team that wins the next round is evaluated as the A-team for that round.

### First hand of a session — no tribute

The very first hand of a session begins without tribute. From the second hand onward, tribute applies. Source: all rule references consistently state "从第二副牌开始" (starting from the second hand).

### First-hand leader selection

For the first hand: typically determined by **revealing a card at random** (cutting the deck and exposing one card; the player who holds the matching card leads first). Some variants use the player who holds a specific card (e.g., 2♥ if playing level 2). After the first hand, tribute-eligible players lead (or 头游 leads if 抗贡). Source: tournament PDFs.

---

## Custom rule axes (per-room configuration)

These are the axes genuinely contested in real-world play. All should be room-configurable.

| Axis | Option A (default/common) | Option B (variant) | Notes |
|---|---|---|---|
| **A-level strict mode** (strictA) | Strict: must win at own A round | Lenient: any clean win at A | Scorer default: strict. Major strategic difference. |
| **A-fail demotion** (aFailEnabled) | Enabled in 4-player (3 strikes → level 2) | Disabled (used in 6/8-player since 2026-05) | Mode-gated in scorer. |
| **Must have 1st place** (must1) | Required for upgrade in 6/8-player | Not required | Scorer default: true. |
| **Heart-level wildcard** (逢人配) | Enabled | Disabled (some house rules remove wildcard) | All competitive rules enable it. |
| **Sweep bonus** (8-player) | +4 levels for 1-2-3-4 sweep | Disabled | Scorer enables by default. |
| **Bomb hierarchy — straight flush position** | Between 5-card bomb and 6-card bomb | Some regions place it above 6-card bomb | World 2025 and all tournament PDFs: between 5 and 6. |
| **Tribute** (进贡/还贡) | Enabled (standard) | Disabled | Some casual games skip tribute. |
| **抗贡 trigger** | Two red jokers (大王 only) | Two jokers of any kind (BJ + RJ counts) | Competitive standard: both jokers must be 大王. |
| **报警 last-card declaration** (报牌) | Required at ≤10 cards | Disabled | Tournament: required. Casual: often skipped. |
| **三连对/钢板 included** | Both types included | Some groups play without 钢板 | World 2025 includes both. |
| **Auto-advance round** | Auto (round owner advances after result) | Manual confirmation | Scorer feature; not a game rule. |
| **Upgrade thresholds** (6/8-player) | Configurable (t6, t8 in scorer) | Regional variants exist | Scorer exposes all thresholds as config. |
| **Return card cap** (还贡 max rank) | ≤ 10 | ≤ 8 (some local rules) | Standard: ≤ 10. |
| **Time limit per move** | None (casual) | 30s lead / 30s follow (tournament) | SEU PDF: "首轮和其他轮次首发不超过60秒，跟牌不超过30秒". |

---

## Implementation hooks (cite scorer source)

For each major rule, the corresponding implementation status in `../guandan-scorer/src/game/` or a gap note.

| Rule | Scorer file/lines | Status |
|---|---|---|
| Level sequence, clamp at A | `calculator.js` lines 124–129 (`nextLevel`) | Implemented |
| 4-player upgrade table (c4) | `calculator.js` lines 151–158; `config.js` lines 23–26 | Implemented |
| 6-player upgrade (score differential, t6/p6) | `calculator.js` lines 162–178 | Implemented |
| 8-player upgrade (score differential, t8/p8) | `calculator.js` lines 183–220 | Implemented |
| 8-player sweep bonus (+4 at positions 1-2-3-4) | `calculator.js` lines 185–194 | Implemented |
| must1 requirement | `calculator.js` lines 169, 206 | Implemented |
| A-level pass condition (clean win check) | `rules.js` lines 83–126 | Implemented |
| Strict mode (own-round requirement) | `rules.js` lines 112–119 (strictA branch) | Implemented |
| Lenient mode (any A win) | `rules.js` lines 121–125 | Implemented |
| A-fail counter (4-player only) | `rules.js` lines 20–22 (`tracksAFail`), 71–81 (`recordAFail`) | Implemented |
| A-fail demotion at 3 strikes | `rules.js` lines 74–79 | Implemented |
| 6/8-player no A-fail | `rules.js` lines 20–22 (tracksAFail returns false for '6','8') | Implemented |
| Both-teams-at-A tie-break | `rules.js` lines 46–51 | Implemented |
| Round owner tracking (roundOwner, roundLevel) | `rules.js` uses `state.getRoundOwner()`, `state.getRoundLevel()` | Implemented (state layer) |
| Hand type recognition (10 types) | `guandan-guide/src/rules/patterns.ts` (`analyzeHand`) | Not in scorer; full engine in guandan-guide |
| Bomb hierarchy comparison | `guandan-guide/src/rules/patterns.ts` (`bombPower`, `compareHands`) | Not in scorer; full engine in guandan-guide |
| Wild card (逢人配) detection | `guandan-guide/src/rules/cards.ts` (`isWildcard`) | Not in scorer |
| Wild card substitution in hand analysis | `guandan-guide/src/rules/patterns.ts` (`AnalyzeContext.wildcards`) | Not in scorer |
| Tribute (进贡/还贡) logic | `guandan-guide/src/rules/flow.ts` (`tributeForMode`) — stub level | Stubbed in guandan-guide; not in scorer |
| 抗贡 trigger | Not implemented in either codebase | **Write from scratch** |
| Teammate wind (接风/借风) | Not implemented in either codebase | **Write from scratch** |
| 报牌 (card count declaration) | Not implemented in either codebase | **Write from scratch** |
| Deck generation (108 cards, 2 decks) | `guandan-guide/src/rules/cards.ts` (`generateDoubleDeck`) | In guandan-guide |
| Deal (27 cards per player, 4-player) | Not in either codebase | **Write from scratch** |
| First-hand leader selection (flip card) | Not in either codebase | **Write from scratch** |
| Seating (counter-clockwise, partner = opposite) | `guandan-guide/src/rules/flow.ts` (`TEAM_BY_SEAT`, `partnerOf`) | In guandan-guide |
| A as rank-1 in sequences | `guandan-guide/src/rules/cards.ts` (`NATURAL_SEQUENCE` wraps A at index 0 and 13) | In guandan-guide |

---

## Summary of must-write-from-scratch items

For a server-authoritative engine, these are the components absent from both codebases:

1. **Deck deal & shuffle** — generate 108 cards, shuffle, deal 27/18/13 per player.
2. **First-hand leader selection** — flip/reveal mechanism to determine who leads the first trick.
3. **Trick engine** — track current trick leader, accept plays, validate each play (type match + rank beat or bomb), handle pass, detect trick end, award next lead.
4. **接风 (teammate wind) inheritance** — detect when a going-out player's last card goes unchallenged and award lead to their partner.
5. **Tribute orchestration** — determine tribute mode (none/single/double/resist), collect tribute card from loser, return card from winner, handle 抗贡, determine post-tribute leader.
6. **报牌 (card-count declaration)** — track each player's hand size; emit mandatory declaration event when ≤10 cards remain after a play.
7. **8-player hand size edge case** — decide policy for the 4 undealt cards.
8. **6/8-player tribute direction** — which loser tributes to which winner in multi-team configurations.

Items 1–4 are core game engine. Items 5–8 are pre-round and post-round ceremonies.

The `guandan-guide` TypeScript rule engine (`src/rules/`) provides a complete, tested reference for hand-type recognition, bomb comparison, wildcard substitution, and level math. It is the recommended source to port or vendor for the card-play layer.
