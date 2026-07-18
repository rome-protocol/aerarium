# Designer prompt — Aerarium front page + brand

> **Reusable pattern — Aerarium is the worked example.** A template for briefing a
> Rome app's landing/brand; engineering patterns in [`INTEGRATION.md`](INTEGRATION.md).

*(Paste this into the design tool. Attach `mockup-landing-aerarium.html` as the
structure reference and `DESIGNER-BRIEF-aerarium.md` for full context.)*

---

You're designing the **front page and visual brand** for **Aerarium**, a lending &
borrowing protocol on the Rome network. We are rebranding away from an existing
product called "Compound on Rome" — **do not use the name "Compound" anywhere.**
"Aerarium" is the ancient Roman public treasury; the brand is Roman-themed
(marble, gold, oxblood/imperial accents, inscriptional serif display type à la
Trajan/Cinzel) but modern, clean, and credible.

## The core idea — this must come through visually
One money market, **two rival chains**: Ethereum and Solana supply and borrow the
**same** liquidity — one shared pool, no bridge between them. It's both a
partnership and a rivalry. **Every page shows both worlds together** — use a
consistent dual-chain motif (e.g., a steel-blue accent for EVM, a violet accent
for Solana).

## What to design
1. **The brand kit** — wordmark/logo for "Aerarium", color palette, typography,
   and core UI components (buttons, cards, stat tiles, nav, tables). A reusable kit.
2. **The front page** — a landing + live dashboard + marketing page, browsable with
   **no wallet**. Its job: **excite a first-time visitor enough to connect a wallet
   and act.** Top to bottom it must carry:
   - Brand/nav + a "Rome · Testnet" marker + a Connect affordance.
   - A hero that lands the "one pool, two rival chains" idea.
   - **One shared pool** — total liquidity (supplied / borrowed / net APR) with a
     split bar showing "from EVM" vs "from Solana", clearly ONE market (the split
     only shows where liquidity entered from).
   - **The Arena** — the emotional hook: an EVM-vs-Solana **liquidation scoreboard**,
     head-to-head (how many of each other's positions each side has liquidated,
     value seized, biggest hit). Make it feel like a competition.
   - **Open for liquidation** — claimable underwater positions tagged by side
     (EVM/Solana), each with seizable value + reward + a claim action.
     Permissionless: "connect to claim — your gate decides which side you fight for."
   - **Choose your gate** — the primary CTA: *The Ethereum Gate* (MetaMask/Rabby)
     and *The Solana Gate* (Phantom). Must read clearly as the main action.
   - **Markets** — a read-only rates table.
3. **A reusable page/section template** in the same language, so more journey pages
   can be built later without redesigning.

## Conversion intent
Land → feel the rivalry + the claimable rewards → "I want in" → pick a gate.

## Tone
Roman, confident, a touch combative (it's a rivalry). A serious money market **and**
a marketing page — credible numbers, exciting framing.

## Not in scope
The connected/in-lane screens (a user's personal position + APR after they pick a
gate). Those already exist as the current portal; we'll re-skin them with your kit.

## Reference
`mockup-landing-aerarium.html` is an **engineer's structure mockup** — it shows
information architecture (what goes where and why), **not** the look. The visual
design is entirely yours.
