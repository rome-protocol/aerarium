// Per-account enrichment for the shared Liquidate table (both lanes).
//
// `fetchUnhealthyAccounts` discovers WHICH accounts are liquidatable (an
// Address[]); this module answers HOW MUCH each one is worth to a liquidator:
// outstanding debt $, seizable collateral $, the liquidation discount (the
// absorber's reward), and a derived health factor. One client-agnostic
// `enrichLiquidatable(client, comet, account)` is shared by BOTH lanes — the
// EVM lane passes wagmi's PublicClient, the Solana lane passes its own
// /api/rome-rpc viem client (useSolanaActions.evmClient). The reads are
// chain-agnostic Comet view methods, so the only difference is the client.
//
// The raw-reads → math step is a pure, unit-tested function
// (`buildLiquidatableInfo`) so the USD/bonus arithmetic is covered without a
// chain. The async `enrichLiquidatable` is the thin read wrapper around it.
//
// Scaled-bigint conventions (same as lib/portal/stats.ts):
//   - comet.getPrice() returns USD scaled by 1e8 (PRICE_SCALE).
//   - liquidationFactor is scaled by 1e18 (FACTOR_SCALE), a 0..1 fraction.
//   - token balances stay in their smallest unit (decimals from the asset scale).
import type { Address } from "viem";

const PRICE_SCALE = 1e8;
const FACTOR_SCALE = 1e18;

/** Hard cap on how many accounts we enrich in one pass — keeps the read fan-out
 *  bounded (each account is 1 + 2N reads). Liquidatable lists are short. */
export const MAX_ENRICH = 20;

/** The rich per-account data the Liquidate table renders. */
export interface LiquidatableInfo {
  address: string;
  /** Outstanding base debt in USD. */
  debtUsd: number;
  /** Total seizable collateral value in USD (sum across held collaterals). */
  collateralUsd: number;
  /**
   * Liquidation discount the absorber earns, as a percent (e.g. 9 = 9%).
   * ESTIMATE — basis: Compound v3 values seized collateral at
   * `price × liquidationFactor` during absorb, so `(1 − liquidationFactor)` is
   * the protocol's discount on that collateral, which the absorber ultimately
   * captures via `buyCollateral` at the storeFront price. We take the USD-value
   * -weighted average of `(1 − liquidationFactor)×100` across the account's
   * HELD collaterals (zero-balance collaterals don't count). It does NOT fold
   * in `storeFrontPriceFactor` (not in COMET_PORTAL_ABI) — the true buyer
   * discount = `liquidationFactor`-derived penalty scaled by storeFront; this
   * is the liquidationFactor leg only. Treat as an indicative reward, not the
   * exact post-trade P&L.
   */
  bonusPct: number;
  /**
   * Health factor = liquidation-weighted collateral value ÷ debt. < 1 means
   * underwater (these accounts passed isLiquidatable, so expect < 1). `null`
   * when there's no debt to divide by (HF is undefined, not infinite, for the
   * table's purposes).
   */
  healthFactor: number | null;
}

/** One collateral asset's raw reads for `buildLiquidatableInfo`. */
export interface LiquidatableRawCollateral {
  /** comet.collateralBalanceOf(account, asset) — smallest unit. */
  balance: bigint;
  /** Token decimals (10^decimals === asset scale). */
  decimals: number;
  /** comet.getPrice(priceFeed) — USD scaled by 1e8. */
  priceUSDx8: bigint;
  /** getAssetInfo(i).liquidationFactor — 1e18-scaled 0..1 fraction. */
  liquidationFactor: bigint;
}

/** The full raw-read bundle for one account — the pure-math input. */
export interface LiquidatableRawReads {
  address: string;
  /** comet.borrowBalanceOf(account) — base smallest unit. */
  borrowBalanceBase: bigint;
  /** Base token decimals. */
  baseDecimals: number;
  /** comet.getPrice(baseTokenPriceFeed) — USD scaled by 1e8. */
  basePriceUSDx8: bigint;
  collaterals: LiquidatableRawCollateral[];
}

/** USD value of a token balance given decimals and a 1e8-scaled USD price. */
function tokenAmountToUSD(balance: bigint, decimals: number, priceUSDx8: bigint): number {
  if (balance === 0n || priceUSDx8 === 0n) return 0;
  const amount = Number(balance) / 10 ** decimals;
  const price = Number(priceUSDx8) / PRICE_SCALE;
  return amount * price;
}

/** 1e18-scaled factor → Number (0..1). */
function factorToNumber(scaled: bigint): number {
  return Number(scaled) / FACTOR_SCALE;
}

/**
 * Pure raw-reads → LiquidatableInfo math. No I/O — unit-tested in isolation.
 *
 * - debtUsd       = borrowBalanceBase × basePrice
 * - collateralUsd = Σ collateral_balance × price
 * - bonusPct      = USD-weighted avg of (1 − liquidationFactor)×100 over HELD
 *                   collaterals (zero-balance collaterals excluded). Estimate.
 * - healthFactor  = Σ(collateral_usd × liquidationFactor) ÷ debtUsd, or null
 *                   when debtUsd === 0.
 */
export function buildLiquidatableInfo(reads: LiquidatableRawReads): LiquidatableInfo {
  const debtUsd = tokenAmountToUSD(reads.borrowBalanceBase, reads.baseDecimals, reads.basePriceUSDx8);

  let collateralUsd = 0;
  let liquidationThresholdUsd = 0; // Σ collateral_usd × liquidationFactor
  let bonusWeightedSum = 0; // Σ collateral_usd × discountPct
  for (const c of reads.collaterals) {
    const usd = tokenAmountToUSD(c.balance, c.decimals, c.priceUSDx8);
    if (usd <= 0) continue; // zero-balance collateral contributes nothing (no NaN)
    const lf = factorToNumber(c.liquidationFactor);
    const discountPct = (1 - lf) * 100;
    collateralUsd += usd;
    liquidationThresholdUsd += usd * lf;
    bonusWeightedSum += usd * discountPct;
  }

  // USD-weighted average discount across held collaterals. When no collateral
  // holds value, there's nothing to seize → 0 (not NaN).
  const bonusPct = collateralUsd > 0 ? bonusWeightedSum / collateralUsd : 0;

  // HF needs a debt to divide by. These accounts are isLiquidatable, so when
  // debt is present expect < 1; with no debt, HF is undefined for our purposes.
  const healthFactor = debtUsd > 0 ? liquidationThresholdUsd / debtUsd : null;

  return {
    address: reads.address,
    debtUsd,
    collateralUsd,
    bonusPct,
    healthFactor,
  };
}

/** Minimal viem-PublicClient surface enrichLiquidatable needs. Both wagmi's
 *  `usePublicClient()` and the Solana lane's `evmClient` satisfy it (same
 *  shape fetchUnhealthyAccounts uses, so a lane can pass the identical client). */
export interface EnrichReadClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readContract: (args: any) => Promise<unknown>;
}

// Self-contained Comet view ABI for the enrichment reads. Kept local (not the
// shared COMET_PORTAL_ABI) because we need `collateralBalanceOf` (single
// uint128 — the same read useSolanaLane / discovery / YourSuppliesTable use)
// rather than the shared ABI's `userCollateral` tuple. Self-contained so this
// module is reusable by either lane's client with no shared-ABI coupling.
const COMET_ENRICH_ABI = [
  { type: "function", name: "baseTokenPriceFeed", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "numAssets", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "borrowBalanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getPrice", stateMutability: "view", inputs: [{ name: "priceFeed", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "collateralBalanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }, { name: "asset", type: "address" }], outputs: [{ type: "uint128" }] },
  {
    type: "function",
    name: "getAssetInfo",
    stateMutability: "view",
    inputs: [{ name: "i", type: "uint8" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { type: "uint8", name: "offset" },
          { type: "address", name: "asset" },
          { type: "address", name: "priceFeed" },
          { type: "uint64", name: "scale" },
          { type: "uint64", name: "borrowCollateralFactor" },
          { type: "uint64", name: "liquidateCollateralFactor" },
          { type: "uint64", name: "liquidationFactor" },
          { type: "uint128", name: "supplyCap" },
        ],
      },
    ],
  },
] as const;

/** A single getAssetInfo(i) tuple as viem decodes it (named struct fields). */
interface AssetInfoTuple {
  asset: Address;
  priceFeed: Address;
  scale: bigint;
  liquidationFactor: bigint;
}

/** Compound's per-asset `scale` is 10^decimals — invert it. */
function scaleToDecimals(scale: bigint): number {
  let d = 0;
  let s = scale;
  while (s > 1n) {
    s /= 10n;
    d += 1;
  }
  return d;
}

/**
 * Read one account's debt + per-collateral seizable value off the Comet and
 * fold them into a LiquidatableInfo. Read-only; `client` is any viem
 * PublicClient (wagmi's or the Solana lane's evmClient — chain-agnostic).
 *
 * Reads: baseTokenPriceFeed + numAssets (market shape) → base price +
 * borrowBalanceOf(account) → per-asset getAssetInfo(i) → getPrice(priceFeed) +
 * collateralBalanceOf(account, asset). Mirrors useAccountStats's read order;
 * uses sequential readContract (the established codebase pattern — every portal
 * hook reads this way; the client transparently batches the JSON-RPC calls).
 */
export async function enrichLiquidatable(
  client: EnrichReadClient,
  comet: Address,
  account: Address,
): Promise<LiquidatableInfo> {
  const read = (functionName: string, args?: unknown[]) =>
    client.readContract({ address: comet, abi: COMET_ENRICH_ABI, functionName, args });

  // Market shape + base-side reads in parallel.
  const [baseTokenPriceFeed, numAssetsRaw, borrowBalanceBase] = await Promise.all([
    read("baseTokenPriceFeed") as Promise<Address>,
    read("numAssets") as Promise<number | bigint>,
    read("borrowBalanceOf", [account]) as Promise<bigint>,
  ]);

  const basePriceUSDx8 = (await read("getPrice", [baseTokenPriceFeed])) as bigint;

  // Base decimals: the demo's base wrapper (wUSDC) is 6-dp. The Comet doesn't
  // expose base decimals as a view method, so we read getAssetInfo only for
  // collaterals; for the base we use the registry's 6-dp convention (wUSDC).
  // (debtUsd is base_units / 10^6 × price — matching the base wrapper's scale.)
  const baseDecimals = 6;

  const numAssets = Number(numAssetsRaw);
  const collaterals: LiquidatableRawCollateral[] = await Promise.all(
    Array.from({ length: numAssets }, async (_, i) => {
      const info = (await read("getAssetInfo", [i])) as AssetInfoTuple;
      const [balance, priceUSDx8] = (await Promise.all([
        read("collateralBalanceOf", [account, info.asset]),
        read("getPrice", [info.priceFeed]),
      ])) as [bigint, bigint];
      return {
        balance,
        decimals: scaleToDecimals(BigInt(info.scale)),
        priceUSDx8,
        liquidationFactor: BigInt(info.liquidationFactor),
      } satisfies LiquidatableRawCollateral;
    }),
  );

  return buildLiquidatableInfo({
    address: account,
    borrowBalanceBase,
    baseDecimals,
    basePriceUSDx8,
    collaterals,
  });
}

/**
 * Enrich a list of liquidatable accounts (capped to MAX_ENRICH). Parallel —
 * each account's reads are independent. Used by both lane pages after
 * fetchUnhealthyAccounts returns the candidate addresses.
 */
export async function enrichLiquidatableList(
  client: EnrichReadClient,
  comet: Address,
  accounts: Address[],
): Promise<LiquidatableInfo[]> {
  const capped = accounts.slice(0, MAX_ENRICH);
  return Promise.all(capped.map((a) => enrichLiquidatable(client, comet, a)));
}
