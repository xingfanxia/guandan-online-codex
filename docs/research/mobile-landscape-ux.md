# Mobile Landscape UX Research — Guandan Online

> Research date: 2026-05-16  
> Scope: landscape-only mobile web, auto-rotate from portrait, desktop parity  
> Game: 掼蛋 (Guandan) — 4/6/8 player, 27-card hand per player

---

## 1. Orientation Lock — What Actually Works on Mobile Web in 2026

### 1.1 The API Landscape

The Screen Orientation API (`screen.orientation.lock(type)`) is the standard mechanism. Support in 2026:

| Platform | Support | Notes |
|---|---|---|
| Android Chrome 46+ | Full | Works reliably; requires fullscreen or installed PWA context |
| Android Firefox | Full | Same fullscreen precondition |
| Android Samsung Internet | Full | |
| iOS Safari | **No** | WebKit recognizes the API but does not implement the lock. Returns `NotSupportedError` or silently does nothing depending on iOS version |
| Desktop Chrome/Edge | Full (desktop ignores it) | API exists, has no effect on desktop |
| Desktop Safari | No | Same as iOS |

**The fullscreen precondition is not optional.** `screen.orientation.lock()` requires the document to be in fullscreen mode (`document.fullscreenElement !== null`) or running as an installed PWA before the promise resolves. Calling it without fullscreen returns a rejected promise with `NotAllowedError`. This is an intentional security restriction — it prevents malicious pages from trapping users in a forced orientation without their knowledge.

Practical call sequence for Android:

```js
async function lockLandscape() {
  try {
    await document.documentElement.requestFullscreen();
    await screen.orientation.lock("landscape");
  } catch (err) {
    // iOS Safari, or user denied fullscreen — fall through to CSS fallback
    console.warn("orientation.lock unavailable:", err.message);
    activateCSSFallback();
  }
}
```

Always wrap both calls in `try/catch`. The promise rejection is the normal iOS path, not an error condition.

### 1.2 CSS-Only Fallback: `transform: rotate(90deg)`

The idea: when the device is in portrait, rotate the entire `<html>` element 90° to fake landscape. This is visually plausible but ships three hard problems with it:

**Problem 1 — Touch coordinate mismatch.** CSS `transform` is purely cosmetic. The browser's hit-testing and touch-event coordinate system remain anchored to the unrotated viewport. A finger touching what appears to be the top-left of the rotated scene fires touch events at what the browser believes is the bottom-left. For a card game where precise tap targets matter (individual cards in a fanned hand), this is not survivable without a full coordinate-transform layer in JS that intercepts every `touchstart`/`touchmove`/`touchend` and remaps `(x, y) → (screenH - y, x)` for a 90° clockwise rotation. Possible in theory; fragile in practice, and it breaks completely if the user initiates a touch near the rotated edge of the screen.

**Problem 2 — Viewport unit breakage.** `vw` and `vh` still refer to the pre-rotation physical pixel dimensions. A 100vw landscape element is physically portrait-wide after the transform. Any CSS that uses `vw`/`vh` for layout (common in responsive card tables) will produce wrong sizing. `dvw`/`dvh` have the same problem — they measure the dynamic viewport, which is still the unrotated one.

**Problem 3 — Virtual keyboard.** On Android, the soft keyboard opens relative to the unrotated viewport. When the game asks for text input (player names, room codes), the keyboard will render sideways or off-screen. iOS behaves similarly. If the game has any text input fields in the main landscape view, CSS rotation breaks them entirely.

**When CSS rotation is acceptable:** A "rotate your device" interstitial overlay — not the game canvas itself. Show a large icon and message when `window.matchMedia("(orientation: portrait)")` matches. This overlay lives in its own stacking context, never needs input fields, and requires no coordinate remapping. The player rotates physically; the overlay disappears; the game runs in a naturally landscape viewport. This is the safe use of CSS here.

```css
/* In the CSS: */
.rotate-prompt {
  display: none;
}

@media (orientation: portrait) {
  .rotate-prompt { display: flex; }
  .game-root     { display: none; }
}
```

Do not rotate the game itself with CSS transforms.

### 1.3 PWA Manifest: `"orientation": "landscape"`

The web app manifest supports declaring a preferred orientation:

```json
{
  "display": "standalone",
  "orientation": "landscape"
}
```

On **Android**, this works reliably for installed PWAs and is the cleanest solution — the OS locks the app to landscape without requiring the JS fullscreen dance. On Android Chrome 46+ the manifest orientation is respected.

On **iOS Safari**, the manifest `orientation` field is parsed by WebKit but **not honored**. As of iOS 18 / early 2026, Apple's implementation acknowledges the key in the manifest but does not enforce orientation locking for installed PWAs. This is a long-standing WebKit limitation; the open WebKit bug has not been resolved. An iOS user who installs the PWA can still rotate freely.

**The PWA install cost on iOS:** The user must use the "Add to Home Screen" flow from Safari — no browser-level install prompt is available on iOS. This is a significant friction point. Roughly 15–20% of mobile users will complete an unprompted install flow. For a casual card game shared by link, expecting all players to install the PWA is not realistic.

**Verdict on PWA manifest orientation:** Use it. It's free and works on Android (your largest addressable audience outside iOS). Do not rely on it as the only mechanism. It does nothing for iOS Safari browser sessions.

### 1.4 The Rotate-Prompt as the Reliable Fallback

Given iOS Safari's lack of any programmatic lock, the "rotate your device" prompt is the only universally reliable fallback. Treat it as the **primary UI** on iOS, not a last resort.

Design requirements for the prompt:
- Full-screen overlay, not a banner or toast — the game must be fully hidden so the player understands the device must rotate before play begins
- Animated rotation icon (a simple CSS-animated phone icon rotating from portrait to landscape)
- Brief text in both Chinese and English if internationalization is a concern: "请横屏游戏 / Please rotate your device"
- Disappears automatically on `orientationchange` event (no button needed)
- The overlay should also detect if the device is desktop — skip it entirely on desktop where landscape is native

```js
const isPortraitMobile = () =>
  window.matchMedia("(orientation: portrait)").matches &&
  window.matchMedia("(max-width: 900px)").matches;

window.addEventListener("orientationchange", () => {
  document.querySelector(".rotate-prompt").hidden = !isPortraitMobile();
});
```

### 1.5 Reference Implementations

**Hearthstone (native app, not web):** The iOS and Android apps are compiled native (Unity), so they use the OS-level orientation lock. Notably, even Hearthstone's Android build has experienced rotation bugs on specific Samsung devices where the system failed to apply the lock correctly — a reminder that even native apps are not immune. For the web version of any Hearthstone-adjacent card game UX, developers universally use the rotate-prompt pattern.

**agar.io / slither.io:** Both use WebGL canvas games. They do not lock orientation programmatically. Instead, they are designed to run well in any orientation, adapting the camera/viewport to the aspect ratio. This works because their gameplay is viewport-aspect-agnostic (circular arena, move in any direction). For a card game with a fixed table layout and positional player seats, this adaptive approach is not viable — the table geometry is inherently landscape.

**Practical pattern used by Chinese mobile card games (JJ掼蛋, 微乐掼蛋, 掼蛋之家):** All published as native apps (iOS + Android). They use OS-level landscape lock via `android:screenOrientation="landscape"` in the manifest and iOS `UISupportedInterfaceOrientations` plist. They do not solve the web problem — they sidestep it by being native. For a web implementation, you cannot replicate this without PWA install on Android.

### 1.6 Recommended Strategy (Summary)

```
Tier 1 (desktop):          Native landscape viewport — no action needed
Tier 2 (Android Chrome):   screen.orientation.lock() after requestFullscreen()
                            + PWA manifest orientation:landscape
Tier 3 (Android other):    PWA manifest fallback
Tier 4 (iOS Safari):       Rotate-prompt overlay (only viable path)
All tiers, portrait:        CSS media-query hides game, shows prompt
```

---

## 2. Safe Areas — Notch, Dynamic Island, Home Indicator

### 2.1 Required Viewport Meta Tag

Safe area insets are only exposed to CSS if `viewport-fit=cover` is set:

```html
<meta name="viewport"
      content="width=device-width, initial-scale=1.0, viewport-fit=cover">
```

Without this, the browser constrains content to the safe rectangle and the insets are always zero.

### 2.2 The Four Inset Variables

```css
padding-top:    env(safe-area-inset-top);
padding-right:  env(safe-area-inset-right);
padding-bottom: env(safe-area-inset-bottom);
padding-left:   env(safe-area-inset-left);
```

In portrait, `inset-top` covers the notch/Dynamic Island (~54px on iPhone 14 Pro / 59px on iPhone 16 Pro). `inset-bottom` covers the home indicator bar (~34px on Face ID devices).

### 2.3 Landscape-Specific Gotchas

In landscape, the notch/Dynamic Island migrates to the **side** of the screen. Which side depends on the rotation direction:

- **Landscape-right** (home button / Face ID sensor on the RIGHT): `inset-right` is zero; the cutout is on the **left** side — `inset-left` is non-zero (~47px on iPhone 14 Pro).
- **Landscape-left** (home button / Face ID sensor on the LEFT): `inset-left` is zero; the cutout is on the **right** side — `inset-right` is non-zero.

**iOS Safari allows rotation in both directions.** The OS chooses based on gravity unless the app is locked. This means you cannot predict which side the notch is on. You must honor both `inset-left` and `inset-right` at all times in landscape.

Practical rule: apply safe-area padding on all four sides of the game container. The values are zero where there is no cutout — it costs nothing to always apply them.

```css
.game-root {
  padding-top:    env(safe-area-inset-top);
  padding-right:  env(safe-area-inset-right);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left:   env(safe-area-inset-left);
  /* Or use min() to add extra breathing room */
  padding-left:   max(env(safe-area-inset-left), 12px);
  padding-right:  max(env(safe-area-inset-right), 12px);
}
```

### 2.4 System Gesture Zones in Landscape

Beyond the notch/Dynamic Island, iOS reserves additional interaction zones:

- **Top-left corner:** Control Center swipe (on older iPhones with status bar) or Dynamic Island tap
- **Bottom edge:** Home indicator swipe-up gesture zone — roughly 30px from the bottom edge is reserved; taps here may be intercepted by the OS
- **Left and right edges:** In some iOS versions, edge-swipe-back gesture competes with game drags. If cards are draggable from the edge of the screen, iOS may steal the touch event.

Avoid placing any interactive card game element:
- Within `env(safe-area-inset-top)` of the top
- Within `env(safe-area-inset-bottom)` of the bottom (home indicator zone)
- Within `env(safe-area-inset-left/right)` of the notch sides
- Within 20px of the physical left or right edge (edge-swipe-back interference)

The effective playfield on a 390×844 iPhone 14 Pro in landscape is approximately:
- Physical: 844×390 px (CSS pixels at 3× DPR = 2532×1170 physical)
- After safe areas: roughly 797×356 px of usable space (notch ~47px one side, home indicator ~21px bottom)
- Net playfield: approximately **797 × 335 px** of truly safe real estate

---

## 3. Four/Six/Eight Player Table Layouts in Landscape

### 3.1 Shared Layout Principles

In all modes:
- **Bottom zone** = the local player's hand — widest, most interactive area
- **Center zone** = currently played cards / active pile — visually prominent
- **Side zones** = opponent info (level badges, card counts, turn indicators)
- **Top zone** = partner or opponent across the table

Real-estate budget on a 6.1" landscape phone (~844px wide × 390px tall, safe area reduced to ~797 × 335 effective):

```
┌─────────────────────────────────────────────────┐  ← safe-area-inset-top (~0px landscape)
│ HUD strip: round/level/timer          [12px]    │
│─────────────────────────────────────────────────│
│   [Left opp]  [ CENTER PLAY AREA ] [Right opp]  │  ← ~165px tall
│    48×80      [  ~340px × 160px  ]  48×80       │
│─────────────────────────────────────────────────│
│              PLAYER HAND ZONE                   │  ← ~120px tall
│        (cards fanned across full width)          │
└─────────────────────────────────────────────────┘  ← safe-area-inset-bottom
```

### 3.2 Four-Player: Cross / Diamond Layout

```
              ┌──────────────────────┐
              │  [Partner — N]       │   card-count badge
              │  5 cards facedown    │
              └──────────────────────┘
        ┌──────┐  ┌──────────────┐  ┌──────┐
        │ Opp  │  │  Play pile   │  │ Opp  │
        │  W   │  │  + Pass btn  │  │  E   │
        │ 6 cds│  │              │  │ 7 cds│
        └──────┘  └──────────────┘  └──────┘
              ┌──────────────────────┐
              │  MY HAND — 13 cards  │   fan layout
              │  [Arrange] [Pass]    │
              └──────────────────────┘
```

Four players in Guandan each start with 27 cards but the hand shrinks during play — the cross layout works well. The seated player (South/bottom) has the full width for their hand. Partner (North/top) shows a facedown fan with a card count. East and West opponents each get a narrow vertical strip (~48px wide) with facedown card stacks and name/level badges.

The center play area is roughly 340×160px — enough for two rows of played cards (the typical Guandan "炸弹" combo can be 6 cards wide).

### 3.3 Six-Player: Stretched Hexagon

With 6 players, two are added to the table. The canonical positions are N, NE, SE, S (local), SW, NW:

```
      ┌─────────────────────────────┐
      │    [NW opp]  [N partner]  [NE opp]   │
      │─────────────────────────────│
      │ [SW opp]  [ PLAY CENTER ]  [SE opp]  │
      │─────────────────────────────│
      │         MY HAND (S)         │
      └─────────────────────────────┘
```

In practice on a narrow landscape phone, squeezing 3 opponents across the top and 2 on the sides is crowded. A workable compromise collapses NW and SW into the left rail, NE and SE into the right rail, and keeps N as the top partner zone:

```
┌──────┬─────────────────────────┬──────┐
│ NW   │   [N partner]           │ NE   │
│ SW   │   [play area]           │ SE   │
└──────┴─────────────────────────┴──────┘
              MY HAND
```

Each side rail (~52px) shows two vertically stacked player chips (avatar + card count). The play area is reduced to ~680×120px but remains usable.

### 3.4 Eight-Player: Two-Row Octagon

Eight players is the densest mode. Common native app approach: an oval table where opponents are distributed around the perimeter. On a phone-sized landscape screen this degenerates — the side rails become too narrow.

Recommended phone-specific approach: **compress to a 2×4 table display**. Top row: 4 opponents (shown as compact 40px chip with name + card count). Bottom: local player hand. Left/right side rails disappear.

```
┌──────────────────────────────────────┐
│ [N1]    [N2]     [N3]     [N4]       │   ← 40px chip height
│───────────────────────────────────────│
│           PLAY AREA (center)          │   ← 120px
│───────────────────────────────────────│
│           MY HAND (S)                 │   ← 130px
│ [S-partner] [S-opp-L] [S-opp-R]      │   ← 30px strip for adjacents
└──────────────────────────────────────┘
```

The geometry becomes asymmetric (4 above, 3 conceptually around) but it is readable on a 390px-wide landscape phone. Tablet gets the full oval layout.

### 3.5 Handling 27 Cards in a Landscape Hand

27 cards in a fanned row on a ~790px-wide phone is the central challenge. Options:

**Option A: Tight overlap fan (recommended for phones)**

Overlap each card so only the rank/suit corner is visible for all but the rightmost. With a 36px visible card width (overlap of ~25px) and 27 cards: 27 × 36 = 972px — too wide. Reduce visible width to 28px: 27 × 28 = 756px — fits in 790px.

Minimum viable card: the corner index (e.g., "K♠") must be 14px font size minimum on a 3× DPR device. At 28px visible width, a 14px rank glyph with a 4px top margin is readable. The full card body (face) is only visible for selected cards (lift effect).

```
  ┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐ ... ┌──────┐
  │K│┌│J│┌│7│┌│A│┌│...                         │ last │
  │♠│││♥│││♣│││♦│││                             │ card │
  └─┘│└─┘│└─┘│└─┘│                             │ full │
     └───┘   └───┘                             └──────┘
```

**Option B: Two-row hand** — Split 27 cards into two horizontal rows of ~13/14. Increases height cost (~160px) but makes each card wider (~58px visible). Better for readability, worse for thumb reach on the back row.

**Option C: Scrollable fan** — Single row with horizontal scroll. Familiar from WeChat moments swipe patterns. Low cognitive load but breaks the "see all cards at once" mental model essential to card game play.

**Recommendation:** Option A (tight overlap fan) as the default. On tablet (>900px landscape), switch to Option B or a more generous overlap. Never use Option C — seeing your full hand simultaneously is a game requirement.

### 3.6 ASCII Layout: Phone (390×844 physical, 390px CSS landscape)

```
844px wide × 390px tall (CSS pixels, landscape)
─────────────────────────────────────────────────────────────────────────────
 Y=0   [safe-area-top ~0px in landscape]
 Y=4   HUD: ● room A1B2C3  ·  Round 3  ·  Level 5  ·  ⏱ 12:34          [28px]
 Y=32  ─────────────────────────────────────────────────────────────────
 Y=32  [Opp-W|48px]  [        CENTER PLAY AREA        ]  [Opp-E|48px]   [120px]
       avatar+count  [  last played combo (up to 6 cds)]  avatar+count
       level badge   [  PASS/PLAY buttons centered     ]
 Y=152 ─────────────────────────────────────────────────────────────────
 Y=152 [          PARTNER strip — top ~40px           ]
        Name · card count · level badge
 Y=34  [   MY HAND: 27 cards fan, 28px overlap each  ]   [120px]
 Y=274  [理牌]  [Pass]  ← action buttons, left-aligned
 Y=310 ─────────────────────────────────────────────────────────────────
 Y=310 [player stats bar: current level / team score ]   [28px]
 Y=338 [safe-area-bottom ~21px]
 Y=359 physical bottom
```

---

## 4. Card Interaction Patterns

### 4.1 Tap-to-Lift Then Confirm vs Single-Tap-to-Play

**Single-tap-to-play** (tap a card → it immediately goes to center) is fast but catastrophically misfire-prone in landscape. Fingers on a phone regularly brush adjacent cards, especially in the tight overlap fan. A misfire on the 2♣ when you meant 3♣ can lose a round.

**Tap-to-lift + confirm** (tap → card rises ~12px from the fan, second tap on a "Play" button commits):
- One tap = selected state (card lifts, gets a colored ring)
- Tap again = deselect (card returns)
- Tap "出牌" button = commit and play selected cards
- This is the dominant pattern in Chinese mobile card games (JJ掼蛋, 微乐掼蛋 both use this)

**Recommendation:** Tap-to-lift + confirm. The extra tap is a small UX cost that pays for itself immediately in reduced misfire frustration.

### 4.2 Drag-Up to Play

The drag-up gesture (drag a selected card upward past a threshold into the play zone) is used in Hearthstone (drag card from hand to board) and Marvel Snap (drag card to a lane). For Guandan, the gesture maps naturally: the play area is above the hand.

Caveats:
- Multi-card combo plays require all combo cards to be selected first, THEN dragged — or the gesture only applies to the dragged card
- Drag-up conflicts with iOS edge-swipe-back on iPhones if the hand zone is near the bottom edge
- The 21px safe-area-bottom zone is where the OS intercepts swipes, right where a user's thumb lifts to begin a drag-up

**Recommendation:** Offer drag-up as an alternative, not the primary. Primary = tap-to-lift + button. Drag-up as a gesture shortcut once the player is familiar.

### 4.3 Multi-Select for Combos and Tribute

Guandan combos (顺子, 同花顺, 炸弹) require selecting multiple cards simultaneously.

Options:
1. **Sequential tap** — each tap adds to selection (default, no mode switch required)
2. **Long-press to enter multi-select mode** — visual mode indicator; subsequent taps toggle
3. **Swipe-across** — drag finger across the fan; all cards touched are selected

**Recommendation:** Sequential tap (each tap toggles the card's selected state). This is consistent with the tap-to-lift model, requires no mode switch, and allows natural combo building by tapping each card in the combination. Put a card count indicator near the "出牌" button ("已选 3 张") so the player knows their selection state.

For tribute (进贡/还贡), the multi-select gesture is the same — the game context changes which card(s) are selectable, not the interaction model.

### 4.4 "Auto-Arrange" (理牌) Button

Standard behavior: sort hand by suit then by rank (or by rank then suit — offer a toggle). Place the 理牌 button in the left corner of the hand zone, anchored to the safe-area-inset-left. It should be a minimum 44×44px tap target labeled "理牌" or an icon (a fan of cards being straightened).

Auto-arrange should animate the reorder — each card smoothly translates to its new position over 200ms. This makes the operation comprehensible and feels polished. Avoid instant jumps.

### 4.5 Suggested Play (提示)

System-suggested valid moves (highlight cards the player could legally play):

**Approach A: Glow + Auto-select.** The system pre-selects the strongest valid move; cards in the suggestion glow green. Player can deselect and re-select manually. One tap on "出牌" commits the suggestion.

**Approach B: Side panel listing.** A slide-out panel lists valid plays as text ("顺子: 3-4-5-6-7", "炸弹: 5555"). Tap a row to select that combination.

**Recommendation:** Approach A (glow + auto-select). It stays in the hand zone without requiring a secondary UI surface. The glow must be clearly distinguishable from the "selected" state — use a different color (e.g., selected = blue ring, suggested = green glow).

---

## 5. Animation Language

### 5.1 Card Deal Animation

Three styles compared:

**Instant** — all 27 cards appear in hand simultaneously. Zero-latency, zero delight. Acceptable for reconnection/rejoin scenarios only.

**Cascade (recommended)** — cards deal one by one to each player in sequence, with ~40ms stagger between cards. For 27 cards × 4 players = 108 card-deal events. At 40ms stagger per player slot: the full deal takes ~1.1 seconds. Fast enough to not feel slow; slow enough to convey dealing.

```
Each card deal event:
 - Card starts at dealer position (center)
 - Translates to target player hand over 180ms (ease-out)
 - Scale: 0.5 → 1.0 over same 180ms
 - GPU: translate3d + scale only (compositor thread, no layout)
```

**Cinematic** — slow dramatic deal with sound effects, 3–5 seconds. Suitable for the game's opening round or special events (e.g., a 掘地三尺 level game). Not for routine rounds.

**Recommendation:** Cascade for all deals. Cinematic as an option for the first deal of a session or on significant level-up moments.

### 5.2 Card Play Animation (Hand → Center)

When a player plays cards:
- Cards in hand translate to center play area over 220ms (ease-in-out)
- Use `transform: translate3d(targetX, targetY, 0)` calculated in JS
- Simultaneously, the card appears face-up in the play pile with a slight scale-up (1.0 → 1.05 → 1.0, 120ms) to confirm the play landed
- Other players' played cards animate from their side zone toward center (shorter distance, same duration)

Arc trajectory (bezier curve through a midpoint above center) adds ~40ms of feel-good but complicates the code significantly. It is worth implementing only for special plays (炸弹/bomb plays and 掼蛋 wild card plays) where drama is warranted.

### 5.3 Canvas (PixiJS / Phaser) vs CSS Transform — Performance Budget

**CSS `transform` + `opacity` only:**
- Runs on the GPU compositor thread — does not touch layout or paint
- Zero main-thread cost when animated properties are only `transform` and `opacity`
- Overhead: one layer per animated card = ~27 GPU layers during deal
- Viable on 2-year-old Android mid-range (e.g., Snapdragon 680 class) at 60fps
- Complexity: each card is a DOM element; 27 cards in hand + played cards on table = 50–80 DOM nodes maximum; this is well within DOM performance budget

**PixiJS / Phaser (WebGL Canvas):**
- GPU-accelerated sprite batching; handles 1000+ sprites at 60fps
- For a card game, you will never exceed ~100 sprites — WebGL is overkill
- Adds ~300KB gzip to bundle (PixiJS v8 core)
- Loses CSS theming integration entirely (no `oklch` custom properties, no CSS variables, no accessible focus rings without custom implementation)
- Touch event handling must be reimplemented at the canvas level
- **Verdict: not worth it for Guandan.** A card game at ~80 DOM nodes is a CSS-territory problem, not a WebGL problem.

**Recommendation:** CSS `transform` + `opacity` animations only. Use `will-change: transform` on card elements during active animation, remove it after (over-using `will-change` increases GPU memory consumption and can hurt battery on mid-range devices). Use `requestAnimationFrame` loops only for physics-style animations (e.g., spring-release of lifted card on deselect); use CSS `transition`/`@keyframes` for everything else.

**60fps budget on 2-year-old Android:**
- 16.67ms per frame budget
- CSS compositor animations: ~0ms main-thread cost
- JS game logic tick (state update, valid move check): target ≤4ms
- DOM read/write (card position update): batch reads before writes, target ≤2ms
- Remaining budget: ~10ms — comfortable

---

## 6. Typography and Scale on Mobile Landscape

### 6.1 Touch Target Minimums

| Platform | Minimum | In CSS pixels |
|---|---|---|
| iOS HIG | 44pt | 44px (at 1× — note: physical pixels vary by DPR) |
| Android Material | 48dp | 48px (at 1× mdpi) |
| WCAG 2.5.5 | 44×44px | 44×44 CSS pixels |
| Google Search Console | 48×48px | 48×48 CSS pixels (below this triggers "small tap targets" warning) |

**Rule of thumb for this game:** All buttons (出牌, 不出, 理牌, 提示) must be **minimum 48×48px CSS pixels**. The "出牌" button should be larger — 56×56px or wider — as it is the most-used action and the primary source of misfire frustration.

In landscape on a 390px CSS-height device, you have ~335px of usable height. A 48px button is 14% of the screen height — noticeable but not dominant.

### 6.2 Card Face Readability

Minimum card width for a readable corner index (rank + suit glyph):

- Rank character ("K", "10", "A", "小", "大") in a font size of 12px minimum — 10px is the absolute floor and is difficult for users over 45
- Suit symbol ("♠", "♥", "♦", "♣") at 10px minimum
- Padding: 2px left, 2px top
- Minimum card width to show the corner index: **26–28px**

At 28px visible width with a 3× DPR device, the physical pixels are 84px — sufficient for a 36px physical font rendering of the rank.

Cards in the local player's hand should be taller than they are wide (portrait card aspect ratio 2:3). At 28px visible width, show the full card height (~56px) even though most of it is behind the next card. The full card face is revealed when selected (lifted) and shown at ~72×108px.

Joker cards ("大王"/"小王" in Chinese) need special treatment — the character is two CJK characters wide and will not fit on a 28px card corner. Use single-character abbreviations ("大"/"小") in the corner index.

### 6.3 HUD Typography

The HUD strip (room code, round number, level, timer) runs in a 28px-tall strip. Use monospace for the timer to prevent layout jitter as digits change. Minimum 11px font size for HUD labels; 13px for values.

---

## 7. Reference Apps and Their Approaches

### 7.1 欢乐斗地主 (Tencent QQ Dou Dizhu)

The baseline expectation for Chinese card game players. Key UX patterns:
- **Landscape-locked** via native Android/iOS orientation lock
- **Tap-to-lift + confirm** for card selection (same as recommended above)
- **底部全宽手牌区** — the local player's hand spans the full bottom width in landscape
- **中央牌堆 + 操作按钮** — played cards in center, "出牌"/"不出" buttons flanking the pile
- Center buttons are large (≥56px tall) and positioned at comfortable thumb reach (~65% up from bottom)
- Opponent zones: small avatar + card count chips on the side rails
- No card deal animation — cards appear instantly (common in Tencent games to minimize wait friction)
- 理牌 button is always visible bottom-left; tap for instant sort (no animation)

Chinese players who have played 斗地主 on mobile will arrive at Guandan with this UX as their baseline. Deviation from it creates friction.

### 7.2 JJ掼蛋 / 微乐掼蛋

Native apps with similar landscape-locked design. JJ掼蛋 specifically:
- Four-player cross layout (consistent with 3.2 above)
- **Level badge prominently displayed** next to each player — Guandan's core mechanic is level progression (2→A), so this is correctly given visual weight
- **Tribute UI:** when a tribute is owed (进贡), a dedicated modal appears with highlighted valid tribute cards — the player doesn't pick from the hand directly, they pick from a curated selection UI
- **Team indicators:** colored backgrounds or borders for the two teams, consistent throughout play

### 7.3 Hearthstone Mobile

Relevant patterns:
- **Drag-to-play** as the primary card interaction — works because Hearthstone hand size is ≤10 cards, not 27
- **Card lift on touch-start** — card rises visually when pressed, before drag begins, providing immediate tactile feedback
- **Play area zones are large** — the board is 60% of the screen; the hand is the bottom 20%
- **Card fan in hand** — similar overlap pattern to recommended above, but with fewer cards so wider visible area per card (~60px)

The Hearthstone model breaks at 27 cards because the hand zone budget cannot give each card 60px at 390px screen width. Adapt the lift-on-touch mechanic, not the fan width.

### 7.4 Marvel Snap

Relevant patterns:
- **Bottom 20% = hand zone** in landscape; rest = table
- Drag card up past a threshold → snaps to a lane
- Very deliberate about **not using tap-to-confirm** — single drag commits the play. Works because Snap hand has 3–7 cards, not 27. Mitigating misfire risk is less critical.
- **End Turn button** is large and in the center-right — easy to find, but as UX researchers noted, it's close to where right-handed thumbs rest in landscape, leading to accidental taps
- **Card reveal animation** at turn end is cinematic (~1.5 seconds) and is the signature moment of the game. Guandan's equivalent would be a bomb reveal.

---

## 8. Concrete Recommendations

### 8.1 Orientation Lock

**Start:** `screen.orientation.lock("landscape")` after `requestFullscreen()` on Android. Catch all rejections gracefully.

**Fallback:** CSS `@media (orientation: portrait)` hides the game and shows a full-screen rotate prompt. This is the iOS path and the catch-all.

**Do not use** CSS transform rotation of the game canvas.

**Add** `"orientation": "landscape"` to the PWA manifest for Android PWA installs.

### 8.2 Safe Areas

Apply `env(safe-area-inset-*)` padding on all four sides of `.game-root`. Require `viewport-fit=cover` in the viewport meta tag. Never place interactive elements within the inset zones or within 20px of the left/right physical edges.

### 8.3 Table Layout

**Start with:** Four-player cross layout (partner top, opponents left/right, self bottom). This is the established baseline for the player audience.

**For 6-player:** Side-rail stacking (2 opponents per rail, partner top).

**For 8-player:** Two-row top opponent strip when on phone; oval table when on tablet (>900px landscape).

**Fallback:** On screens narrower than 360px CSS, collapse opponent side rails to 36px with avatar only (no name text).

### 8.4 Hand Display

**Start with:** Tight overlap fan, 28px visible width per card, full card face revealed on selection.

**Fallback (tablet):** 50px visible width per card.

**Never use** horizontal scroll for the hand.

### 8.5 Card Interaction

**Primary:** Tap-to-lift (card rises 12px), then tap "出牌" to commit. Tap again to deselect.

**Secondary:** Drag-up from the hand zone as an accelerator gesture once a card or combo is selected.

**Multi-select:** Sequential tap toggles — no mode switch required.

**Suggested play:** Auto-select highlight (green glow) on legal moves; player taps "提示" to cycle through suggestions.

### 8.6 Animations

**Deal:** Cascade (40ms stagger per card, 180ms per card flight, CSS translate3d only).

**Play commit:** translate3d to center, 220ms ease-in-out. Arc trajectory for bomb plays only.

**理牌:** 200ms CSS transition reorder animation.

**Technology:** CSS `transform` + `opacity` only — no WebGL canvas. Use `will-change: transform` during active animations; remove after.

### 8.7 Touch Targets and Typography

**Buttons:** Minimum 48×48px. Primary action button (出牌) at 56×56px minimum.

**Card corner index:** 12px minimum font size. 28px minimum visible card width.

**HUD:** 11px labels, 13px values, monospace for timer.

---

## Sources

- [ScreenOrientation: lock() method — MDN](https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock)
- [Managing screen orientation — MDN](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Object_Model/Managing_screen_orientation)
- [ScreenOrientation API: lock — Can I Use](https://caniuse.com/mdn-api_screenorientation_lock)
- [PWA iOS Limitations and Safari Support 2026 — MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [PWA iOS Current Status & Limitations — Brainhub](https://brainhub.eu/library/pwa-on-ios)
- [iOS PWA Compatibility — firt.dev](https://firt.dev/notes/pwa-ios/)
- [3 Ways to Lock Screen Orientation With CSS & JS — Code Boxx](https://code-boxx.com/lock-screen-orientation/)
- [Orientation Lock — CSS-Tricks](https://css-tricks.com/snippets/css/orientation-lock/)
- [env() — CSS-Tricks](https://css-tricks.com/almanac/functions/e/env/)
- [env() CSS function — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env)
- [Understanding env() Safe Area Insets — Mohammad Shehadeh](https://mohammadshehadeh.com/css/safe-area-insets/)
- [Don't Fight The Notch — julian.is](https://julian.is/article/iphone-x-notch/)
- [Marvel Snap UX case study — Medium / Design Bootcamp](https://medium.com/design-bootcamp/marvels-snap-ui-ux-case-study-9f727d8f3875)
- [SNAPPY UI — Marvel Snap interface analysis, ArtStation](https://www.artstation.com/artwork/GemNDd)
- [Designing A Touch Mechanic — Mobile Free To Play](https://mobilefreetoplay.com/design-touch-mechanic/)
- [Touch Controls for Mobile Games — Cursa/MDN](https://cursa.app/en/page/touch-controls-for-mobile-games-input-patterns-and-feedback)
- [All accessible touch target sizes — LogRocket](https://blog.logrocket.com/ux-design/all-accessible-touch-target-sizes/)
- [CSS and JavaScript animation performance — MDN](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/CSS_JavaScript_animation_performance)
- [CSS GPU Animation: Doing It Right — Smashing Magazine](https://www.smashingmagazine.com/2016/12/gpu-animation-doing-it-right/)
- [PixiJS Performance Tips](https://pixijs.com/7.x/guides/production/performance-tips)
- [Game Design UX Best Practices — UX Planet](https://uxplanet.org/game-design-ux-best-practices-guide-4a3078c32099)
- [UX for Mobile Games — Vrunik](https://vrunik.com/ux-for-mobile-games-optimizing-user-interfaces-for-small-screens/)
- [orientation — Web app manifest — MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/orientation)

---

## Update — 2026-05-16: CSS rotate is the production path for forced landscape

The original analysis framed CSS `transform: rotate(90deg)` as a trap ("three hard problems") and concluded that the rotate-prompt overlay is "the only universally reliable iOS fallback." This was challenged in review against the empirical reality of major Chinese mobile web games — Majsoul (雀魂), 4399 H5 games, WeChat mini-games — which ship forced landscape on iPhone Safari as of 2026-05-16 without a rotate prompt.

### What Majsoul actually does

Majsoul is built on Cocos Creator and renders the entire game as a single WebGL canvas. On a portrait-held iPhone, the game:

1. Detects orientation via `window.matchMedia('(orientation: portrait)')`
2. Applies `transform: rotate(90deg)` to the canvas container
3. Cocos engine internally transforms touch coordinates through the rotation matrix
4. The user sees the game in landscape while holding the phone in portrait

This works because: (a) the entire UI is one canvas (no DOM tree to manage), (b) no scrolling, (c) no virtual keyboard, (d) the game engine owns coordinate transforms.

### Re-examining the "three hard problems" for our DOM-based game

The original analysis listed three CSS rotate problems:

1. **Touch coordinates flip** — outdated as of 2026. Modern browsers (iOS Safari 16+, Android Chrome 90+) correctly translate pointer events through CSS `transform`. Click on a rotated button delivers correct local coordinates. This concern was inherited from older browser behavior.

2. **Viewport units break** — true but mitigable. `100vw` / `100vh` reference the un-rotated viewport. Fix: use JS-set CSS variables (`--logical-w`, `--logical-h`) sourced from `window.innerWidth` / `window.innerHeight`, swap dimensions when rotate is active. ~30 lines of glue, set once at orientation change. Modern `100dvw` / `100dvh` (dynamic viewport units) help on iOS but still need the swap in the rotated frame.

3. **Virtual keyboard breaks** — true. The IME inserts in the un-rotated coordinate space, looks sideways relative to the rotated UI. For Guandan, text input is rare (room code entry, handle entry). Solution: exit rotate mode while a text input has focus, re-enter on blur. Well-documented pattern in Chinese mobile web ecosystems.

For a static-layout card game without scrolling, all three are tractable. The "trap" framing is correct for general-purpose web apps but over-conservative for a Majsoul-shaped game UI.

### Revised tier ranking

| Path | When to use |
|---|---|
| **Native orientation lock** | Android (Chrome 46+) after `requestFullscreen()` — works reliably |
| **CSS rotate trick** (primary on iOS) | iPhone Safari + any device where native lock fails. The Majsoul-style "just works" path: phone in portrait → game in landscape via CSS rotate. |
| **Rotate-prompt overlay** | Emergency fallback only. Fires if CSS rotate exhibits a bug on a specific device; offers skip-to-CSS-rotate button. |

This inverts the original Section 1's recommendation. Rotate-prompt drops from "iOS default" to "edge-case fallback." CSS rotate becomes the iOS default.

### Implementation note for plan phase

Budget ~3-5 days of mobile UX work to wire the CSS rotate path robustly. Test matrix:

- Portrait held + browser auto-rotate ON → CSS rotate kicks in, game in landscape
- Portrait held + iOS Control Center rotation lock ON → still works (orientation lock is OS-level, but our CSS detects portrait via media query regardless)
- Landscape held → render natively, no CSS rotate
- Mid-game rotation change → graceful transition without state loss
- Text input focus (room code / handle entry) → temporary exit rotate
- iOS PWA install (display: standalone) → check whether orientation differs from in-tab

Reference implementations to study:
- Majsoul mobile web (Cocos Creator)
- 4399 mobile games (H5 game template)
- Tencent Egret framework rotate trick

### Additional sources

- [How to Get Screen Orientation in JavaScript: Complete 2026 Guide](https://copyprogramming.com/howto/javascript-screen-orientation-on-safari) — confirms iOS Safari 26 still does not implement orientation.lock()
- [ScreenOrientation.lock on Safari · Issue #19355](https://github.com/mdn/browser-compat-data/issues/19355) — long-standing WebKit non-implementation
- [手机游戏横屏显示方案 — CSDN](https://blog.csdn.net/yerongtao/article/details/81098297) — production Chinese mobile web force-landscape pattern
- [移动端横屏布局与自适应 — CSDN](https://blog.csdn.net/az44yao/article/details/124779467) — JS+CSS implementation strategy
- [纯CSS（media queries）实现移动端横竖屏提示 — segmentfault](https://segmentfault.com/a/1190000003871049) — CSS-only fallback patterns
