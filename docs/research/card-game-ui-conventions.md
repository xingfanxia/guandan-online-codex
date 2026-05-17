# Card Game UI Conventions — Multi-Player Landscape Table Layouts

**Research date**: 2026-05-16  
**Scope**: Production UI patterns for Chinese partner card games (4P) and Texas Hold'em poker (6/8/9P)  
**Purpose**: Inform layout redesign of guandan-online S03 (4P) and S05 (8P) wireframes  
**Directive from user**: "4人 reference 斗地主, 6/8人 reference 德扑 (Texas Hold'em)"

---

## 1. Chinese Card-Game Survey (4-Player Landscape)

### 1.1 The Canonical 4-Player Layout (腾讯欢乐斗地主 / Tractor / Guandan)

This layout is a universal convention across virtually every Chinese partner card game that puts four players in two teams sitting cross-table (对家制). It has been stable since the earliest smartphone era and is used without deviation in:

- 腾讯欢乐斗地主 (4-player variant)
- JJ斗地主, 微乐斗地主
- 拖拉机 / 升级 (Tractor / Sheng Ji)
- 掼蛋 (Guandan, 4-player standard)
- 双扣 / 跑得快 variants

**The canonical layout in landscape orientation:**

```
╔══════════════════════════════════════════════════╗
║                                                  ║
║          [PARTNER avatar + hand back]            ║
║                    "对家"                         ║
║                                                  ║
║  [LEFT    ║   CENTER: TRICK AREA    ║  RIGHT     ║
║  RIVAL]   ║   (played cards, type,  ║  RIVAL]    ║
║  "上家"   ║    who played, beat it) ║  "下家"    ║
║           ║                         ║            ║
║                                                  ║
║          [MY HAND — full fan, 27 cards]          ║
║               action buttons row                 ║
╚══════════════════════════════════════════════════╝
```

**Positions:**

| Screen location | Chinese name | Relationship |
|---|---|---|
| Bottom (me) | 本家 | Self — full hand spread, action buttons |
| Top center | 对家 | Partner — back-facing cards, avatar, card count |
| Left side | 上家 (upper family) | Opponent — sideways or back cards, avatar, card count |
| Right side | 下家 (lower family) | Opponent — sideways or back cards, avatar, card count |
| Center | 出牌区 | Trick area — last played combo + type label |

**Why this layout:**

Play order in Chinese climbing games is counter-clockwise (逆时针). "上家" literally means "the player before you" — they are on your left because counter-clockwise play goes left. "下家" (the player after you) is on your right. Your "对家" (partner) is directly across. This maps the physical mahjong table model to the phone screen: you look at the table from your seat at the bottom.

A Tencent GDC case study on iPhone 4-player Doudizhu (published 2013, still cited in Chinese game dev literature) confirmed that the primary design challenge is squeezing 33 cards (landlord mode) into 74.5mm of phone width, with each card needing ~2.25mm visible gap — far below the recommended 8mm touch target. Their solution was horizontal grouping (水平分组): same-rank cards group together, with only the first card of each group needing a full touch target. The remaining cards in the group inherit the selection when the first is tapped.

**Per-seat information hierarchy:**

- **Me (bottom)**: Full face-up hand, fan spread with group separation; action buttons (出牌/不出/提示/整牌) docked below or beside hand; my level/avatar shown inline
- **Partner (top pill)**: Avatar 24–32px, handle, card count, level badge; pill/chip format to save vertical space; back-facing card stack (3–4 small cards) or just a count badge
- **Left/Right rivals**: Avatar 36–44px, handle, card count, level/rank; "行动中" (acting) indicator; back-facing card stack shown sideways
- **Center trick area**: Last combo face-up, card type label (顺子/炸弹/etc.), player attribution line, "bigger than?" guidance

**Partner pill variant (横屏空间最稀缺):**

Landscape mode starves vertical space. The dominant solution: partner "对家" is rendered as a horizontal pill at the top center (not a full-width row), freeing vertical height for the trick area and my hand. The pill contains: avatar + handle + card count + level, all on one line. This is exactly what S03 in the current wireframe already does correctly.

### 1.2 Specific App Details

**腾讯欢乐斗地主**: The dominant app with hundreds of millions of users. Uses full 3D-table aesthetic (green felt, 3D cards, character costumes), but underneath the layout is precisely the 4-seat cross pattern above. Bottom = me, full hand spread. Top = partner or "地主" badge. Left/right = opponents. Center = last played trick + landlord card pool at round start. Animated card deal cascades from center. "PASS" (不出) floats above opponent's seat when they skip.

**JJ掼蛋 / 微乐掼蛋**: Both use the same base layout. The "modern" apps use a cleaner, flatter aesthetic (less 3D felt), but the positional convention is unchanged. Card backs for opponents are shown as small overlapping rectangles (usually 3-4 mini cards stacked), not a numeric badge alone — the visual stack communicates "multiple cards" intuitively.

**6-player Guandan (六人掼蛋)**: Uses 3 teams of 2, seated alternately around the table (seats 1,3,5 = Team A; seats 2,4,6 = Team B). In the digital UI this is typically rendered as a 6-seat oval or hexagonal arrangement. The player is still at bottom, their two partners are at the ~10 o'clock and ~2 o'clock positions. The center trick area becomes larger and more prominent due to the increased card count (3 decks, 27 cards each). **This is the bridge between 4P Chinese-style and 8P poker-style layouts.**

---

## 2. Texas Hold'em Survey (6–9 Player Landscape)

### 2.1 The Universal Poker Table Convention

Every major online poker client — PokerStars, GGPoker, Zynga Poker, 888 Poker, WSOP, WPT Global, Pokio — shares a single table geometry. This is so consistent that it constitutes an industry standard:

**The oval table, hero-always-at-bottom:**

```
           ╭──────────────────╮
      P5         P4     P3
   ╭──╮     ╭──────────────╮   ╭──╮
   │P6│  ╭──│              │──╮ │P2│
   ╰──╯  │  │  FELT TABLE  │  │ ╰──╯
         │  │              │  │
   ╭──╮  │  │   POT  ·  D  │  │ ╭──╮
   │P7│  ╰──│  community   │──╯ │P1│
   ╰──╯     │    cards     │   ╰──╯
      P8  ╰──────────────╯
                 ↓
             [HERO - me]
             hand + buttons
```

**Seat numbering (PokerStars convention):**

Seat 1 is at the 1 o'clock position (top-right of the oval), numbers increase clockwise. In a 9-max table:

```
         S5
    S4        S6
S3                S7
S2                S8
    S1        S9
         HERO
```

(Hero is always displayed at the bottom-center regardless of what seat number they occupy. The server seat number rotates; the display position does not.)

**OnGame (iPoker) and most modern networks:** "Always display you in the bottom centre seat at tournament tables." This is the universal convention.

### 2.2 Seat Distribution by Player Count

**6-Max table** — 5 opponents around the arc, me at bottom:

```
         P_top
    P_upper-L   P_upper-R
P_left             P_right
         HERO
```

Clock positions: upper-left ≈ 10 o'clock, upper-right ≈ 2 o'clock, left ≈ 8 o'clock, right ≈ 4 o'clock, top ≈ 12 o'clock.

**8-Max table** — 7 opponents, denser arc:

```
    P_UL  P_top  P_UR
P_L                  P_R
    P_LL           P_LR
              HERO
```

Clock positions: UL ≈ 10:30, top ≈ 12, UR ≈ 1:30, R ≈ 3, LR ≈ 4:30, LL ≈ 7:30, L ≈ 9.

**9-Max table** — 8 opponents, same distribution with one more in the upper arc.

### 2.3 Per-Seat Information (Production Standard)

Each opponent seat node contains, in roughly this priority order:

1. **Avatar**: 36–56px circle (desktop), 24–32px (mobile). Greyed out when player is out/folded.
2. **Handle / screen name**: truncated at ~12 chars on mobile.
3. **Stack size**: chip count in big numbers, mono font. This is the highest-priority numeric — players must always know stack sizes.
4. **Bet amount**: displayed next to the seat or between seat and pot as chips slide into center.
5. **Card backs**: exactly 2 small face-down cards, slightly overlapping at ~20deg angle. Always 2, always the same back design. Size: roughly 20×30px per card on mobile.
6. **Active indicator**: Glow ring around avatar (typically gold/amber), countdown arc sweeping clockwise, or both. Time bars are critical — they prevent the game from hanging.
7. **Dealer button (D)**: small disc overlaid near the seat.
8. **Blind badges (SB/BB)**: small colored disc or text badge.

**Information that lives in the CENTER area (not per-seat):**

- Community cards (5 slots, always bottom-half of center)
- Pot total (above community cards, prominent)
- Side pot indicators (stacked if multiple)
- Last action label floats above pot: "Raise $40", "Check", "Fold", "All In"

**Action buttons for hero:**

Fixed to the bottom edge, always: Fold / Check-or-Call / Bet-or-Raise. Raise slider or chip-size selector appears inline or as popover. Bet-size presets (1/2 pot, pot, all-in) appear above the buttons row.

### 2.4 Mobile-Specific Adaptations

**GGPoker** perfected one-handed portrait-mode navigation, but their landscape (tablet/desktop) still uses the oval convention. Mobile landscape: the oval shrinks, seat nodes become smaller, font drops to ~10px, card backs to ~14×20px. The hero's action buttons expand to full-width for easy thumb reach.

**PokerStars mobile**: Supports both landscape (oval table) and portrait (new linear table). In portrait mode, opponents are stacked vertically in a list — this is a completely different paradigm and not applicable to our 8P guandan scenario.

**Zynga Poker**: Social-first aesthetic (brighter colors, bigger avatars), but the oval layout is identical. 9-seat table, hero at bottom. "Reaction bubbles" (emoji explosions) float above seats when social gestures trigger.

### 2.5 Time Bar / Countdown

Industry-standard patterns:

1. **Circular arc on avatar**: A ring around the player's avatar depletes clockwise. Most common in GGPoker, PokerStars.
2. **Linear bar under the seat info**: A horizontal bar shrinks left-to-right. Used in Zynga, 888 Poker.
3. **Color shift**: As time runs out, the bar/ring changes from green → yellow → red. Critical for "oh, I need to act NOW" signal.
4. **Time bank indicator**: A secondary smaller indicator showing reserved "time bank" seconds, distinguished by a different color (usually blue or gold).

---

## 3. Current Wireframe Diagnosis (S03 + S05)

### 3.1 S03 — 4-Player Table (DIAGNOSIS: Mostly Correct)

**What's right:**

- Partner "QQ" at top center as a pill — matches 斗地主 convention exactly.
- Left rival "FT" and right rival "LG" at sides — correct.
- My hand at bottom — correct.
- Center trick area with type label — correct.
- Action buttons docked below hand — correct.

**What's off or missing:**

- **Rival card backs not shown**: The current wireframe doesn't render a visual card stack for left/right rivals. Production apps always show 2–4 overlapping mini card backs above the rival avatar. Without this, the "how many cards does this opponent have?" question isn't answered visually. For Guandan specifically (where tracking card count is strategic), this should be fixed. Small overlapping rectangle stack at ~20px tall.
- **Partner card count in pill**: The pill shows "QQ · LV5 · 27张" — this is right, but the 27-card count should be more prominent (it's a key strategic signal). Consider making it mono-bold.
- **Active indicator**: `avatar--active` class exists but the glow treatment may be subtle. Production apps use a gold ring + pulsing animation + "行动中" label.
- **Missing: "last played" attribution line**: When someone plays a trick, a small floating label appears above their seat "QQ 出了" before the cards fly to center. This is a transition state missing from the static wireframe, but worth noting for animation spec.

**Overall: S03 is 80% correct.** It closely follows 斗地主 convention. Minor polish: rival card back stacks, bolder card count, pulsing active ring.

### 3.2 S05 — 8-Player Table (DIAGNOSIS: Fundamentally Wrong Geometry)

**The current layout:**

```
5 opponents in a horizontal top row
1 empty column left / 1 empty column right  
trick area in center
my hand at bottom
partner "integrated into my-hand-meta text"
```

**Why this is wrong:**

1. **5-in-a-row top bar is not a seating geometry** — it looks like a leaderboard, not a table. There's no spatial sense of "who is across from me," "who is to my left," or "who is my partner." This violates the fundamental promise of a table: "I know where I'm sitting relative to everyone else."

2. **Partner invisible**: Partner (@泉酱) is mentioned as metadata text in my hand row — not as a seat. In a real 8-player game, your partner matters for strategy. Hiding them in text eliminates the crucial spatial relationship.

3. **Doesn't match Texas Hold'em reference**: The user explicitly said "8人 reference 德扑." A 德扑 8-player table has opponents distributed around an OVAL, with 3–4 seats in the top arc, 2 in each mid-arc, none stacked in a flat row.

4. **No table surface**: The current S05 has no visual sense of a table. Poker apps render a felt oval that gives spatial context.

5. **Active player lost**: With 5 mini-seats in a flat row at the top, the currently-acting player (@豆豆) is indistinguishable at a glance. On a poker oval, the active seat's glow is immediately locatable.

**What a user familiar with 德扑 expects for 8P:**

- An oval/elliptical felt surface in the center
- Me at the bottom center
- 7 opponents distributed clockwise around the upper perimeter
- My partner is the opponent directly across from me (12 o'clock position), distinguishable by a team color highlight
- The center oval holds community/trick information
- Each seat has avatar + stack/card-count + name + active indicator

---

## 4. Recommended Layouts (4P / 6P / 8P)

### 4.1 4-Player Layout — Keep Current Cross Pattern

**Geometry**: Cross (+ shape), identical to 斗地主

```
         ┌──────────────────────────────────────┐
         │       [PARTNER PILL at top-center]   │
         │      avatar · @handle · LV · N张     │
         │                                      │
         │ [LEFT      [TRICK AREA - center]   RIGHT] │
         │ RIVAL]       last combo played      [RIVAL] │
         │ avatar       type + who played       avatar │
         │ N 张                                  N 张 │
         │                                      │
         │    [MY HAND — 27 cards face-up fan]  │
         │    [Fold] [Pass] [Hint] [Play]       │
         └──────────────────────────────────────┘
```

**Per-seat dimensions (iPhone 14 Pro landscape 852×393):**

- Partner pill: 280×36px, centered at top, y=44
- Left rival zone: 90×140px at left edge (x=0, y=80–220)
- Right rival zone: 90×140px at right edge (x=762, y=80–220)
- Center trick: 340×160px centered (x=256, y=80–240)
- My hand row: full width, 80px tall at bottom (y=313–393)
- Action buttons: 4-button row at y=350, 180px wide

**References**: 腾讯欢乐斗地主, 微乐掼蛋, JJ掼蛋, 拖拉机升级.

---

### 4.2 6-Player Layout — Hexagonal Oval (Bridge Between 斗地主 and 德扑)

**Geometry**: 6-seat oval. Me at bottom. Two partners at 10 o'clock and 2 o'clock positions. Two of three opponents at 8 o'clock and 4 o'clock. One opponent at 12 o'clock.

```
        ┌────────────────────────────────────┐
        │                                    │
        │   P5 ◉        ◉ P1                 │
        │ (partner 1)  (opp)    ◉ P2         │
        │                   (partner 2)      │
        │  P6 ◉           [TRICK CENTER]     │
        │ (opp)                              │
        │  P0 ◉                              │
        │ (opp)                              │
        │                 HERO               │
        └────────────────────────────────────┘
```

Wait — 6-player Guandan uses teams of 3, seated alternately (1,3,5 vs 2,4,6). So partner positions are non-adjacent:

```
     P_top-left (partner)    P_top-right (opp)
  P_left (opp)                    P_right (partner)
              ←TRICK AREA→
                  HERO
```

**Concrete 6-seat positions (ellipse on 852×393 screen):**

Using parametric ellipse (cx=426, cy=165, rx=310, ry=100), clockwise from top-left:

| Seat | Angle | X | Y | Relationship |
|---|---|---|---|---|
| TL (P_a) | 210° | 157 | 65 | Partner A |
| TR (P_b) | 150° | 695 | 65 | Opponent |
| L (P_c) | 240° | 116 | 165 | Opponent |
| R (P_d) | 120° | 736 | 165 | Partner B |
| BL (P_e) | 270° | 270 | 245 | TBD by game |
| BR (P_f) | 90° | 582 | 245 | TBD by game |

Hero (me) at y=310 center, card count = 27, team color border on my-hand-row.

**Reference**: Texas Hold'em 6-max oval, adapted with Guandan team coloring.

---

### 4.3 8-Player Layout — Three Alternatives (DETAILED)

The user flagged S05 as "awkward." Here are three alternative approaches with trade-off analysis.

---

#### Option A: Poker Oval (Recommended)

**Geometry**: Elliptical table with oval felt surface. Me at bottom center. 7 opponents distributed clockwise around the perimeter. Partner identifiable by team-color ring.

```
         P5 ◉   P4 ◉   P3 ◉
    P6 ◉                    P2 ◉

    P7 ◉                    P1 ◉

              [TRICK AREA]

                  HERO
              [my hand fan]
              [act buttons]
```

**Precise seat coordinates** (ellipse cx=426, cy=180, rx=340, ry=120, 8 outer seats):

Seats distributed evenly at angles 270° (top-center), then clockwise:

| Seat | Angle from 12 o'clock | Approx position |
|---|---|---|
| P4 (12 o'clock / top) | 0° | Top-center — likely partner |
| P3 (1:30) | 45° | Upper-right |
| P2 (3 o'clock) | 90° | Right |
| P1 (4:30) | 135° | Lower-right |
| HERO | 6 o'clock | Bottom-center (me) |
| P5 (7:30) | 225° | Lower-left |
| P6 (9 o'clock) | 270° | Left |
| P7 (10:30) | 315° | Upper-left |

**Per-seat node** (mobile-optimized, each seat ~72×56px):

```
     ◉ avatar (28px circle)
   @handle  [team dot]
   N 张  ──────── (arc timer)
   ▣▣ (2 card backs at 12×18px)
```

**Center oval felt** (~300×160px): team level meters, trick display, round counter.

**Trade-offs:**
- PRO: Instantly familiar to anyone who has played poker. Spatial relationships are clear.
- PRO: Partner at 12 o'clock is visually "across from me" — same intuition as physical 掼蛋 table.
- PRO: Active seat glow is instantly noticeable on the perimeter.
- CON: On mobile landscape 852×393, 7 seats around an oval may feel crowded. Avatar size must drop to 24–28px. Text must drop to ~9–10px.
- CON: The "felt table" aesthetic may clash with the current Linear/technical design language. Solution: abstract oval (gradient ellipse, no realistic felt texture) with a crisp 1px border.

**Recommended as primary option.** This is what 德扑 players expect.

---

#### Option B: Octagonal (Chinese-game-style cross, scaled to 8P)

**Geometry**: 8 seats at cardinal and diagonal positions, like a compass rose. Me at south. Partner at north. Two opponents at NE/NW and two at E/W. Two opponents at SE/SW (closest to hero, most dangerous awareness).

```
     ┌──────────────────────────────────────┐
     │  P_NW ◉    P_N ◉    P_NE ◉          │
     │                                      │
     │  P_W ◉    [TRICK]    P_E ◉          │
     │            AREA                      │
     │  P_SW ◉             P_SE ◉          │
     │                                      │
     │               HERO                  │
     │           [hand] [buttons]           │
     └──────────────────────────────────────┘
```

This is equivalent to:

```
         P7        P4        P1
                  (top row — 3 seats)

         P6      [TRICK]     P2
                  (middle row — 2 side seats)

         P5                  P3
                  (lower row — 2 side seats)

                    HERO
```

**Trade-offs:**

- PRO: Clean grid, no ellipse math, each seat gets a clear position.
- PRO: Partnership geometry is visible: my partner at north is always "directly across."
- PRO: Works well in CSS grid (3-col × 3-row, with hero below).
- CON: Doesn't feel like a poker table. Looks like a tournament seating chart.
- CON: The "3 in a row at top" feels exactly like the current S05 problem — still too much "row" energy.
- CON: NE/NW/SE/SW corners feel unnatural for a card game — "are they closer or farther from me?"

**Not recommended** if the goal is to reference poker. Acceptable if a completely distinct Chinese-game aesthetic is desired.

---

#### Option C: Two-Row Top with Side Rails (Simplification of Oval)

**Geometry**: Keep bottom-me, but instead of a full oval, place top opponents in two rows. Row 1 (far): 3 seats across. Row 2 (near): 2 seats across. Left and right rails: 1 seat each. Total: 3 + 2 + 1 + 1 = 7 opponents.

```
     P_FL ◉     P_FC ◉     P_FR ◉    (far row: 3)
         P_ML ◉         P_MR ◉       (mid row: 2)
P_L ◉                          P_R ◉  (rails: 1 each)
                 HERO
            [hand] [buttons]
```

**Trade-offs:**

- PRO: More legible than pure oval on mobile. Each seat has more horizontal room.
- PRO: Easy CSS implementation (flexbox rows).
- CON: Rows give unequal spatial status to opponents: far-row feels "farther away" regardless of actual game turn order.
- CON: If partner is in far-row-center (P_FC), it reads correctly as "across from me." But if partner rotates to P_FL or P_ML by coincidence, the "partner is across" spatial contract breaks.
- CON: The left/right rail seats (P_L, P_R) get different visual treatment than the top seats — inconsistent.

**Acceptable as a fallback** if the oval proves too cramped on 393px height. But requires careful partner-detection: always move partner to P_FC dynamically regardless of their game seat assignment.

---

#### Comparison Matrix

| Criterion | Option A (Oval) | Option B (Octagon) | Option C (2-Row) |
|---|---|---|---|
| Poker familiarity (德扑 feel) | ★★★★★ | ★★☆☆☆ | ★★★☆☆ |
| Chinese game familiarity | ★★★☆☆ | ★★★★☆ | ★★★★☆ |
| Partner spatial clarity | ★★★★★ | ★★★★★ | ★★★☆☆ |
| Active player visibility | ★★★★★ | ★★★☆☆ | ★★★☆☆ |
| Mobile space efficiency | ★★★☆☆ | ★★★★☆ | ★★★★☆ |
| Implementation complexity | ★★★☆☆ | ★★★★★ | ★★★★☆ |
| Intuitiveness to new player | ★★★★★ | ★★☆☆☆ | ★★★☆☆ |

**Verdict**: Option A (Oval) is strongly recommended. The user's reference is 德扑 for 8P — this means the oval is the expected convention. The challenge is fitting 7 opponents onto a 852×393px oval without illegibility.

---

### 4.4 Practical Dimensions for Oval 8P on iPhone 14 Pro Landscape (852×393)

**Layout budget:**

```
Top safe area (nav bar): 34px high
Side safe areas: 59px left (Dynamic Island), 20px right
Bottom safe area: 34px (action buttons + safe zone)
Usable table area: ~758 × 325px
```

**Oval felt surface**: Ellipse centered at (426, 165), rx=290, ry=100. This leaves:
- 33px gap at top (nav) and bottom (for card hand to breathe)
- Hero's hand occupies y=280–393 (113px), which holds 13 cards at 27px wide with 20px visible gap each

**Per-seat avatar** at 24px with 10px name text and 8px level text: total seat node ≈ 60×44px. Seven seats on ellipse perimeter with 360°/7 = ~51° between each seat. At rx=290, that's arc-length ≈ 261px between seats at top arc, shrinking at sides. This is tight but workable — GGPoker ships a 9-player table on smaller screens.

**Center trick area**: 240×120px centered at (426, 165). Shows current trick (face-up cards), type label, who-played attribution, "need ≥ X to beat" hint.

**Partner highlight**: Since Guandan has fixed partner assignment, partner's seat node gets a colored ring matching "my team color" (blue). All opponents get their respective team rings (red/green/gold for teams B/C/D). This team coloring is the primary spatial signal — partner is always the one with the same ring color as me.

---

## 5. Tangential UI Patterns Worth Borrowing

### 5.1 Card Deal Animation

**Industry standard cascade** (used in every Chinese card game and poker app):

1. Deck animates in from center pile
2. Cards fly out to each player in deal order, one at a time, ~80ms between cards
3. Each card arcs toward its destination seat with slight rotation and scale-down
4. Hand cards "fan open" once all cards are dealt (300ms spring animation)
5. The player's own cards arrive with a slight "flip reveal" — back → face

**For Guandan specifically**: 27 cards per player × 4 players = 108 animations. At 60fps this is ~1.8 seconds of deal. Production apps accelerate this: cards are dealt in batches of 3-4 simultaneously after the first deal, completing full deal in ~2–2.5s total.

### 5.2 Trick Play Animation

When a player plays cards:

1. Selected cards lift from the hand (translate-Y -20px, slight scale-up, 150ms)
2. Cards fly to center trick area (200–300ms, ease-in-out, slight arc parabola)
3. Existing trick cards slide back or fade
4. Attribution label fades in above trick ("@饭团 出了")
5. If another player beats it: new cards fly in on top, old cards slide down-fade

**Bomb animation** (炸弹): All four+ bomb cards fly out simultaneously with particle burst effect, screen flash (frame of white/gold overlay), rumble effect (CSS transform: rotate(1deg) → rotate(-1deg) loop x3), then cards land in center.

### 5.3 Turn Indicator

**Recommended pattern** (synthesis of poker and Chinese game conventions):

- Avatar ring: 3px animated conic-gradient arc sweeping clockwise, gold/amber color, depletes over the time limit
- Floating label: "行动中" or "YOUR TURN" (for self) fades in above the seat node
- Hero action buttons: when it's your turn, the entire action button row illuminates (border-color changes from `--rule-1` to `--accent`)
- Sound cue: soft chime when your turn begins (distinct from the card-played sound)

**Time limit design**: For hero's turn, show a more prominent time bar either below the hand or as the action button background. For opponents, a smaller ring on the avatar is sufficient.

### 5.4 "PASS" / Skip Indicator

When a player passes (不出):

- A floating chip/badge appears above their seat: "不出" or "PASS" in the opponent's team color
- It fades out after 1.5s
- This prevents players from thinking the opponent "didn't load" — the skip is explicitly communicated

### 5.5 Active-Player Avatar Treatment

**From Hearthstone/card game conventions:**
- Active player's avatar gets a gold pulsing ring (0.8s pulse, `box-shadow: 0 0 0 3px gold, 0 0 0 6px gold/50%`)
- Inactive opponents are slightly dimmed (opacity: 0.7 on their seat info) to reduce visual noise
- The trick area center becomes slightly brighter when it's "action time" (subtle radial gradient pulse)

### 5.6 Spectator Mode UX

**Hearthstone model** (most applicable to Guandan):

- Spectators see ALL hands face-up (including one being watched)
- Spectator count badge displayed somewhere unobtrusive (e.g., top-right corner)
- Spectator names scroll in a side panel or bottom ticker
- Special indicator at top: "观战中" / "SPECTATING @handle" 

**Replay scrubbing** (from League of Legends replay system):

- Timeline bar at bottom: shows round boundaries as markers
- Play/pause, ±15s jump, speed selector (0.5× / 1× / 2×)
- "Jump to round N" shortcut buttons for each major event (double-win, bomb play)
- Current game state frozen at scrub position — cards visible as they were at that moment

### 5.7 Big Win / Level-Up Celebration

**Chinese card game conventions:**

- 双下 (double win / landlord wins): Full-screen gold particle burst, "双下！" title in large serif font, team color fill background (300ms), auto-dismisses after 2.5s
- Level upgrade animation: The level meter (2→3→A sequence) shows each level lighting up in sequence with a "ping" sound per step
- A-level win: Full-screen overlay with animated trophy/fireworks, more sustained (4s), share button appears

**Poker bomb equivalent** (炸弹 = bomb hand in Guandan):

- The bomb card set has a distinct visual: each card flies in with a slight delay (25ms stagger), the cards hover in center, then simultaneously explode outward with a particle burst before settling in the trick area
- Sound: dramatic low "boom" sfx

### 5.8 Emotional State / "Tilt" Signaling

Poker apps (especially GGPoker and Zynga) surface emotional state through:

- **Avatar expression**: Avatar image changes to "surprised" or "worried" face when stack drops below 20% of starting stack
- **Emote system**: Players can send quick emoji reactions (😤, 😂, 👏) — these float above their avatar for 2s then fade
- **Anger/tilt indicator**: NOT surfaced directly in production apps (too on-the-nose). Instead, subtle audio pitch changes and faster animation speeds are sometimes used to convey tension without labeling it

For Guandan, this is a nice-to-have for later iterations. The priority is clear level indicators — a player at "A-level vs 2-level" disparity is already emotionally charged territory that the UI can highlight with color emphasis.

### 5.9 Sound Design Principles

Standard Chinese card game sound events (from 欢乐斗地主 and similar):

| Event | Sound character |
|---|---|
| Card deal (one card) | Soft paper whoosh |
| Card played (non-bomb) | Firm card-slap thump |
| Bomb played | Low boom + reverb |
| Your turn | Soft chime / ping |
| Pass / skip | Soft negative blip |
| Level up | Rising arpeggio (3 notes) |
| Victory | Triumphant fanfare (2–3s) |
| Defeat | Somber short melody |
| Timer warning (last 5s) | Quiet tick-tick-tick |

These should be optional (mutable with a single icon). First-launch default: sound ON for game events, OFF for background music.

---

## 6. Summary Recommendations

| Topic | Recommendation | Reference |
|---|---|---|
| 4P layout | Keep current cross/plus pattern; add rival card-back stacks | 欢乐斗地主 |
| 6P layout | 6-seat ellipse, alternating team colors, me at bottom | 德扑 6-max |
| 8P layout | Option A oval, 7 opponents clockwise, partner at 12 o'clock | 德扑 8-max |
| Partner signal | Team-color ring on avatar (same color = partner) | 掼蛋 convention |
| Active indicator | Gold arc ring on avatar + "行动中" label + button row highlight | PokerStars |
| Time bar | Conic-gradient arc on avatar ring for opponents; full bar for hero | GGPoker |
| Card backs | 2 overlapping miniature backs per opponent, ~12×18px | All poker apps |
| Center area | Oval felt with trick cards + type label + attribution | Both Chinese + poker |
| Deal animation | Cascade from center, 80ms/card, fan-open on complete | 欢乐斗地主 |
| Bomb animation | Particle burst + screen flash + rumble CSS | 欢乐斗地主 |
| Big win | Full-screen overlay, 2.5–4s, auto-dismiss | Chinese game standard |
| Pass indicator | Floating "不出" badge fades over 1.5s | Chinese card games |
| Spectator | Face-up all hands, spectator count badge, timeline scrub | Hearthstone |

---

## Sources

- [腾讯欢乐斗地主 — Google Play](https://play.google.com/store/apps/details?id=com.qqgame.hlddzhw)
- [腾讯欢乐斗地主 — App Store](https://apps.apple.com/us/app/%E6%AC%A2%E4%B9%90%E6%96%97%E5%9C%B0%E4%B8%BB/id6504605223)
- [腾讯GDC: iPhone 4-player Doudizhu interaction design — 人人都是产品经理](https://www.woshipm.com/pd/12959.html)
- [腾讯掼蛋 — Google Play](https://play.google.com/store/apps/details?id=com.tencent.guandan)
- [腾讯掼蛋 — App Store](https://apps.apple.com/us/app/%E8%85%BE%E8%AE%AF%E6%8E%BC%E8%9B%8B/id6476842364)
- [六人掼蛋玩法 — 边锋游戏](https://wap.gameabc.com/project/201901/24.html)
- [从零到一撸一个在线斗地主 — 知乎](https://zhuanlan.zhihu.com/p/75899981)
- [PokerStars preferred seating (seat numbering convention) — PokerTracker](https://www.pokertracker.com/guides/PT3/tutorials/preferred-seating)
- [GGPoker mobile layout — GGPoker Help](https://help.ggpoker.com/article/Custom-Table-Layout-Custom-Table-Layouts-on-a-Tablet-or-Mobile-Phone)
- [PokerStars portrait tables article](https://www.pokerstars.bet/poker/learn/news/mobile-portrait-tables-now-available-on-pokerstars/)
- [Position in Poker: 6-Max & 9-Max Seat Map — VIPGrinders](https://www.vip-grinders.com/poker-strategy/position/)
- [Poker positions explained — 888poker](https://www.888poker.com/magazine/strategy/poker-position-names)
- [Card Games UI Design of Fairtravel Battle — GDKeys](https://gdkeys.com/the-card-games-ui-design-of-fairtravel-battle/)
- [5 UX/UI Lessons from Designing a Card Game — Medium](https://medium.com/@acbassettone/5-ux-ui-lessons-from-designing-a-card-game-b689d3f3187)
- [Hearthstone Spectator Mode — Hearthstone Wiki](https://hearthstone.fandom.com/wiki/Spectator_mode)
- [Spectator Mode Best Practices — NumberAnalytics](https://www.numberanalytics.com/blog/spectator-mode-best-practices-game-design)
- [TractorCards App (Sheng Ji mobile) — App Store](https://apps.apple.com/us/app/tractorcards/id6757169177)
- [Building Tractor (升级) as an online card game — Robert Ying](https://robertying.com/post/shengji/)
- [Guandan Wikipedia](https://en.wikipedia.org/wiki/Guandan)
- [掼蛋 — Baidu Baike](https://baike.baidu.com/item/%E6%8E%BC%E8%9B%8B/10312030)
- [Zynga Poker — Zynga](https://www.zynga.com/games/zynga-poker/)
