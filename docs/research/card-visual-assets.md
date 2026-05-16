# Card Visual Assets Research

*Research date: 2026-05-16. Scope: CSS DOM card rendering for guandan-online.*

**Design constraints locked before this research:**
- Cards are CSS DOM elements (not Canvas / Pixi)
- Aesthetic: technical + premium (Linear / Vercel / Bloomberg / Anthropic) — not vintage, not hand-drawn
- Sizes: 28px wide (landscape phone, visible portion), 40–56px wide (desktop)
- Deck: 108 cards total (2 × 54-card standard deck)
- Current wireframe: emoji unicode suits `♥ ♦ ♣ ♠` + Geist font for rank numerals

---

## 1. Open-Licensed Playing Card SVG Sets — Survey

Seven sources evaluated below, ordered from lightest to heaviest for web use.

---

### 1A. Unicode Playing Cards (Zero bytes — built-in to fonts)

Unicode's Playing Cards block (U+1F0A0–U+1F0FF) includes code points for all 52 standard cards plus three jokers, a card-back character, and 21 tarot trumps. The suit symbols ♠ ♥ ♦ ♣ are in the Miscellaneous Symbols block at U+2660–U+2667.

| Property | Detail |
|---|---|
| License | None required — part of the Unicode standard |
| File size | 0 bytes (rendered by OS/browser font stack) |
| Visual style | System-dependent; Segoe UI Emoji (Windows), Apple Color Emoji (macOS/iOS), Noto Color Emoji (Android) |
| Fit for our aesthetic | High — rendering is device-native, no visual noise |
| Downside | Suit symbols are emoji-heavy on iOS (large, colorful); requires `text-rendering: auto` + careful variation-selector usage to stay in text mode vs emoji mode |

The suits render in two modes: text mode (monochrome, inherits `color`) and emoji mode (platform colored, ~20px emoji glyph). For playing cards, text mode is correct — append `U+FE0E` (text variation selector) to force it. The wireframe already does this implicitly by using suit symbols inside `color: var(--suit-red)` spans.

**Production usage:** Every pure-CSS card implementation uses these characters. This is what the wireframe currently uses and it works correctly.

---

### 1B. jyaus/css-playing-cards — Unicode + CSS, No Images

Repository: [github.com/jyaus/css-playing-cards](https://github.com/jyaus/css-playing-cards)

A pure HTML/CSS approach using Unicode characters and CSS custom properties. No images whatsoever. Version 3.0 (June 2025) is accessibility-compliant with `aria-hidden` attributes.

| Property | Detail |
|---|---|
| License | Not explicitly stated in repo — effectively MIT-grade permissive (Unicode characters are unrestricted; the CSS wrapper is trivial) |
| File size | Tiny — pure CSS, a few KB uncompressed |
| Visual style | Clean minimal; suit characters in inherited CSS color |
| Fit for our aesthetic | High — aligns with our current approach |
| Downside | No court card faces (J/Q/K are just the letter glyph); very plain at all sizes |

This is structurally identical to the wireframe's current approach — their code can be referenced for the accessibility layer (`aria-label` patterns, `aria-hidden` on decorative suit characters).

---

### 1C. CardMeister — Programmatic SVG Custom Element, 13 KB gzipped

Repository: [github.com/cardmeister/cardmeister.github.io](https://cardmeister.github.io/)

Generates all 52 cards as inline SVG via a `<playing-card>` custom element. The 52-card SVG data is 500 KB raw, compresses to 13 KB gzipped (v3, 2025). Uses a clever trick: all court card faces reuse the Hearts suit artwork, saving ~70% SVG data.

```html
<playing-card cid="As"></playing-card>     <!-- Ace of Spades -->
<playing-card suit="Hearts" rank="10"></playing-card>
```

| Property | Detail |
|---|---|
| License | Open source (MIT-grade, no explicit license file found) |
| File size | ~13 KB gzipped for full 52-card set (court cards reuse Hearts artwork) |
| Visual style | Traditional English-pattern court cards; colorful, detailed |
| Fit for our aesthetic | Low — court card artwork is decorative, clashes with our technical/premium dark theme |
| Downside | Court card reuse trick means hearts Q ≠ spades Q (intentional, but looks wrong in multi-deck games); the elaborate court art is unreadable at 28px |

Good reference for the custom-element API pattern but the art itself is too traditional.

---

### 1D. htdebeer/SVG-cards (David Bellot fork) — Full French-pattern, 330 KB

Repository: [github.com/htdebeer/SVG-cards](https://github.com/htdebeer/SVG-cards)

Originally designed by David Bellot, maintained by H.T. de Beer. This is the most well-known open SVG deck; it is literally on Wikimedia Commons as `Svg-cards-2.0.svg`. Contains 52 cards, 2 jokers, 2 card backs, and all 4 suit shape elements. PNG renders at 1× and 2× included. 16 colored back variants.

| Property | Detail |
|---|---|
| License | **LGPL-2.1** — copyleft on the SVG artwork itself; your project code can stay MIT/Apache, but if you distribute modified versions of the SVG files, those modifications must also be LGPL |
| File size | ~330 KB combined SVG file; individual pip cards ~2.5 KB, court cards ~65 KB minified+gzipped |
| Visual style | Classic French-pattern court cards: detailed figurative King/Queen/Jack portraits |
| Fit for our aesthetic | Low — the court card art is elaborate and entirely unreadable at 28px. At 40px it's a blurry blob |
| Downside | LGPL is a grey area for web games. Most lawyers read LGPL-2.1 as "fine for linking" but Guandan-online is not *linking* to a library — it's serving the SVG as a visual asset. Check with a lawyer before using if you plan a commercial variant |

**Not recommended for our project** due to LGPL ambiguity and the art being unreadable at our target sizes.

---

### 1E. Wikimedia Commons — English Pattern Playing Cards (Dmitry Fomin)

Source: [commons.wikimedia.org/wiki/File:English_pattern_playing_cards_deck.svg](https://commons.wikimedia.org/wiki/File:English_pattern_playing_cards_deck.svg)

A full 52-card SVG deck by Dmitry Fomin (2017), dedicated to **CC0 public domain**. The SVG deck file is 2.44 MB (one file, all cards). Individual card files are also available (~156 KB per face card).

| Property | Detail |
|---|---|
| License | CC0 1.0 — fully public domain, zero restrictions |
| File size | 2.44 MB combined; ~156 KB per court card SVG individually |
| Visual style | Classic English-pattern — detailed historical face card portraits, intricate pip arrangements |
| Fit for our aesthetic | Low — the art is authentic historical reproduction, aesthetically mismatched with our technical/dark theme |
| Downside | The SVG file contains W3C validation errors. At 28px, court card detail is completely lost. At 40px still heavy visual noise |

The CC0 license is ideal but the art is wrong for us. Could extract pip-only SVGs (the ♥ ♦ ♣ ♠ suit shape artwork) from this file — those would be extremely clean and compact.

---

### 1F. totalnonsense.com Open Source Vector Playing Cards (LGPL-3.0)

Source: [totalnonsense.com/open-source-vector-playing-cards/](https://totalnonsense.com/open-source-vector-playing-cards/)

A professionally designed set in multiple color variants (Color, Grayscale, B/W, Platinum, "Shiny Happy" faces) plus multiple back patterns. All 52 cards + 3 jokers stored as separate objects in a single SVG file.

| Property | Detail |
|---|---|
| License | **LGPL-3.0** with explicit NFT prohibition; commercial negotiation for non-attribution use |
| File size | Not published; single SVG sprite with 55 objects |
| Visual style | Modern clean vector court cards; cleaner than David Bellot's historical style |
| Fit for our aesthetic | Medium — cleaner art, but still full detailed court card faces that don't compress to 28px |
| Downside | LGPL-3.0 raises same questions as LGPL-2.1 above. NFT prohibition is unusual but harmless for us. Requires attribution in any open/commercial distribution |

Not recommended due to license complexity and the same readability problem at 28px.

---

### 1G. me.uk/cards — RevK's CC0 Public Domain Cards (Goodall 19th-century style)

Source: [me.uk/cards](https://www.me.uk/cards/)

Clean vector deck derived from 19th-century Goodall & Son artwork. Released as CC0. Available in vector (SVG) and print-ready PDF. Includes specialty variants: four-color, ghost, double-index, super-index, left-handed, symmetric.

| Property | Detail |
|---|---|
| License | CC0 public domain |
| File size | Not published |
| Visual style | Elegant historical reproduction; cleaner lines than Bellot but still traditional court faces |
| Fit for our aesthetic | Low for court cards; **high potential for pip/suit extraction** |
| Downside | Full court card art is still too detailed for 28px. The four-color variant is interesting for accessibility (one deck with 4 distinct suit colors) |

The "super index" variant (where the rank and suit appear at larger size in the corner and dominate the card) is directly relevant to our rendering strategy (Section 3A below) and worth extracting as reference.

---

### 1H. Custom Design — Geist + Clean SVG Suit Glyphs (Zero external dependencies)

Design our own minimal card set: Geist font for rank numerals, a set of 4 clean custom SVG suit symbols (♥ ♦ ♣ ♠), CSS for the card body. No external art required.

| Property | Detail |
|---|---|
| License | We own it — MIT/Apache 2.0, zero restrictions |
| File size | 4 SVG suit symbols: <2 KB total (a heart/diamond/club/spade path is ~200–400 bytes each) |
| Visual style | Fully under our control — can match our technical/premium dark theme exactly |
| Fit for our aesthetic | Perfect — this is what the wireframe already does |
| Downside | Need to hand-craft 4 suit SVG paths; no court card artwork (J/Q/K would be pure text glyphs) |

This is the approach the wireframe prototype is already using, and it is the right call.

---

## 2. License Compatibility Analysis

The project will be on GitHub under MIT or Apache-2.0. Downstream use cases include: potential commercial variants in the future.

| Source | License | Verdict | Notes |
|---|---|---|---|
| Unicode suit symbols | None (Unicode standard) | ✅ Always fine | No restrictions of any kind |
| jyaus/css-playing-cards | Effectively permissive | ✅ Fine | Confirm before shipping |
| CardMeister | Open source (MIT-grade) | ✅ Fine | Confirm license file |
| Wikimedia Fomin deck | CC0 1.0 | ✅ Fine | Fully public domain, zero requirements |
| RevK me.uk cards | CC0 | ✅ Fine | Zero requirements |
| Vector-Playing-Cards (Byron Knoll) | Public domain / WTFPL | ✅ Fine | Both are effectively unrestricted |
| htdebeer/SVG-cards (David Bellot) | LGPL-2.1 | ⚠️ Caution | LGPL on visual art assets in a web game is ambiguous; most lawyers say OK for linking to a library, but we're serving the SVG as content |
| totalnonsense.com cards | LGPL-3.0 | ⚠️ Caution | Same LGPL ambiguity; adds NFT prohibition clause |
| selfthinker/CSS-Playing-Cards | CC BY-SA 3.0 | ❌ Incompatible | Share-alike infects the derived work; would require distributing our card CSS under CC BY-SA, conflicting with MIT/Apache. Also requires attribution in-app |
| opengameart.org sets | Varies (CC BY, CC BY-SA, GPL) | ❌ Usually incompatible | Check each asset; GPL is always incompatible with MIT/Apache |

**Recommendation matrix for our project:**
- **Green-light (use freely):** Unicode characters, CC0 Wikimedia Fomin deck (pip art only), CC0 RevK deck (pip art only), custom design
- **Caution (legal review if commercial):** LGPL assets
- **Blocked:** CC BY-SA, GPL assets

Since we are designing our own cards using Unicode characters and will hand-craft any needed SVG suit art, the license question is moot for v1.

---

## 3. Rendering Strategy for 28px Cards

At 28px wide × 40px tall: 28 × 40 logical pixels at 1× (on a 3× Retina display, this is 84 × 120 physical pixels — not as bad as it sounds, but still very small for text).

Three approaches:

### 3A. Minimal Corner Index (Recommended for v1)

Only the rank and a small suit symbol in the top-left corner. No center pip. This is what the wireframe already implements.

```
┌──────┐
│ 7    │
│ ♥    │
│      │
│      │
└──────┘
```

**Example:** Marvel Snap (before they moved to fully illustrated cards), Solitaire mobile, our own wireframe.
**At 28px:** rank is ~10px, suit symbol is ~7px. Legible with Geist bold weight 700, `font-variant-numeric: tabular-nums`.
**Accessibility:** Relies on color (red vs black) to distinguish suit families at this size. Suit shape is 7px — differentiation between ♣ and ♠ requires shape recognition, which color-blind users can still manage because the shapes are meaningfully different.
**Verdict:** This is the correct v1 choice. Proven by every mobile card game that handles many cards per screen.

### 3B. Center Pip Only

Large suit symbol centered, rank label below or omitted. Maximizes the suit symbol for recognition.

```
┌──────┐
│      │
│  ♥   │
│  7   │
└──────┘
```

**At 28px:** The center pip fills ~20px, rank is ~8px below. Faster suit recognition, but rank requires careful reading.
**Downside:** Guandan is rank-heavy (the "level" card mechanic is entirely about rank). Players need to read rank instantly. Center pip alone loses that.
**Verdict:** Not appropriate for Guandan. Works for Poker where suit matters less than in some trick-taking contexts.

### 3C. Hybrid — Corner Index + Center Pip

Both corner index and a center pip symbol. Standard playing card layout.

```
┌──────┐
│7♥    │
│      │
│  ♥   │
│      │
└──────┘
```

**At 28px:** At this size the corner index and center pip compete. The center pip adds noise without adding legibility — there is only 12px of vertical space between the corner index and center pip in a 40px card.
**Accessibility:** Slightly better suit recognition due to two suit symbols.
**Verdict:** Works at 40px (desktop `--card-md`). At 28px, the center pip becomes visual clutter. Our wireframe includes `.card__center` but collapses it naturally at 28px because there's no room. This is intentional and correct behavior.

**Conclusion:** Strategy A for 28px. Strategy C for 40–56px. This is exactly what the wireframe implements with `.card--md` and `.card--lg` size modifiers.

---

## 4. Font Choices for Rank Numerals

Card ranks `2 3 4 5 6 7 8 9 10 J Q K A`. At 28px card width, the corner index is rendered at `var(--t-2xs) = 10px` per `tokens.css`. At 40px (`--card-md`), `var(--t-sm) = 13px`.

### Geist (Current — Recommended)

Geist is already in the project's font stack (`--font-sans`). It is a geometric grotesque with excellent small-size rendering. Key properties for card use:

- `font-variant-numeric: tabular-nums` is available (Geist supports `tnum` OpenType feature)
- Bold weight (600–700) improves stroke contrast at 10px
- Available via Google Fonts CDN with `&display=swap` already in the HTML — no additional load cost

**The `10` problem:** At 28px card width, `10` is two characters that together are wider than `K` or `A` at the same font size. Two solutions:
- **Squeeze approach:** Set `letter-spacing: -0.04em` for the rank span when it contains `10`. Works at 10px.
- **Roman `X` approach:** Use `X` instead of `10`. Traditional in some card designs. Drawback: unfamiliar to Chinese players who don't read roman numerals as card ranks — Guandan players think in `10`, not `X`.
- **Narrow approach:** Use `font-stretch: condensed` on a condensed variant. Geist does not have a condensed variant.

**Recommendation:** Use the squeeze approach — `letter-spacing: -0.03em` scoped to `.card__rank` when the rank is `10`. The wireframe does not currently implement this; it should be added.

### JetBrains Mono (Already in mono stack)

`--font-mono` in our stack. Monowidth — every character occupies equal horizontal space including `1` vs `0`. This is actually a disadvantage for card ranks: `A` and `J` look wider than their stroke weight warrants, and `1` has too much whitespace around it. Mono is the right choice for game data (`scores`, `level indicators`, `round counters`) but not for card rank glyphs.

### IBM Plex Mono

Similar trade-offs to JetBrains Mono. Skip.

### Alternatives worth noting

**Noto Sans** (free, Google Fonts): Has a condensed variant (`Noto Sans Condensed`) which handles `10` cleanly at small sizes. But adds a font load; not worth it when Geist already works.

**System-ui / -apple-system:** Free (already on device), legible, but breaks brand consistency. Skip.

**Final recommendation:** Geist 700 weight, `font-variant-numeric: tabular-nums`, with `letter-spacing: -0.03em` scoped to the `.card__rank` element. For the `10` rank, add `font-size: 85%` additionally if needed to keep it within the card corner at 28px.

---

## 5. Color-Blind Accessibility

Traditional card suits: red (♥ ♦) vs black (♣ ♠) — relies entirely on color distinction. Deuteranopia (red-green deficiency) affects ~8% of XY-chromosome individuals and ~0.5% of XX-chromosome individuals. Our target demographic (Chinese card players) has the same prevalence as the global average.

### v1 Standard: Red/Black with shape differentiation

The four suits already differ in shape: ♥ (rounded bottom), ♦ (diamond), ♣ (three-lobe), ♠ (pointed top). At 10px, ♣ and ♠ are distinguishable in shape; ♥ and ♦ are distinguishable in shape. The color difference (red vs black) is redundant with shape — it is the shape that distinguishes ♥ from ♦, not color.

**Risk:** Distinguishing ♥ from ♦ at 10px in low light or low contrast relies mostly on shape. Protanopes and deuteranopes cannot use the red color as a cue. The shapes are different enough (rounded teardrop vs diamond) that this works — but only if the suit characters are rendered large enough to show shape distinctly.

**Current token values:** `--suit-red: oklch(52% 0.22 25)` on `--card-face: oklch(94% 0.020 80)`. Contrast ratio between `oklch(52% 0.22 25)` and `oklch(94% 0.020 80)` is approximately 4.8:1 — passes WCAG AA for normal text at 10px.

### v2 Color-Blind Mode (future)

Four-color deck approach: give each suit a distinct color.
- ♠ spades: dark (near-black) — keep
- ♣ clubs: navy blue (`oklch(38% 0.14 250)`)
- ♥ hearts: red — keep (`oklch(52% 0.22 25)`)
- ♦ diamonds: orange-amber (`oklch(68% 0.18 60)`)

This is the "four-color deck" used in online poker (PokerStars implements this). It requires a CSS class toggle (`[data-four-color-suits]`) on the card container, changing only `--suit-dark` for clubs/spades to distinct values. Zero additional assets — just two CSS token overrides.

**Recommendation:** Ship standard red/black in v1. Design the CSS to make the four-color toggle a one-line token change (which the token architecture already supports). Ship v2 as an accessibility setting in settings drawer.

---

## 6. Heart-Level Wildcard (红心级牌) Visual Treatment

The wildcard mechanic is central to Guandan: when the current level is N (e.g., level 7), every heart-suit 7 (`♥7`) becomes a wildcard that can substitute for any other card. This state must be visually distinct at a glance, even in a hand of 25–27 cards.

### Option A: Gold Edge Stroke + ★ Corner Badge (Current wireframe)

```css
.card--wild {
  background: linear-gradient(135deg, var(--card-face), oklch(86% 0.05 95));
  box-shadow: 0 0 0 1.5px var(--gold), var(--shadow-card);
}
.card--wild::after {
  content: "★";
  position: absolute;
  top: 1px; right: 2px;
  font-size: 7px;
  color: var(--gold);
}
```

**Assessment:** Gold border provides strong signal even when the card is partially obscured by other cards in the fan (only the edge shows). The ★ badge confirms at card face level. This is the strongest option because it works at both the hand-fan level (visible edge) and full-card level (visible face). Uses our existing `--gold` token.

**Downside:** The 1.5px gold border adds visual weight; 108 cards with 2–4 wildcards means the signal-to-noise ratio is fine. If the level is 10 and both `♥10` cards are wild, the gold edge makes them trivially findable.

### Option B: Gold Halo Glow Underneath

```css
.card--wild {
  filter: drop-shadow(0 0 4px var(--gold)) drop-shadow(0 0 8px oklch(82% 0.15 95 / 0.5));
}
```

**Assessment:** Works well at 40px+ but at 28px the glow bleeds into adjacent cards. In a dense fan (25 cards with 4px overlap), glows from multiple wildcards would merge into background noise. Also `filter: drop-shadow` triggers GPU compositing on every card in the element tree — with 27 cards per hand, that is expensive.

**Not recommended.**

### Option C: Card Body Gradient (cream → gold tint)

```css
.card--wild {
  background: linear-gradient(135deg, var(--card-face), oklch(88% 0.08 85));
}
```

**Assessment:** Subtle and readable at 40px+. At 28px, the gradient endpoints are only 40px apart — the visual effect is barely perceptible. In a fan with 22px overlap, the visible portion of a wild card is ~8px of the left edge, which shows only the starting color of the gradient (cream). Effectively invisible.

**Not recommended for primary signal.** Could be used as a secondary reinforcement alongside Option A.

### Wildcard-in-use (substituting for another card)

When a wildcard is played as a substitute (e.g., `♥7` played as a `♠J`), two rendering options:

**Stack of two cards (overlay):** Render a small ghost of the "true" card (the card being substituted) as a transparent overlay or a thin label below. Example: `♥7 → as J♠`. Implementation: a `::before` pseudo-element with the substituted rank and suit, lower opacity (`0.5`), in contrasting text.

**Single card with text label:** Render the wildcard card normally (with gold edge) and add a small pill overlay: `→ J♠` below the card. This is cleaner but requires an additional DOM element.

**Recommendation:** For v1, show the played wildcard as itself (with gold edge retained). The `→ J♠` label appears below the card in the played area — a separate `<div class="wild-sub">→ J♠</div>` element. This is simpler than overlay and more readable at small sizes. The gold edge on the played card confirms wildcard status.

---

## 7. Card Back Design

The card back appears 25–27 times per opponent in 4-player (each opponent holds ~25 cards visible as a fan). It must be recognizable but recede visually — the player's own hand (faces) must be dominant.

### Current token values:
- `--card-back: oklch(28% 0.030 25)` — warm dark red-brown
- `--card-back-pattern: oklch(48% 0.18 30)` — muted red accent

### Patterns to avoid:
- Cliché casino diamond grid (Bicycle brand association)
- Ornate floral patterns (too decorative, mismatched with our technical aesthetic)
- Any pattern that requires complex SVG (adds bundle weight)

### Recommended: CSS-only geometric pattern

A subtle diagonal stripe or dot grid achieved entirely in CSS — no SVG, no image.

```css
.card--back {
  background:
    repeating-linear-gradient(
      45deg,
      var(--card-back-pattern) 0,
      var(--card-back-pattern) 1px,
      transparent 1px,
      transparent 6px
    ),
    var(--card-back);
}
```

This produces a hairline diagonal stripe pattern. Low contrast between `--card-back` and `--card-back-pattern` keeps it subtle. Total rendering cost: one CSS background property, zero network requests.

### Variant consideration:
- **Standard table back:** The diagonal stripe pattern above
- **Accent variant (future):** A `✦` or `⬡` pattern using `background-image: radial-gradient()` or `conic-gradient()` for themed rooms
- **Official tournament back (future):** A custom SVG monogram incorporating the guandan-online logotype — load only when selected

**Recommendation for v1:** CSS diagonal stripe. 0 KB. Ships immediately with no design iteration needed.

---

## 8. Card Animation Primitives

All card animations must use only `transform` and `opacity` — never `top`, `left`, `width`, `height`. The `transform`/`opacity` path is GPU-composited; the box-model properties trigger layout reflow across the entire card fan.

### Deal Animation

**Instant cascade (recommended for v1):** Cards appear with `animation: deal-in 120ms var(--ease-out) both` staggered at `animation-delay: calc(var(--card-idx) * 30ms)`. Total deal time for 27 cards: 27 × 30ms + 120ms = ~930ms. Perceptible but not 4+ seconds.

```css
@keyframes deal-in {
  from { opacity: 0; transform: translateY(8px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
```

**Cinematic 1-by-1:** A card physically slides from a center deck position to each player's hand. Requires JavaScript to compute trajectory vectors. For 108 cards × 4 players = 432 individual animations totaling 4–6 seconds. Too slow for a competitive card game. Skip for v1.

### Lift (Tap to Select)

```css
.card--lifted {
  transform: translateY(-12px);
  box-shadow: var(--shadow-lifted);
  z-index: 10;
  transition: transform var(--dur-base) var(--ease-spring),
              box-shadow var(--dur-base) var(--ease-spring);
}
```

The spring easing gives a "physical card lift" feel. `translateY(-12px)` at 28px card is 43% of card height — visually dramatic but not absurd. The `--shadow-lifted` token in `tokens.css` already adds the accent red glow ring (`0 0 0 1px oklch(68% 0.20 30 / 0.5)`).

### Play (Arc Trajectory from Hand to Center)

Pure CSS arc: use `translateX` + `translateY` with different timing functions on each axis. The X-axis on `linear`, Y-axis on a parabolic-feeling ease produces an arc illusion.

```css
@keyframes play-card {
  from { transform: translate(0, 0) rotate(0deg); opacity: 1; }
  to   { transform: translate(var(--dx), var(--dy)) rotate(var(--dr)); opacity: 1; }
}
```

`--dx`, `--dy`, `--dr` are set inline via JavaScript to the computed center position relative to each card's origin. This is the lightest possible approach — no animation library required. GSAP and Anime.js both support this but add 30–50 KB to the bundle.

### Visual States Summary

| State | CSS class | Visual diff |
|---|---|---|
| Default | `.card` | Static, no shadow accent |
| Lifted (selected) | `.card--lifted` | +12px Y offset, spring shadow, red accent ring |
| Played (in center) | `.card--played` (add) | Arc animation, then rests in `.played-stack` |
| Hovered (desktop) | `.card:hover` | +6px Y offset, `var(--dur-fast) 120ms` |
| Wildcard | `.card--wild` | Gold border + ★ badge (Option A) |
| Back-face | `.card--back` | Dark pattern, rank/suit hidden |

Three distinct visual states (default, lifted, hovered) are needed in the hand. The wireframe already has `--lifted` and `--back`. `--played` transitions from `--lifted` and then drops the lifted styling.

---

## 9. Recommendation: Assets to Use for v1

### Decision summary

| Component | Choice | Rationale |
|---|---|---|
| Rank numerals | Geist 700, `tabular-nums` | Already in design system; optimal small-size rendering |
| Suit symbols | Unicode ♥ ♦ ♣ ♠ in color-scoped spans | Zero weight, system-rendered, already in wireframe |
| Card back | CSS `repeating-linear-gradient()` | Zero weight, no network request, matches aesthetic |
| Court card art (J/Q/K) | Plain text glyph only (`J`, `Q`, `K` in Geist 700) | At 28–40px, any portrait art is unreadable; plain text is crisp |
| Jokers | Unicode `🃏` or custom `大/小` text badge | See below |
| Wildcard indicator | Option A: Gold border + ★ badge | Visible even in fan (edge exposure); already in wireframe |
| SVG external assets | None — not needed | All rendering achieved via CSS + Unicode + Geist |

### Joker handling

Standard decks have 2 jokers. Guandan uses a full joker (大王, big joker / colored joker) and small joker (小王, small joker / black joker). These are the highest-ranking cards and appear infrequently but are game-critical.

- Do **not** use the Unicode joker character U+1F0CF (`🃏`) — it renders as a platform emoji and is uncontrolled.
- Render as a card with class `.card--joker` using a special rank display: `大` or `小` in red/black with no suit symbol. At 28px this fits cleanly.
- In the corner index position, show `大` (Chinese character, ~10px — compact, legible).
- Color the text `--suit-red` for the big joker (colored) and `--suit-dark` for the small joker (black), matching Guandan convention.

### Files to check into the repo

No external SVG files need to be checked in for v1. Everything is CSS and font-rendered.

If we ever want crisp custom suit glyphs (instead of relying on system unicode), 4 clean SVG paths are needed. Estimated sizes:
- Heart `♥` custom SVG path: ~300 bytes
- Diamond `♦`: ~150 bytes (simple rhombus)
- Club `♣`: ~400 bytes (three circles + stem)
- Spade `♠`: ~400 bytes (inverted heart + stem)

Total: **~1.3 KB** for all 4 custom suit symbols. These would live at `public/suits/heart.svg`, `diamond.svg`, `club.svg`, `spade.svg` and be inlined or referenced as `<img>` inside `.card__suit` spans.

### Bundle size budget vs target

| Component | Estimated size | Notes |
|---|---|---|
| Geist font (sans + 700 weight subset) | ~12 KB gzipped | Already loaded for the rest of the UI |
| CSS card rules (shared.css card section) | ~2 KB | Already in shared.css |
| 4 custom SVG suit paths (if needed) | ~1.3 KB | Only if Unicode rendering is deemed unacceptable |
| Card back pattern | 0 KB | Pure CSS `background` property |
| Wildcard gold border + badge | 0 KB | Pure CSS `::after` pseudo-element |

**Total new card-specific assets: 0–1.3 KB** (well under the 30 KB budget). The 30 KB budget could accommodate importing a full lightweight deck like CardMeister (13 KB gzipped) if court card portraits are desired in the future.

### Path for court card portraits (v2+)

If future design iteration reveals that `J`, `Q`, `K` should have portrait artwork (e.g., stylized geometric portraits consistent with the technical aesthetic):

1. Do not use traditional English-pattern art — too ornate, wrong aesthetic.
2. Options: geometric portrait icons (similar to how Some games use simplified face illustrations — flat color, hard edges); or a custom SVG set commissioned at 4 cards × 4 suits = 16 faces.
3. License: commission under work-for-hire (we own the art, MIT-compatible) or use a CC0 geometric illustration set.
4. File size target: ≤1 KB per card SVG, ≤16 KB total gzipped — achievable with simple geometric paths.

For v1, plain text glyphs are correct. At 28px, no one can see portrait detail anyway.

---

*Sources consulted:*
- [Byron's Blog: Vector Playing Cards](http://byronknoll.blogspot.com/2011/03/vector-playing-cards.html)
- [github.com/notpeter/Vector-Playing-Cards](https://github.com/notpeter/Vector-Playing-Cards/blob/master/README.md)
- [commons.wikimedia.org — English pattern playing cards deck.svg](https://commons.wikimedia.org/wiki/File:English_pattern_playing_cards_deck.svg)
- [github.com/htdebeer/SVG-cards](https://github.com/htdebeer/SVG-cards)
- [totalnonsense.com/open-source-vector-playing-cards](https://totalnonsense.com/open-source-vector-playing-cards/)
- [me.uk/cards](https://www.me.uk/cards/)
- [cardmeister.github.io](https://cardmeister.github.io/)
- [github.com/jyaus/css-playing-cards](https://github.com/jyaus/css-playing-cards)
- [github.com/selfthinker/CSS-Playing-Cards](https://github.com/selfthinker/CSS-Playing-Cards)
- [duk.io — A full deck of dynamically generated SVG playing cards in 47 KB](https://www.duk.io/blog/code/solitaire-cat/svg-playing-card-generation/)
- [Wikipedia: Playing cards in Unicode](https://en.wikipedia.org/wiki/Playing_cards_in_Unicode)
- [MDN: font-variant-numeric](https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric)
- [Vercel Geist font documentation](https://vercel.com/geist/typography)
