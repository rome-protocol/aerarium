# Handoff: Aerarium — Connected Lane Screens (Ethereum + Solana)

## Overview
Aerarium is a cross-VM lending & borrowing money market on the **Rome** network: **one shared liquidity pool with two front doors** — an Ethereum (EVM) wallet lane and a Solana wallet lane. This handoff covers the **connected (post-gate) experience**: the screens a user sees *after* they pick a gate on the landing page and connect a wallet.

There are **two separate per-lane screens** — `/evm` (Ethereum) and `/solana` (Solana). They are NOT tabs on one page; a user enters through one gate and stays in that lane for the session. The two never share a view.

The marketing landing, brand kit, and the cross-VM "Arena" rivalry live elsewhere (the landing page) and are out of scope here, except for a persistent **"← Dashboard"** link back to the landing.

## About the Design Files
The files in this bundle are **design references created in HTML/CSS + in-browser-Babel React (JSX)** — prototypes showing the intended look and behavior, not production code to ship as-is. The JSX uses CDN React + an in-browser Babel transform purely for preview convenience.

Your task is to **recreate these screens in the target codebase's environment** (the live Aerarium app — a React/Next.js app with route-isolated `/evm` and `/solana`) using its established patterns, wallet adapters, and market-data sources. The component decomposition here is intentional and maps 1:1 to components you can create. Swap the mock data + simulated timers for real wallet flows (wagmi/viem for EVM; `@solana/wallet-adapter` + your program client for Solana) and live market reads.

If you prefer to lift the prototype directly: the JSX is plain React 18 function components with hooks — port them into the app's React setup and precompile (no in-browser Babel in production).

## Fidelity
**High-fidelity.** Final colors, typography, spacing, states, and interactions. Recreate pixel-accurately using the app's component library, then wire real data. All exact tokens are in the Design Tokens section below and in `aerarium.css` + `aer-app.css`.

---

## Brand & Theme

- **The landing is dark; the connected app is LIGHT** (editorial, cream base). Don't reuse the dark hero theme for the lanes.
- **Per-lane tint** tells the user which lane they're in:
  - **Ethereum lane → steel-blue** (`--evm`, `#3C648C` on light)
  - **Solana lane → violet** (`--sol`, `#6E45AE` on light)
  - The tint is exposed as a single CSS var `--lane` (+ `--lane-bright/-deep/-wash`) set by a body class (`.lane-evm` / `.lane-sol`). All lane-tinted UI references `var(--lane)` so the same components serve both lanes.
- **Brand primary accent** is Rome purple (`--rome-purple` `#5E0A60`) — used for primary buttons and key numbers. Distinct from the two lane tints.
- **Typography (Rome system):**
  - Display/headings: **Untitled Serif**, weight **400** (regular — NOT bold; bold reads un-Rome). Tracking `-0.015em`.
  - Body/UI: **Untitled Sans** (400/500/600).
  - Numbers, labels, addresses, eyebrows: **IBM Plex Mono** (`font-variant-numeric: tabular-nums`).
  - Eyebrow style: mono, 10.5–11px, `letter-spacing: 0.16em`, uppercase, color `--marble-3`.
- **No "Compound" anywhere.** This is Aerarium.

---

## Screens / Views

Both lanes share one frame. The only structural differences are the wallet list, the Solana **Activate** step, and the multi-signature progress.

### Shared frame (top → bottom)

**1. LaneHeader** (sticky, `position: sticky; top: 0`, `rgba(251,248,244,0.86)` + `blur(14px)`, bottom hairline)
- Left cluster: Aerarium **Wordmark** (logomark + "AERARIUM", 18px) → links to `Aerarium — Landing.html`; a 1px×26px divider (`--stone-line-2`); a **LaneIndicator** chip.
- Right cluster: **"← Dashboard"** link (mono eyebrow, `--marble-2`) → landing; **AccountChip** (when connected).
- **LaneIndicator**: pill, `--lane-wash` bg, 1px `--lane` border, mono uppercase `--lane` text, chain glyph + "Ethereum Gate" / "Solana Gate".
- **AccountChip**: pill with `--pos` dot + wallet name (mono eyebrow) + shortened address (`0x1234…5678` / `7mxE…gxrW`, click to copy) + a "Disconnect" text button.

**2. Empty-state banner** (only in connected-empty): full-width strip, `--lane-wash` bg, 1px `--lane` border, chain glyph + "**No position yet.** Supply an asset to start earning and unlock borrowing."

**3. Two-column grid** (`.aer-app-grid`: `1fr 380px`, gap 24px; collapses to one column < 940px)

  **Left column (gap 20px):**
  - **PositionSummary** card — "Your position" (Untitled Serif 22px) + eyebrow "Shared pool · Rome". Four metrics in a 4-col grid: **Supplied / Borrowed / Net APR / Health** (mono, 26px, 600). Net APR in `--gold-bright`; Health colored by value (≥2 `--pos`, ≥1.25 `--gold-bright`, else `--oxblood-br`). Below: **"Borrow capacity used"** label + `borrowed / capacity` + an 8px progress bar (fill = `--lane` gradient, or `--oxblood-br` if >85%). In empty state all metrics render as `—` and the bar is hidden.
  - **AssetTable** card — title "Assets"; column header row (mono eyebrow): Asset / Supply APY / Borrow APY / Your balance / (actions). Grid `1.6fr 1fr 1fr 1.1fr auto`.
    - **AssetRow**: AssetIcon (34px circle, 2-letter, tinted `--lane` for collateral else `--gold`), symbol (14.5px/600) + name (mono 11.5px); Supply APY (`--pos`, 600); Borrow APY (`--marble` or `—` for collateral-only); Your balance (value + "in wallet"/"supplied"/"borrowed" sub-label); action buttons. Base asset (USDC) shows **[Supply][Borrow]**; collaterals show **[Supply][Manage]**. Hover → `--paper` bg; active (selected) → `--lane-wash` bg + 2px `--lane` left border.

  **Right rail (`.aer-rail`, sticky `top: 88px`, gap 20px):**
  - **ActionPanel** card — selected asset header (icon + symbol); a 4-tab segmented control **Supply / Withdraw / Borrow / Repay** (collateral assets show only Supply/Withdraw); amount field (Untitled Serif 30px input) with `Max` button + asset suffix; 2–3 projected rows (e.g. "Supply APY 5.18%", "Projected earnings ~$X/yr", "Lane Ethereum"); primary **Button** (Rome purple) "Supply 100 USDC".
  - **ActivityFeed** card — "Recent activity"; rows of `time · verb amount sym · tx →`; empty copy: "No activity yet — your first action will appear here."

### Ethereum lane — specifics
- **ConnectCard** wallet list: **MetaMask, Rabby, WalletConnect** (first item gets the `--lane` highlighted treatment).
- **Account is provisioned transparently** — there is NO setup step. Connect → straight to the connected lane (empty or with position).
- **Action progress (ProgressCard)** is the simple 2-step form: **"Sign in your wallet" → "Confirming {action} on Rome."**

### Solana lane — specifics (the novel part)
- **ConnectCard** wallet list: **Phantom, Solflare, Backpack**. No Ethereum key involved.
- **First-time ACTIVATE step** (`ActivateCard`) — shown after connect, before the first action, only if the account isn't provisioned yet:
  - Eyebrow "ONE-TIME SETUP"; heading "Activate your Aerarium account"; reassuring copy: "Solana needs a few accounts created on-chain before your first action. We'll provision them in one short setup — **you only do this once.**"
  - A 3-row list of what will happen: **Create your Aerarium account / Initialize token accounts / Register address lookup table.**
  - Primary button "**Activate — 3 signatures**"; footnote "No Ethereum key needed · No gas on Rome · One-time only".
  - While activating, the list becomes a **ProgressCard** with per-signature steps (check when done, spinner on the active step, "Sign"/"Wait" tags).
  - After activation completes, the lane looks like the normal connected lane.
- **Multi-signature actions** — a supply/borrow takes a couple of Phantom signatures, so the `ProgressCard` walks named steps so multiple wallet pops aren't confusing:
  - Supply: **"Approve token transfer (1 of 2)" → "Supply to pool (2 of 2)" → "Confirming on Rome"**
  - Borrow: **"Authorize borrow (1 of 2)" → "Draw from pool (2 of 2)" → "Confirming on Rome"**
  - Note text: "This action needs two signatures — approve each pop-up in Phantom."

---

## Interactions & Behavior

- **Connect**: click a wallet → `connecting` (spinner, "Connecting to {wallet}…") → connected. (Prototype simulates ~1.1s; real impl uses the wallet adapter's connect promise.)
- **Solana activate**: `Activate` → step through 3 signatures (~each) → activated → connected-empty.
- **Action submit**: from ActionPanel → ProgressCard replaces the panel in the rail → on success, `hasPosition = true`, the position view fills, amount resets, and an activity row is prepended.
- **Tab switch** in ActionPanel changes the action (supply/withdraw/borrow/repay) and recomputes projections + Max.
- **Row action buttons** select that asset and preset the action, focusing the rail.
- **Disconnect** returns to the disconnected ConnectCard.
- **Transitions**: 240ms `cubic-bezier(0.2,0.7,0.2,1)`; bar/width animations ~0.8s; spinner `aer-spin` 0.9s linear.
- **Hover**: rows → `--paper`; buttons per variant (see `aer-brand.jsx`).

## States to cover (all designed)
`disconnected` · `connecting` · *(Solana)* `activate` · *(Solana)* `activating` · `connected-empty` · `connected-with-position` · `action signing/in-progress` · `error` (inline ErrorBanner in the rail: "A signature was rejected in your wallet." / "Transaction rejected in your wallet." + "Try again").

In the prototype, every state is reachable two ways: (1) **live** by clicking through, and (2) a **Tweaks → "Screen state"** dropdown that jumps directly to any state for review. (Tweaks panel only appears when the preview's Tweaks toggle is on.)

## State Management
Per-lane state the live app needs:
- `connection` — wallet adapter state (connecting / connected / address / wallet name).
- `provisioned` (Solana only) — whether the on-chain account + ATAs + lookup table exist; gates the Activate step.
- `position` — supplied, borrowed, capacity, healthFactor, netApr, and per-asset balances (from market reads, refreshed on an interval / after actions).
- `pendingAction` — { asset, type, amount } and a `signStep` index while a multi-step action is in flight.
- `activity` — recent tx feed for the connected account in this lane.
- `error` — last failed action for the inline retry.

The prototype models these in `aer-lane.jsx`'s `LaneApp` with `useState` + simulated timers — replace timers with real adapter/RPC promises.

## Design Tokens
Authoritative source: `aerarium.css` (`:root`, dark) overridden by `aer-app.css` (`body.aer-light`). Light-mode values:

**Neutrals:** page `--obsidian #FBF8F4` (Rome cream); surfaces `--basalt/-2 #FFFFFF`; secondary fill `--paper #F4F0EA`; hairlines `--stone-line rgba(20,2,24,0.08)`, `--stone-line-2 rgba(20,2,24,0.15)`.
**Ink/text:** `--marble #1A1814`, `--marble-2 #6E6657`, `--marble-3 #968C7C`, `--marble-4 #B8AE9C`.
**Accent (Rome purple):** `--rome-purple #5E0A60`, hover `--rome-purple-hv #4A0849`; bright accent `--gold #5E0A60` / `--gold-bright #7A1A7C`; wash `rgba(94,10,96,0.06)`.
**Ethereum tint:** `--evm #3C648C`, bright `#5E8FBF`, deep `#2A4A6C`, wash `rgba(60,100,140,0.08)`.
**Solana tint:** `--sol #6E45AE`, bright `#9A6BE0`, deep `#52308A`, wash `rgba(110,69,174,0.08)`.
**Semantic:** positive `--pos #3E8E5E`; danger `--oxblood-br #A8303A` (+ wash `rgba(168,48,58,0.08)`).
**Radii:** xs 4 / sm 8 / md 12 / lg 20 / pill 999. **Layout:** max-width 1120px, gutter 28px, rail 380px. **Motion:** `--ease cubic-bezier(0.2,0.7,0.2,1)`, `--dur 240ms`.

## Assets
- **Rome logomark + wordmark** (the "Powered by Rome" / brand lockup) live in `brand/` — `logomark-tight.svg`, `wordmark-tight.svg` (+ `-white` variants for dark). Use the app's own copies of these brand SVGs in production.
- **Aerarium logomark** (the temple-front "A") is drawn inline as SVG in `aer-brand.jsx` (`Logomark`) — no external asset.
- **Chain glyphs** (Ethereum diamond / Solana bars) are inline SVG in `aer-brand.jsx` (`ChainGlyph`) — geometric, not official brand marks; swap for official wallet/chain logos if desired.
- **Fonts**: Untitled Serif/Sans (`fonts/*.otf`), IBM Plex Mono (`fonts/*.ttf`). Use the codebase's licensed copies.
- Asset/token icons are 2-letter monospace placeholders (`AssetIcon`) — replace with real token icons.

## Files
Design reference files in this bundle:
- `Aerarium — Ethereum Lane.html` — entry point, mounts `<LaneApp chain="evm" />`, body `aerarium aer-light lane-evm`.
- `Aerarium — Solana Lane.html` — entry point, mounts `<LaneApp chain="sol" />`, body `aerarium aer-light lane-sol`.
- `aer-app.css` — light theme token overrides + per-lane tint + app shell/grid/card utilities.
- `aerarium.css` — base brand tokens, fonts, motion (dark defaults; overridden in light).
- `aer-brand.jsx` — Wordmark, Logomark, RomeLockup, Button, ChainBadge, ChainGlyph, CHAIN map, NetPill, Section helpers (shared with the landing).
- `aer-app-lib.jsx` — the connected-app components: `LaneHeader, LaneIndicator, AccountChip, PositionSummary, Metric, AssetTable, AssetRow, ActionPanel, ProgressCard, ActivityFeed, ConnectCard` (+ `Spin, Check, AssetIcon`, formatters).
- `aer-lane.jsx` — `LaneApp({chain})` state machine, per-lane mock data (`LANE_DATA`), `ActivateCard`, `ErrorBanner`, sign-step recipes, and the review-only Tweaks switcher.
- `brand/`, `fonts/` — brand SVGs + font files referenced by the CSS.

Component → file quick map for implementation:
`LaneHeader / PositionSummary / AssetRow / ActionPanel / ProgressCard / ActivityFeed / ConnectCard` → `aer-app-lib.jsx`; `ActivateCard / ErrorBanner / LaneApp / data` → `aer-lane.jsx`; brand primitives → `aer-brand.jsx`.
