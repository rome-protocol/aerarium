# Designer brief — Aerarium

> **Reusable pattern — Aerarium is the worked example.** This is Aerarium's design
> handoff; the *structure* (dual EVM + Solana-native gates over one shared pool,
> gate-pick → in-lane flow) is a template for briefing any Rome app's design. For
> the engineering patterns behind it, see [`INTEGRATION.md`](INTEGRATION.md).

**Date:** 2026-05-31 · **For:** front-end design partner

## What this is

A Roman-themed lending/borrowing protocol on Rome where **two rival chains —
Ethereum and Solana — supply and borrow the same liquidity**. One pool, two ways
in. We're rebranding away from "Compound on Rome" to **Aerarium** (the Roman
public treasury — a shared vault of capital). The front page is part dashboard,
part marketing: it must **excite an unconnected visitor enough to connect and
act**.

## Starting point

You **already have the existing "Compound on Rome" pages.** This is a **rebrand +
extend**, not a from-scratch design:
- Evolve the existing visual identity into **Aerarium** (new name, Roman theme,
  dual-chain motif) — the brand kit replaces/derives from what's there.
- The **net-new** page is the **front page** (landing / dashboard / Arena) — it
  doesn't exist today.
- The in-lane (connected) screens already exist as the current portal; we re-skin
  them with your kit, so you don't redesign them.

## What we need from you (three deliverables)

### 1. Aerarium brand kit  *(the long pole — every page depends on it)*
Wordmark/logo, color palette, typography, and core components (buttons, cards,
stat tiles, nav, tables). **Bake in the dual-chain motif as a principle:** EVM and
Solana should be visibly present together on essentially every page (a consistent
"two sides, one pool" visual language — e.g., the two accent colors, a split
treatment). Roman theme; do **not** use the "Compound" name anywhere.
- **Cover the connected screens' components too** — we re-skin the existing portal
  with this kit, so it must include: an action panel/modal, a position/portfolio
  readout, a health/risk indicator, and per-asset rows with APR.
- **Per-lane tinting** — inside the Ethereum Gate the UI leans the EVM accent;
  inside the Solana Gate, the Solana accent. The dual-chain motif should carry into
  the connected experience, not just the landing.

### 2. The landing / dashboard page
The journey's home and our main marketing surface. It is browsable with **no
wallet**. It must carry:
- **One shared pool**, with a per-source split ("from EVM" vs "from Solana") that
  makes clear it is *one* market, not two.
- **The Arena** — an EVM-vs-Solana **liquidation scoreboard** (head-to-head:
  who has liquidated more of whom, value seized, biggest hit). This is the
  emotional hook; it should feel like a rivalry/competition.
- **Open for liquidation** — a list of claimable underwater positions tagged by
  side, with rewards and a clear action ("connect to claim — your gate decides
  which side you fight for").
- **Choose your gate** — the primary action: *The Ethereum Gate* (MetaMask/Rabby)
  and *The Solana Gate* (Phantom). This must read as the main CTA, not be buried.
- **Markets** — a read-only rates table.
- Conversion intent: land → feel the rivalry/rewards → "I want in" → pick a gate.

### 3. A reusable page/section template
A layout + component pattern in the brand language so we can build *additional*
journey + deep-dive pages in-house without sending each one back to you.

## Not in scope for you
- **The in-lane (connected) screens.** Inside a gate it's lean + personal (the
  user's position + the APR on what they're touching). We build these by
  re-skinning the existing portal with your brand kit — you don't design them.
- **Cross-chain comparison pages** (Rome's rates vs Kamino / Compound-on-
  Arbitrum/Polygon/mainnet). A later phase; separate ask.

## Structural reference (engineer mockups — not visual targets)
Direction + information architecture only; the look is yours. See the brainstorm
mockups (HTML): `landing-v3.html` (full landing structure: gates → one-pool split
→ Arena → open liquidations → markets) and `landing-v2.html` (the gate-choice-
first IA). These show *what goes where and why*, not how it should look.

## Tone
Roman, confident, a little combative (it's a rivalry). It's a serious money
market **and** a marketing page — credible numbers, exciting framing.
