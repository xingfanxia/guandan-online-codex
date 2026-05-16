# Guandan (掼蛋) Existing Implementations Research

*Researched: 2026-05-16. Purpose: inform architecture and UX decisions for guandan-online (web-based multiplayer, landscape mobile).*

---

## Open-source projects

### 1. CrazeGuandan — zhengprajana

**Repo**: https://github.com/zhengprajana/CrazeGuandan  
**Stars**: 0 | **Forks**: 0 | **License**: MIT (implied by README) | **Last push**: 2026-02-23 (created same day — one-day project)

**Platform / tech stack**  
Web browser. React 19 + TypeScript + Vite + Tailwind CSS v4 + Motion (Framer Motion successor). Gemini API wired in as a dependency (for future AI enhancements). SQLite via `better-sqlite3` is in `package.json` but there's no server beyond a thin Express scaffold — almost certainly unused. No Socket.IO, no multiplayer infrastructure.

**Implementation completeness**  
Prototype / early scaffold. The file tree is extremely thin: `src/` has only `App.tsx`, `components/Card.tsx` (the sole component), `types.ts`, `utils/`, and `main.tsx`. The README describes full Guandan rules (wild cards, all hand types, leveling, bomb priority) and mentions "AI Opponents," but there is no evidence of a working rules engine, game loop, or AI in the checked-in code. The `.env.example` contains `GEMINI_API_KEY`, suggesting the AI was planned but not built. This is effectively a project skeleton bootstrapped in a few hours.

**Multiplayer model**: None. Single-player only by design.

**AI bots**: Described in README, not implemented.

**Key UX patterns worth borrowing**  
- "Hardware/Specialist Tool" aesthetic described in README — dark, precise, premium — is a strong design direction for a serious card game
- Motion library for animations is the right call; Framer Motion successor has lower bundle overhead

**Key UX patterns to avoid**  
- Nothing to avoid specifically; the codebase is too thin to have made mistakes

**Reusable code/assets**  
Not meaningfully reusable. The sole Card component is a placeholder. MIT license would permit reuse if there were anything worth taking.

**Verdict**: Abandoned skeleton. Zero production value. Useful only as a reminder that "uses Gemini API" does not mean "has working AI."

---

### 2. GuanDanInOffice — LiUshin

**Repo**: https://github.com/LiUshin/GuanDanInOffice  
**Stars**: 13 | **Forks**: 2 | **License**: MIT | **Last push**: 2026-01-07 (created 2026-01-05 — two days of development)

**Platform / tech stack**  
Web browser, LAN-first. React + TypeScript + Vite + Tailwind CSS v3. **Node.js backend with Socket.IO** for real-time multiplayer. Ships as a Windows `.exe` via `pkg` packaging (the `guandan-game.exe` is checked into the repo — unusual but functional). Docker Compose and PM2 deployment paths documented. The "Office" in the name is literal: this is designed for colleagues on the same Wi-Fi.

**Implementation completeness**  
Surprisingly complete for a two-day project. Features shipped:
- Full 4-player online multiplayer over Socket.IO
- Match-Game two-tier architecture (Match = full 2→A campaign; Game = one hand)
- Complete rule set: all standard hand types, wild cards (red heart level card), 进贡/还贡 (tribute/return tribute), 抗贡 (tribute resistance with double jokers), 接风 (first-play right after tribute), level progression, 双扣/单扣/保级 upgrade logic
- AI bots that auto-fill empty seats, with disconnect reconnect support
- **"摸鱼模式" (Stealth Mode / Boss Key)**: press `i` to instantly overlay a fake VS Code IDE interface — a genuinely clever and funny office UX
- **智能理牌 (Smart Card Sort)**: toggle between normal sort and a "straight flush view" (同花顺视图) where same-rank cards are stacked vertically and aligned by suit across the hand, with straight flush combinations highlighted
- In-room chat with quick emoji, chat bubbles over player avatars (auto-dismiss 5s)
- Skill card mode (5 special ability cards per player) — a non-standard extension layered on top, with plugin architecture that shares 95%+ of core game code
- Room list for browsing active games
- v2.0 changelog shows significant architectural refactoring, especially Match-Game separation and skill system lifecycle management

**Multiplayer model**: LAN online. Host runs the `.exe`; other players join via IP in browser. No TURN/relay — requires shared network. Docker deployment makes internet-accessible hosting possible.

**AI bots**: Yes — single difficulty level. Bot fills missing seats. Bot uses emoji chat. Bot plays skills in skill mode. Approximately 256 lines (`bot.ts`), so it's competent but not deep.

**Key UX patterns worth borrowing**  
- **Boss Key / stealth overlay** — unique, fun, practically useful. Worth porting.
- **Straight flush view for hand sorting** — the 2D stacked view (same rank vertical, suit horizontal) makes 27-card hands scannable at a glance. This is a genuinely good UX insight for Guandan where straight flushes are the highest non-joker bomb.
- **Chat bubbles over avatars** with 5s auto-dismiss — unobtrusive, spatial, avoids a separate chat panel taking up screen real estate.
- **Socket.IO + Node.js backend architecture** — battle-tested pattern for this type of game. The `Room → Match → Game` object hierarchy is clean.
- **Auto-seat fill with bot** on start — reduces friction of waiting for 4 humans.

**Key UX patterns to avoid**  
- **Skill cards** (无中生有, 顺手牵羊, etc.) are a fun experiment but break competitive purity. For guandan-online, this should be a toggled mode, not default.
- **No mobile support** — Tailwind CSS with click-based card interaction, no touch handling mentioned.
- **Single difficulty bot** — fine for casual LAN play, limiting for solo training.

**Reusable code/assets**  
- `src/shared/rules.ts` — full Guandan rules engine including hand type detection, comparison, and wild card handling. MIT licensed. Worth studying as a reference implementation.
- `src/shared/bot.ts` — 256-line bot, usable as a starting point.
- `src/shared/types.ts` — domain type definitions (Card, Rank, Suit, Hand, HandType enums).
- The Socket.IO room/match/game server architecture in `src/server/` is a solid pattern to adapt from.
- No graphical assets. Cards are rendered as styled HTML divs — selection is `ring-2 ring-blue-500 -translate-y-4` (blue ring + 1rem lift). Simple, works.

---

### 3. guandan-windows — dengweiqh

**Repo**: https://github.com/dengweiqh/guandan-windows  
**Stars**: 1 | **Forks**: 0 | **License**: Apache-2.0 | **Last push**: 2026-04-26 (created 2026-04-26 — very recent)

**Platform / tech stack**  
The name is misleading — this is not Windows-native. It runs in web browsers and ships as an **Electron app** for desktop (Windows/Mac). Capacitor config is present (`capacitor.config.ts`, app ID `com.guandan.master`) with Android build guide and Harmony WebView guide, indicating **mobile app packaging is planned or in progress**. Topics include: `electron`, `react`, `socket.io`, `typescript`, `vite`, `zustand`. Tech stack: React 18 + TypeScript + Vite + Zustand (state) + Framer Motion + Tailwind CSS + Socket.IO + Electron + electron-builder.

**Implementation completeness**  
The most complete of the three open-source implementations. Significant features:
- **Four-tier AI difficulty**: easy / medium / hard / master, each with distinct strategy logic (`ai-strategy-*.ts` files). Master difficulty uses residual-search endgame, opponent modeling, trap/counter-bomb play, and A-level win-rate optimization.
- **AI runs in a Web Worker** (`src/workers/`, `src/lib/aiWorkerClient.ts`) to prevent UI jank during deep search.
- Full A-level rules: 冲关 (A-level breakthrough), 降级 (demotion on failure), 三次不过回2 (3 failures reset to level 2).
- Complete tribute system with full TributePhase page — AI automatically tributes highest non-wild card, AI returns lowest card ≤ 10. Player can select their card interactively.
- **Card drawing phase** (GroupingPhase): animated card draw to determine teams and dealer, with deliberate result manipulation to always produce 2 red / 2 black (ensuring balanced team assignment without leaving it to chance).
- **Dealing animation**: cards dealt one at a time at 80ms intervals, flip animation, sort animation sequence (dealing → flipping → sorting → done).
- **Voice audio system**: per-card-value voice calls (`single_2.wav` through `single_A.wav`), per-hand-type calls (bomb, straight_flush, plate, etc.), pass variants, chat phrases. BGM. AudioContext-based management with volume control.
- Multiple game modes: classic solo, campaign (story progression), LAN multiplayer via Socket.IO.
- Settlement page with cinematic ambient glow effects (win = gold radial bloom, loss = crimson).
- Tutorial page.
- Multilingual README (ZH/EN/RU/JA/KO) suggesting intent for wider distribution.
- Dev metrics panel in development mode showing AI computation time.

**Multiplayer model**: LAN online via Socket.IO (separate `server/index.js`). Also Electron desktop app for local play.

**AI bots**: Yes — four difficulty levels with detailed per-level strategy descriptions. This is the most serious AI implementation of the three.

**Key UX patterns worth borrowing**  
- **AI in Web Worker** — essential for master-level AI that does deep search. Copy this pattern exactly.
- **Dealing animation sequence** (dealing → flipping → sorting) — sets the rhythm for each round, gives players time to orient. The 80ms-per-card pacing feels right.
- **Card draw for team assignment** with animation and staggered reveal — more engaging than random assignment.
- **Voice callouts per card/hand-type** — enormously increases game feel. The `voices/` directory with WAV files per card value is reusable architecture (though the audio assets themselves would need original recording or licensed sourcing).
- **Tribute phase as a full page/overlay** with explicit card selection UI — correct approach. Tribute is a critical game moment and deserves dedicated UI, not a modal.
- **`luxury-*` color palette** (crimson, gold, midnight, obsidian, ivory) with Tailwind custom tokens — the premium dark aesthetic works well for a card game.
- **Rule presets** (classic vs tournament) with configurable `RuleProfile` — good extensibility pattern.
- **Campaign mode** alongside online play — gives solo players a progression path.

**Key UX patterns to avoid**  
- **GroupingPhase result manipulation** (always 2 red / 2 black): the code deterministically assigns reds to p1/p3 and blacks to p2/p4. This means the card-draw is purely theatrical — no randomness in team assignment. Fine for AI where it doesn't matter, but feels misleading for competitive human play.
- **Capacitor without landscape lock**: the `capacitor.config.ts` sets no orientation constraint. Mobile landscape is not a solved problem in this codebase despite the packaging intent.
- **Single Zustand store** (`gameStore.ts`) for all state: at this complexity level, a single store risks causing unnecessary re-renders across the tree. Splitting by concern (game state, UI state, multiplayer state) would be cleaner.
- **Custom luxury font (`font-cinzel`, `font-outfit`)** loaded without a fallback strategy: on slow connections or before fonts load, card face text can jank. For a game, font loading must be part of the loading sequence.

**Reusable code/assets**  
- **`src/lib/rules.ts`** (303 lines, Apache-2.0): hand validation, comparison, rule presets. The most production-grade rules implementation of the three.
- **`src/lib/ai.ts` + strategy files** (Apache-2.0): four-difficulty AI with endgame search, opponent modeling. The architecture is extractable.
- **`src/lib/deck.ts`**: two-deck Guandan deck creation with level card tagging.
- **`src/lib/audio.ts`**: AudioContext-based audio manager with BGM, voice, and Web Audio API fallback.
- **Voice audio files** (`public/voices/*.wav`): per-card voice callouts. **License unclear** — repo is Apache-2.0 but audio attribution is not documented. Do not reuse without tracing the original recordings.
- **No card face graphics**: cards are CSS-rendered with suit symbols and rank text.

---

## Commercial app UX scan

### Tencent 大掼蛋 (Da Guandan)

The dominant commercial app. Q-cute cartoon aesthetic, vivid characters, custom table scenes, proprietary "smart audio-visual calibration." Features: coin races, guild competitions, branded tournaments. Multiple modes: classic, no-shuffle, crazy-doubling. Matchmaking by skill level.

**Table layout**: 4-player cross layout (player at bottom, partner at top, opponents left and right). Portrait orientation as primary. The status bar is a compact single row (team scores + level + controls) to maximize the table area.

**Hand display**: Standard straight row of overlapping cards at the bottom of screen. 27 cards at portrait widths is tight — cards are significantly overlapped (only rank/suit corner visible for most cards). Tapping a card lifts it slightly; multiple selected cards lift together. No curved fan in the app — straight row is the industry standard for touch interfaces.

**iPad / tablet**: Two-row hand display where cards spread across two lines. This is the correct answer for 27 cards on a larger screen: one row of ~14, one row of ~13, grouped by the sort algorithm.

**Card selection**: Tap to lift (toggle). No drag-to-play. Separate "Play" button confirms the selection. This is the universal convention across Chinese card game apps — do not deviate from it without strong reason.

**Auto-arrange (理牌)**: Present as a persistent button, typically bottom-right. The standard sort is: Jokers → level cards → by rank descending → by suit. Some apps offer a secondary "optimized sort" that groups potential hand combinations. The Guandan-比赛版 app offers independent "横向" (landscape) / "竖向" (portrait) arrange buttons.

**Tribute UI**: Dedicated full-screen or modal overlay for the 进贡/还贡 phase. Shows who owes tribute to whom with arrows/indicators. Player selects a card, confirms. Anti-tribute (抗贡) is announced with a banner overlay.

**Animation style**: Snappy for card play (50–150ms card slide), cinematic for round endings and level-up (2–3 second celebration with confetti/fireworks). Bombs and straight flushes get special visual effects (flash, shake, particle burst).

---

### JJ掼蛋

JJ platform is one of the most-played competitive card game platforms in China (known for 斗地主/升级). Their Guandan client follows similar conventions.

**Table layout**: Portrait, 4-player cross. Player's hand at the bottom; card counts shown for opponent's hands (face-down stack indicators). Chat via pre-set quick messages.

**Animation style**: More restrained than Tencent — snappy is preferred over cinematic. Competitive players do not want long celebration animations blocking the next game.

**Ranking / matchmaking**: ELO-style rating system with visible rank badges. This matters for a competitive app but is out of scope for initial guandan-online.

---

### 微乐掼蛋 (Weile Guandan)

Regional app with strong presence in Jiangsu/Anhui markets.

**Table layout**: Can toggle between 3D table scene and flat 2D layout. 3D adds visual interest but costs performance and can occlude cards. For a web app, 2D flat is the pragmatic choice.

**理牌 (card arrange)**: Described as offering both "横向理牌" and "竖向理牌" — horizontal sort and vertical sort. For landscape mobile where the hand is at the bottom (landscape means the hand area is wider), horizontal sort is standard.

**Tribute UI**: Distinct screen with animated card-passing effect (card physically flies from loser's hand to winner's pile). Worth implementing even as a simpler CSS transition — the visual of a card moving across the table communicates the rule.

---

## Asset availability

### Card face graphics

The three open-source repos all render cards as styled HTML/CSS with rank text and Unicode suit symbols (♠ ♥ ♣ ♦). No image assets. This approach is:
- Fast (no image loads)
- Infinitely scalable
- Fully customizable per theme
- Acceptable for web play

If custom illustrated cards are desired:

| Source | License | Quality | Notes |
|--------|---------|---------|-------|
| https://www.me.uk/cards/ | Public domain | Good standard | No attribution required |
| https://github.com/htdebeer/SVG-cards | LGPL | High quality | Full deck SVG, widely used |
| https://github.com/saulspatz/SVGCards | Public domain | Jumbo index | PNG + SVG, sprite sheets |
| https://github.com/cardmeister/cardmeister.github.io | Public domain | Minimal/custom-element | 52 cards in 14KB web component |

**Recommendation**: Start with CSS-rendered cards for speed. If custom art is later commissioned, use a 2D illustrated style consistent with the project aesthetic rather than photorealistic.

### Card back designs

Not available from any of the above repos in distinct/interesting form. Custom card back art should be original or commissioned.

### Sound effects

| Source | License | Coverage |
|--------|---------|---------|
| Pixabay (`/sound-effects/search/playing-cards/`) | Royalty-free, no attribution | Shuffle, deal, place |
| Freesound.org (e.g., el_boss/571575) | CC0 | Individual deal sounds |
| Zapsplat playing cards pack | Free, no attribution required | 85 sounds, all interactions |

The `guandan-windows` repo includes per-card voice callouts (`single_2.wav` through `single_A.wav`, `bomb.wav`, `straight_flush.wav`, etc.) but their license is not clearly documented within the repo (Apache-2.0 covers code; audio provenance is unknown). Do not reuse these without investigation.

**Recommendation**: Source card place/shuffle SFX from Pixabay or Zapsplat (no attribution required). Record or commission Chinese voice callouts separately — this is a significant differentiator that all polished Guandan apps have and no open-source implementation handles cleanly.

---

## Direct lessons for guandan-online

**Borrow from the ecosystem:**

- **Straight row hand display, not a fan**. Every commercial app uses overlapping straight rows. Fans look nice in screenshots but are worse for 27-card hands at small mobile widths. Use the two-row layout on wider screens (iPad, landscape phone).
- **Tap to select / confirm button to play**. This is the universal convention. Drag-to-play exists in some poker apps but is not idiomatic for Guandan. Tap-lift + Play button is what players expect.
- **AI in a Web Worker** (guandan-windows pattern). Non-negotiable if implementing anything above easy difficulty. Main thread AI locks the UI.
- **Socket.IO + Node.js** for multiplayer is proven across two implementations. Not worth reinventing with WebSockets raw or alternatives.
- **Room → Match → Game** three-tier object hierarchy (GuanDanInOffice). Separating the persistent room from the scoring campaign (match) from the individual hand (game) prevents state leak between rounds.
- **Bot auto-fill for missing seats**. Real multiplayer Guandan requires 4 humans; bots must bridge the gap. Design the bot interface so AI and human players are interchangeable at the socket layer.
- **Tribute phase as a dedicated overlay with explicit card selection** — not a modal with a dropdown. The card-passes-across-table animation in commercial apps communicates the mechanic clearly.
- **Dealing animation + sort animation** before gameplay begins. Sets expectations, gives players a moment to prepare, and is a visual delight that costs very little to implement.
- **Pre-set quick chat messages + emoji bubbles over avatars**. In-game chat is high-friction on mobile; emoji and short phrases are sufficient and social enough.
- **Voice callouts per card/hand-type**. This is a major game-feel differentiator. Plan for it in the audio manager architecture from day one even if assets arrive later.
- **Rule presets (classic / tournament)**. Regional Guandan rule variants are real. Configuration at the room level is the right granularity.
- **Apache-2.0 on guandan-windows means its rules engine and AI strategy files can be adapted** with attribution. This is the highest-value borrowable asset in the open-source landscape.

**Do not repeat these mistakes:**

- **Do not hardcode orientation** without explicitly locking to landscape in Capacitor/manifest for landscape-mobile builds. `guandan-windows` shipped Capacitor config with no orientation lock.
- **Do not store all game state in one Zustand store**. At 27 cards × 4 players + tribute + level + multiplayer sync, a monolithic store causes unnecessary re-renders. Split: game logic state | UI/animation state | network sync state.
- **Do not use Lucide icons** (CrazeGuandan does; it's an AI slop default). Use Phosphor or Heroicons.
- **Do not render cards as `<img>` tags** without a loading strategy. CSS-rendered cards (rank + suit symbol as text) sidestep font-loading and image-loading races during the dealing animation.
- **Do not skip A-level rules** in a first implementation. `guandan-windows` ships them and they're essential to competitive play. The `三次不过回2` (3 A-level failures → back to 2) rule in particular trips up scorers that omit it.
- **Do not make the boss-key/stealth mode the signature feature** — it's fun but signals the target audience is "playing at work," not "playing seriously." For guandan-online, focus on serious competitive UX.
- **Do not make tribute interactive during first-turn latency**. The tribute phase always needs a network round-trip in online multiplayer. Design the UX to handle a 100–500ms wait gracefully (show an interim "waiting for tribute" state) rather than blocking the UI.
- **For landscape mobile specifically**: plan the hand area as a single row of cards spanning the full width at bottom, with player info/controls in the top-left and top-right corners, and the table center occupying the middle 60% of screen height. The three open-source implementations all assume portrait (vertical phone or widescreen desktop) and none solve landscape phone layout.
