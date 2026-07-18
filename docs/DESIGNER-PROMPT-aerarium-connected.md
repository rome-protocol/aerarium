# Designer prompt — Aerarium connected app + lane screens

> **Reusable pattern — Aerarium is the worked example.** The in-lane / gate-pick
> structure is a template for any dual-lane Rome app; engineering patterns in
> [`INTEGRATION.md`](INTEGRATION.md).

*(Paste into the design tool. You already delivered the Aerarium brand kit + the
landing; this is the connected/in-lane experience that follows once a user picks a
gate. Attach the brand kit + landing files as reference.)*

---

Design the **connected (post-gate) experience** for **Aerarium** — the screens a
user sees *after* they pick a gate on the landing and connect a wallet. Two
screens: the **Ethereum-gate lane** and the **Solana-gate lane**. Match the
Aerarium identity from the landing + brand kit. **Drop "Compound" entirely — this
is Aerarium.**

## Critical structure (please don't deviate)
- **Two separate per-lane screens, NOT a tab switcher.** A user enters through one
  gate and stays in that lane for the session — the two never share a view. Design
  the **Ethereum lane** and the **Solana lane** as their own full screens (not
  Solana/EVM tabs on one page).
- **Light**, editorial Aerarium. The landing is the dark hero moment; the working
  app is light.
- **Per-lane tint:** the Ethereum lane leans the EVM accent (steel-blue), the
  Solana lane the Solana accent (violet), over the light Aerarium base — so you
  always know which lane you're in.
- A persistent **"← Dashboard"** route back to the landing (the shared market
  dashboard). The lane is *personal*; the market-wide stats + the Arena rivalry
  live on the landing, not here.

## Shared frame (both lanes)
- Aerarium header (wordmark/Lockup), a lane indicator ("Ethereum gate" / "Solana
  gate"), the connected account + disconnect, and the Dashboard link.
- **Your position** (personal, lean): supplied / borrowed / borrow capacity /
  health factor.
- **Per-asset rows**: the base asset (USDC) + collaterals — each with its APR,
  your balance, and the action it affords.
- **Action panel/modal**: Supply, Withdraw, Borrow, Repay. (Liquidations live on
  the landing's Arena — not here.)
- **Recent activity** feed for that lane.
- **States to cover:** disconnected (connect CTA), connecting, connected-empty
  ("no position yet — supply to start"), connected-with-position, an action
  **in-progress / signing** state, and error.

## Ethereum lane specifics
- Connect via MetaMask / Rabby / WalletConnect.
- The account is provisioned transparently — no setup step; the user connects and acts.

## Solana lane specifics (the novel part — please nail this)
- Connect via Phantom / Solflare — **no Ethereum key**.
- **First-time "activate" step:** before the first action we provision the user's
  on-chain account + token accounts + a lookup table (a handful of wallet
  signatures). Design a clear, reassuring **one-time setup** moment — what's
  happening, progress, and that it's quick + one-time. After activation the lane
  looks like the normal connected lane.
- **Multi-signature actions:** a supply/borrow can take a couple of Phantom
  signatures. Design an **in-progress progress card** that walks the steps (e.g.
  "approve → supply") so the user isn't confused by multiple wallet pops.

## Brand + tone
Aerarium identity (wordmark/Lockup, the purple, Untitled Serif/Sans + IBM Plex
Mono, the editorial feel). Calmer and more functional than the landing — this is
the working surface — but unmistakably the same product. No "Compound" anywhere.

## Reference
You have the Aerarium brand kit + the landing. The earlier "Compound on Rome"
connected render is a rough **structural** starting point only — rebrand it to
Aerarium, **split the tabs into the two separate per-lane screens**, and bring it
fully into the Aerarium identity.

## What we'll do with it
We plumb your screens into the live app (route-isolated `/evm` + `/solana`), wiring
the real wallet flows + market data. Please keep the components **modular** (header,
position summary, asset row, action panel, progress card, activity feed) the same
way the landing was, so they drop in cleanly.
