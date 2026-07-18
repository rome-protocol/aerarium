// Batched on-chain reads for the Solana lane's Comet position.
//
// The lane reads the SYNTHETIC address's Comet/wrapper state over viem. Each Rome
// eth_call is a ~1s SVM emulation, so the per-refresh reads fold into as few
// Multicall3 aggregate calls as possible. `readSolanaPosition` collapses what was
// 4 sequential round-trips (positions multicall → getUtilization readContract →
// rates multicall → market multicall) into 2: batch 1 carries positions + market
// + utilization (none interdependent); batch 2 carries the rates (which take the
// batch-1 utilization as an arg). Splitting I/O from the hook also makes the
// batching unit testable with a fake client.

import { erc20Abi, type Address } from "viem";
import type { CometReadClient } from "./cometAssetSymbols";
import type { SolanaAssetResolved, SolanaMarketRead } from "./mapSolanaPosition";

const SECONDS_PER_YEAR = 60 * 60 * 24 * 365;

export type MCEntry = { status: "success"; result: unknown } | { status: "failure"; error: unknown };
export const mcResult = (e: MCEntry | undefined): unknown =>
  e && e.status === "success" ? e.result : undefined;

/** Normalise a Chainlink-style answer to USD×1e8 from its feed decimals. */
export function normalizePriceUSDx8(answer: bigint, feedDecimals: number): bigint {
  if (answer <= 0n) return 0n;
  if (feedDecimals === 8) return answer;
  if (feedDecimals > 8) return answer / 10n ** BigInt(feedDecimals - 8);
  return answer * 10n ** BigInt(8 - feedDecimals);
}

// The Comet read/write surface the Solana lane uses (read subset + supply/withdraw
// for the write path + numAssets/getAssetInfo for enumeration). Shared by the hook.
export const COMET_ABI = [
  { type: "function", name: "supply", stateMutability: "nonpayable", inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "borrowBalanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "collateralBalanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }, { name: "asset", type: "address" }], outputs: [{ name: "", type: "uint128" }] },
  { type: "function", name: "baseBorrowMin", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "totalBorrow", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "numAssets", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
  { type: "function", name: "getUtilization", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "getSupplyRate", stateMutability: "view", inputs: [{ name: "utilization", type: "uint256" }], outputs: [{ name: "", type: "uint64" }] },
  { type: "function", name: "getBorrowRate", stateMutability: "view", inputs: [{ name: "utilization", type: "uint256" }], outputs: [{ name: "", type: "uint64" }] },
  {
    type: "function",
    name: "getAssetInfo",
    stateMutability: "view",
    inputs: [{ name: "i", type: "uint8" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "offset", type: "uint8" },
          { name: "asset", type: "address" },
          { name: "priceFeed", type: "address" },
          { name: "scale", type: "uint64" },
          { name: "borrowCollateralFactor", type: "uint64" },
          { name: "liquidateCollateralFactor", type: "uint64" },
          { name: "liquidationFactor", type: "uint64" },
          { name: "supplyCap", type: "uint128" },
        ],
      },
    ],
  },
] as const;

// Chainlink-compatible price feed (Oracle Gateway V2 CachedPyth adapter).
export const PRICE_FEED_ABI = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

/** Static per-asset config the position read folds live values onto. */
export interface SolanaPositionMeta {
  symbol: string;
  address: Address;
  /** Underlying SPL mint (base58), read on-chain from wrapper.mint_id(). The
   *  Solana-lane on-chain identity to DISPLAY (the EVM wrapper address is the
   *  keying id). Carried through to SolanaAssetResolved so it reaches the row. */
  mint?: string;
  isBase: boolean;
  decimals: number;
  priceFeed?: Address;
  priceFeedDecimals?: number;
  borrowCollateralFactorE18: bigint;
}

export interface SolanaPositionReads {
  resolved: SolanaAssetResolved[];
  market?: SolanaMarketRead;
}

/**
 * Read every dynamic value for `synth` across all assets, plus market totals and
 * base APY, in TWO multicalls. Batch 1 = per-asset (wallet / supply / borrow /
 * collateral / price) + totalSupply + totalBorrow + baseBorrowMin + utilization.
 * Batch 2 = supply/borrow rate (need batch-1 utilization). allowFailure isolates a
 * single bad asset; a failed utilization read just leaves base APY at 0 (and skips
 * batch 2 entirely).
 */
export async function readSolanaPosition(
  client: CometReadClient,
  comet: Address,
  synth: Address,
  assetMetas: SolanaPositionMeta[],
  basePriceUSDx8: bigint,
): Promise<SolanaPositionReads> {
  type Kind = "wallet" | "baseSupply" | "baseBorrow" | "collat" | "price";
  const plan: { metaIdx: number; kind: Kind }[] = [];
  const contracts: unknown[] = [];
  assetMetas.forEach((m, idx) => {
    plan.push({ metaIdx: idx, kind: "wallet" });
    contracts.push({ address: m.address, abi: erc20Abi, functionName: "balanceOf", args: [synth] });
    if (m.isBase) {
      plan.push({ metaIdx: idx, kind: "baseSupply" });
      contracts.push({ address: comet, abi: COMET_ABI, functionName: "balanceOf", args: [synth] });
      plan.push({ metaIdx: idx, kind: "baseBorrow" });
      contracts.push({ address: comet, abi: COMET_ABI, functionName: "borrowBalanceOf", args: [synth] });
    } else {
      plan.push({ metaIdx: idx, kind: "collat" });
      contracts.push({ address: comet, abi: COMET_ABI, functionName: "collateralBalanceOf", args: [synth, m.address] });
      if (m.priceFeed) {
        plan.push({ metaIdx: idx, kind: "price" });
        contracts.push({ address: m.priceFeed, abi: PRICE_FEED_ABI, functionName: "latestRoundData" });
      }
    }
  });

  // Market totals + utilization + the base's physical balance ride along in
  // batch 1 — none depend on the position reads, so they cost no extra round-trip.
  const baseMeta = assetMetas.find((m) => m.isBase);
  const marketIdx = contracts.length;
  contracts.push({ address: comet, abi: COMET_ABI, functionName: "totalSupply" });
  contracts.push({ address: comet, abi: COMET_ABI, functionName: "totalBorrow" });
  contracts.push({ address: comet, abi: COMET_ABI, functionName: "baseBorrowMin" });
  contracts.push({ address: comet, abi: COMET_ABI, functionName: "getUtilization" });
  // base wrapper.balanceOf(comet) — the Comet's PHYSICAL base balance (the real
  // withdraw/borrow ceiling). Tail of the market reads so the index is stable.
  if (baseMeta) {
    contracts.push({ address: baseMeta.address, abi: erc20Abi, functionName: "balanceOf", args: [comet] });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r1 = (await client.multicall({ allowFailure: true, contracts: contracts as any })) as readonly MCEntry[];

  // Scatter positions; a failed call leaves the default (0 / base price).
  const walletRaw = assetMetas.map(() => 0n);
  const suppliedRaw = assetMetas.map(() => 0n);
  const borrowedRaw = assetMetas.map(() => 0n);
  const priceUSDx8: bigint[] = assetMetas.map((m) => (m.isBase ? basePriceUSDx8 : 0n));
  for (let i = 0; i < plan.length; i++) {
    const e = r1[i];
    if (!e || e.status !== "success") continue;
    const { metaIdx, kind } = plan[i];
    if (kind === "wallet") walletRaw[metaIdx] = e.result as bigint;
    else if (kind === "baseSupply") suppliedRaw[metaIdx] = e.result as bigint;
    else if (kind === "baseBorrow") borrowedRaw[metaIdx] = e.result as bigint;
    else if (kind === "collat") suppliedRaw[metaIdx] = e.result as bigint;
    else if (kind === "price") {
      const round = e.result as readonly [bigint, bigint, bigint, bigint, bigint];
      const ans = round[1];
      priceUSDx8[metaIdx] = ans > 0n ? normalizePriceUSDx8(ans, assetMetas[metaIdx].priceFeedDecimals ?? 8) : 0n;
    }
  }

  // Market (best-effort) from the tail of batch 1.
  const ts = mcResult(r1[marketIdx]);
  const tb = mcResult(r1[marketIdx + 1]);
  const bm = mcResult(r1[marketIdx + 2]);
  const util = mcResult(r1[marketIdx + 3]);
  // A failed physical-balance read → null (not 0): a false 0 would zero out
  // liquidity and block every withdraw/borrow.
  const bbal = baseMeta ? mcResult(r1[marketIdx + 4]) : undefined;
  const baseBalanceRaw = typeof bbal === "bigint" ? bbal : null;
  let market: SolanaMarketRead | undefined;
  if (ts !== undefined && tb !== undefined) {
    market = {
      totalSupplyBaseRaw: ts as bigint,
      totalBorrowBaseRaw: tb as bigint,
      baseBorrowMinRaw: (bm as bigint | undefined) ?? 0n,
      baseBalanceRaw,
      baseDecimals: baseMeta?.decimals ?? 6,
      basePriceUSDx8,
    };
  }

  // Rates need utilization → batch 2, only when the utilization read succeeded.
  let baseSupplyApy = 0;
  let baseBorrowApy = 0;
  if (util !== undefined) {
    const rates = (await client.multicall({
      allowFailure: true,
      contracts: [
        { address: comet, abi: COMET_ABI, functionName: "getSupplyRate", args: [util as bigint] },
        { address: comet, abi: COMET_ABI, functionName: "getBorrowRate", args: [util as bigint] },
      ],
    })) as readonly MCEntry[];
    const sr = mcResult(rates[0]);
    const br = mcResult(rates[1]);
    if (sr !== undefined) baseSupplyApy = (Number(sr as bigint) / 1e18) * SECONDS_PER_YEAR * 100;
    if (br !== undefined) baseBorrowApy = (Number(br as bigint) / 1e18) * SECONDS_PER_YEAR * 100;
  }

  const resolved: SolanaAssetResolved[] = assetMetas.map((m, idx) => ({
    symbol: m.symbol,
    address: m.address,
    mint: m.mint,
    decimals: m.decimals,
    isBase: m.isBase,
    priceUSDx8: priceUSDx8[idx],
    walletRaw: walletRaw[idx],
    suppliedRaw: suppliedRaw[idx],
    borrowedRaw: borrowedRaw[idx],
    borrowCollateralFactorE18: m.borrowCollateralFactorE18,
    supplyApyPct: m.isBase ? baseSupplyApy : 0,
    borrowApyPct: m.isBase ? baseBorrowApy : 0,
  }));

  return { resolved, market };
}
