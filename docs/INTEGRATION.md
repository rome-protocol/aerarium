# Integrating an app on Rome — patterns

Aerarium is a Compound v3 money market, but the way it's built is a reusable
template for **any** app that wants EVM users *and* Solana-native users on one
shared on-chain state, across **any** Rome chain. This doc captures the patterns
as patterns — Aerarium on Hadrian is just the worked example. The runnable
tooling below is chain-agnostic: point it at your chain and app via config.

> Operating/deploying a concrete instance? See [`DEPLOYMENT.md`](DEPLOYMENT.md)
> (component inventory, ordered deploy checklist, oracle keeper, runbook).

---

## Pattern 1 — Chain-agnostic by config (no hardcoded chain identity)

Nothing chain-specific lives in app code. Chain id, RPC, explorer, contract
addresses, Multicall3, the rome-evm program id, the Solana cluster, and the
faucet all resolve **per chain from the [Rome registry](https://github.com/rome-protocol/registry)**
at build time:

- The build projects `apps/compound/<chainId>-<slug>.json` (+ the chain's
  `chain/contracts/tokens/oracle/bridge.json`) into `lib/registry/generated.json`
  via `npm run build:registry-config` (also part of `npm run build`).
- `lib/config.ts` resolves the active chain (`NEXT_PUBLIC_DEFAULT_CHAIN_ID`, or
  `/api/env` at runtime, or the registry default) and exposes
  `DEFAULT_CHAIN_CONFIG` / `DEFAULT_CHAIN_CONFIG_RAW` / `configForChain(id)`.
- **Pointing at another chain is a config change + rebuild — never a code edit.**

**Enforced, not just intended:** `tests/guards/no-chain-literals.test.ts` fails
the build if any chain id / program id / cluster / contract address is hardcoded
under `lib/`, `app/`, or `components/`. When you generalize a new surface, derive
its values from the config and add the chain's literals to that guard.

**For a new app:** mirror this — read your addresses from a registry projection,
add a forbidden-literal guard, and resolve the active chain once in a `config`
module the rest of the app imports.

## Pattern 2 — Two route-isolated lanes over one shared pool

`/evm` and `/solana` read and write the **same** contract; the only difference is
who `msg.sender` is and how the tx is authorized.

- **EVM lane** (`lib/lane/useEvmLane.ts`): MetaMask → wagmi → `writeContract`.
- **Solana-native lane** (`lib/lane/useSolanaLane.ts`): Phantom signs a
  **`DoTxUnsigned`** (an unsigned 1559 tx + an ed25519 sig over the Solana key);
  rome-evm derives the sender on-chain as `keccak256(solanaPubkey)[12:]` — a
  *synthetic* EVM address. No EVM wallet, no EVM gas key.
- Presentational components + the position math
  (`lib/lane/positionStats.ts` → `computePositionStats`) are shared and
  chain/lane-agnostic; only the per-lane *reads* differ (the adapter pattern in
  `components/aerarium/lane/types.ts`).

**Synthetic-transient invariant** (Solana lane): the synthetic holds nothing at
rest — value lives in the user's wallet (SPL ATAs) or in the protocol. Actions
fund the synthetic, act, then sweep back (`lib/solana/syntheticTransientFlows.ts`).

## Pattern 3 — Account discovery for Solana-native writes

A `DoTxUnsigned` needs its full Solana account list up front. The proxy's
**`rome_emulateCallAccounts`** resolves that set server-side
(`lib/solana/discovery.ts`); the proxy is the determinism source — reads + account
resolution are proxy-only. `lib/solana/probeConfig.ts` resolves the discovery
proxy, RPC, comet, program, and cluster from the same registry config.

## Pattern 4 — Cached oracle + keeper (Solana CU budget)

A multi-collateral action reads every collateral price; live CPI reads of N Pyth
PDAs blow the ~1.4M Solana CU budget, so each asset is priced by a
`CachedPythAdapter` (a cheap `SLOAD`). An off-chain **oracle-keeper** keeps both
layers fresh (the Solana PDA *and* the EVM SLOAD cache via `refresh()`). See
[`DEPLOYMENT.md` §6](DEPLOYMENT.md) for the keeper wiring and failure modes.

## Pattern 5 — CU / heap budgeting for atomic flows

Solana-native flows must fit one transaction's CU (~1.4M) and heap (256 KB)
budget. The method for measuring per-action CU/heap from live traces — and the
results for supply/withdraw/borrow/repay/absorb — is in
[`../scripts/flow-budget.md`](../scripts/flow-budget.md). EVM `gasUsed` is **not**
a faithful proxy for Solana CU on Rome — read `computeUnitsConsumed` from the
Solana tx receipt.

---

## Runnable, chain-agnostic tooling

All of these follow the active chain via `NEXT_PUBLIC_DEFAULT_CHAIN_ID` (app) /
`CHAIN_ID` (scripts) — no hardcoded addresses.

| Surface | What it is | Point at your chain |
|---|---|---|
| `/discovery` | Phantom-connect probe for the Solana-native write path (discover → DoTxUnsigned → sign → submit). Dev-only (prod-gated). | `NEXT_PUBLIC_DEFAULT_CHAIN_ID` + `npm run build:registry-config` |
| `/flows` | Full supply/withdraw/borrow/repay/liquidate/faucet harness on the synthetic-transient flow. Dev-only (prod-gated). | same |
| `scripts/*.mjs` | CLI probes (oracle freshness, account-set diffs, end-to-end flow driver). | `CHAIN_ID=<id>` (resolved from `generated.json`) |

The asset lists for `/discovery` + `/flows` come from `lib/discoveryAssets.ts`
(`discoveryAssets(cfg)` derives base + every collateral from the chain config) —
the template for any harness that needs "every asset on this chain."

## Design reference

- [`DEPLOYMENT.md`](DEPLOYMENT.md) — what's deployed + the ordered checklist.
- Design briefs + the original integration spec live under `docs/` (design
  scaffolding) — example artifacts for the patterns above.
