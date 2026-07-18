// Batched on-chain reads for the EVM lane's Comet views.
//
// Each Rome `eth_call` runs a full SVM emulation (~1s), so the portal MUST fold
// its load reads into Multicall3 aggregate calls — exactly as the Solana lane
// already does (see useSolanaLane + readCometAssetSymbols). These pure functions
// own the I/O (build contracts → one multicall → scatter results); the hooks
// keep their compute. Splitting I/O from compute also makes the batching unit
// testable with a fake client.

import { erc20Abi, type Address } from "viem";
import { COMET_PORTAL_ABI } from "./abi";
import type { CometReadClient } from "../lane/cometAssetSymbols";

function mcResult(entry: { status: string; result?: unknown } | undefined): unknown {
  return entry && entry.status === "success" ? entry.result : undefined;
}

function asBigint(v: unknown, dflt = 0n): bigint {
  return typeof v === "bigint" ? v : dflt;
}

export interface AssetFeedInput {
  asset: Address;
  priceFeed: Address;
}

/** Wallet ERC20 balances for base + each collateral, in ONE multicall. */
export async function readWalletBalances(
  client: CometReadClient,
  baseAsset: Address,
  assetAddrs: readonly Address[],
  user: Address,
): Promise<Record<string, bigint>> {
  const addrs: Address[] = [baseAsset, ...assetAddrs];
  const res = await client.multicall({
    allowFailure: true,
    contracts: addrs.map((address) => ({
      address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [user],
    })),
  });
  const out: Record<string, bigint> = {};
  addrs.forEach((address, i) => {
    out[address.toLowerCase()] = asBigint(mcResult(res[i]));
  });
  return out;
}

export interface ReserveReads {
  totalSupply: bigint;
  totalBorrow: bigint;
  utilization: bigint;
  basePrice: bigint;
  supplyRate: bigint;
  borrowRate: bigint;
  collats: { supplyRaw: bigint; priceX8: bigint }[];
  /** baseToken.balanceOf(comet) — the base the Comet PHYSICALLY holds, i.e. the
   *  real withdraw/borrow ceiling (it can only transfer base it has). Differs
   *  from totalSupply − totalBorrow when the Comet runs a base deficit. null when
   *  the read failed — consumers fall back to the accounting net (never block). */
  baseBalanceRaw: bigint | null;
}

/**
 * Reserve aggregates in TWO multicalls. Batch 1 = base totals + utilization +
 * base price + every collateral's (wrapper.balanceOf(comet), getPrice(feed)) +
 * the base token's physical balance held by the Comet — all depend only on the
 * market shape, so they fold into one round-trip. Batch 2 = supply/borrow rate,
 * which take the batch-1 utilization as an arg. Was 4 + 2 + 2N sequential reads.
 */
export async function readReserveReads(
  client: CometReadClient,
  comet: Address,
  baseToken: Address,
  baseTokenPriceFeed: Address,
  assets: readonly AssetFeedInput[],
): Promise<ReserveReads> {
  const batch1 = await client.multicall({
    allowFailure: true,
    contracts: [
      { address: comet, abi: COMET_PORTAL_ABI, functionName: "totalSupply" },
      { address: comet, abi: COMET_PORTAL_ABI, functionName: "totalBorrow" },
      { address: comet, abi: COMET_PORTAL_ABI, functionName: "getUtilization" },
      { address: comet, abi: COMET_PORTAL_ABI, functionName: "getPrice", args: [baseTokenPriceFeed] },
      ...assets.flatMap((a) => [
        { address: a.asset, abi: erc20Abi, functionName: "balanceOf", args: [comet] },
        { address: comet, abi: COMET_PORTAL_ABI, functionName: "getPrice", args: [a.priceFeed] },
      ]),
      // Tail (keeps the collat scatter indices stable): the Comet's physical base
      // balance — the true withdraw/borrow liquidity ceiling.
      { address: baseToken, abi: erc20Abi, functionName: "balanceOf", args: [comet] },
    ],
  });

  const totalSupply = asBigint(mcResult(batch1[0]));
  const totalBorrow = asBigint(mcResult(batch1[1]));
  const utilization = asBigint(mcResult(batch1[2]));
  const basePrice = asBigint(mcResult(batch1[3]));
  const collats = assets.map((_, i) => ({
    supplyRaw: asBigint(mcResult(batch1[4 + i * 2])),
    priceX8: asBigint(mcResult(batch1[4 + i * 2 + 1])),
  }));
  // A failed read → null (not 0): a false 0 would zero out liquidity and block
  // every withdraw/borrow. null lets the consumer fall back to the accounting net.
  const baseBalRaw = mcResult(batch1[4 + assets.length * 2]);
  const baseBalanceRaw = typeof baseBalRaw === "bigint" ? baseBalRaw : null;

  const batch2 = await client.multicall({
    allowFailure: true,
    contracts: [
      { address: comet, abi: COMET_PORTAL_ABI, functionName: "getSupplyRate", args: [utilization] },
      { address: comet, abi: COMET_PORTAL_ABI, functionName: "getBorrowRate", args: [utilization] },
    ],
  });
  const supplyRate = asBigint(mcResult(batch2[0]));
  const borrowRate = asBigint(mcResult(batch2[1]));

  return { totalSupply, totalBorrow, utilization, basePrice, supplyRate, borrowRate, collats, baseBalanceRaw };
}

export interface AccountReads {
  supplyBal: bigint;
  borrowBal: bigint;
  basePrice: bigint;
  collateralized: boolean;
  perAsset: { balance: bigint; priceX8: bigint }[];
}

/**
 * Per-user account reads in ONE multicall: base supply/borrow + base price +
 * isBorrowCollateralized + every collateral's (userCollateral, getPrice). None
 * cross-depend, so they all batch. Was 4 + 2N sequential `readContract`s.
 */
export async function readAccountReads(
  client: CometReadClient,
  comet: Address,
  baseTokenPriceFeed: Address,
  user: Address,
  assets: readonly AssetFeedInput[],
  numAssets: number,
): Promise<AccountReads> {
  const res = await client.multicall({
    allowFailure: true,
    contracts: [
      { address: comet, abi: COMET_PORTAL_ABI, functionName: "balanceOf", args: [user] },
      { address: comet, abi: COMET_PORTAL_ABI, functionName: "borrowBalanceOf", args: [user] },
      { address: comet, abi: COMET_PORTAL_ABI, functionName: "getPrice", args: [baseTokenPriceFeed] },
      { address: comet, abi: COMET_PORTAL_ABI, functionName: "isBorrowCollateralized", args: [user] },
      ...assets.flatMap((a) => [
        { address: comet, abi: COMET_PORTAL_ABI, functionName: "userCollateral", args: [user, a.asset] },
        { address: comet, abi: COMET_PORTAL_ABI, functionName: "getPrice", args: [a.priceFeed] },
      ]),
    ],
  });

  const supplyBal = asBigint(mcResult(res[0]));
  const borrowBal = asBigint(mcResult(res[1]));
  const basePrice = asBigint(mcResult(res[2]));
  // No collaterals configured → trivially collateralized (matches the prior
  // guard that skipped the on-chain check when numAssets === 0).
  const collateralized = numAssets > 0 ? mcResult(res[3]) === true : true;
  const perAsset = assets.map((_, i) => {
    const balRaw = mcResult(res[4 + i * 2]);
    const balance = Array.isArray(balRaw) ? asBigint(balRaw[0]) : asBigint(balRaw);
    const priceX8 = asBigint(mcResult(res[4 + i * 2 + 1]));
    return { balance, priceX8 };
  });

  return { supplyBal, borrowBal, basePrice, collateralized, perAsset };
}
