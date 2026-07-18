// Compound v3 storefront ("buy seized collateral") reads — client-agnostic so
// BOTH lanes reuse them (EVM publicClient / Solana evmClient), mirroring
// fetchUnhealthyAccounts. Read-only here: it answers "what seized collateral is
// for sale right now?" The live buyCollateral action is a funded follow-up
// (buyCollateral reverts NotForSale until a real absorb seeds reserves, so it
// can't be exercised — or verified — until then).
//
// "For sale" logic (from the Comet contract, see app/discovery/page.tsx):
//   - The storefront is OPEN when getReserves() < targetReserves() (the protocol
//     is below its base-reserve target, so it sells seized collateral to refill).
//     buyCollateral reverts NotForSale otherwise.
//   - A given collateral is buyable when getCollateralReserves(asset) > 0 (the
//     protocol actually holds some seized units of it; else InsufficientReserves).
import { erc20Abi, type Address, type PublicClient } from "viem";

export interface StorefrontItem {
  asset: Address;
  symbol: string;
  /** Seized units the protocol holds for sale, in the asset's own token units. */
  availableTokens: number;
}

export interface Storefront {
  /** getReserves() < targetReserves() — buyCollateral would not revert NotForSale. */
  open: boolean;
  /** Collaterals with reserves > 0 (only populated when open). */
  items: StorefrontItem[];
}

interface CollatReserve {
  asset: Address;
  symbol: string;
  reserves: bigint;
  decimals: number;
}

/**
 * Pure storefront decision: closed (no items) when reserves >= target; else the
 * collaterals the protocol actually holds (reserves > 0), in token units.
 */
export function buildStorefront(reserves: bigint, target: bigint, collats: CollatReserve[]): Storefront {
  const open = reserves < target;
  if (!open) return { open: false, items: [] };
  const items = collats
    .filter((c) => c.reserves > 0n)
    .map((c) => ({ asset: c.asset, symbol: c.symbol, availableTokens: Number(c.reserves) / 10 ** c.decimals }));
  return { open: true, items };
}

const COMET_STOREFRONT_ABI = [
  { type: "function", name: "getReserves", stateMutability: "view", inputs: [], outputs: [{ type: "int256" }] },
  { type: "function", name: "targetReserves", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "numAssets", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  {
    type: "function",
    name: "getCollateralReserves",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getAssetInfo",
    stateMutability: "view",
    inputs: [{ name: "i", type: "uint8" }],
    outputs: [
      {
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

/**
 * Read the live storefront over any viem PublicClient. Cheap in the common case
 * (3 reads → closed → no per-asset scan); only walks the collateral list when
 * the storefront is actually open (rare — needs a prior liquidation).
 */
export async function fetchStorefront(client: PublicClient, comet: Address): Promise<Storefront> {
  const [reserves, target, numAssets] = (await Promise.all([
    client.readContract({ address: comet, abi: COMET_STOREFRONT_ABI, functionName: "getReserves" }),
    client.readContract({ address: comet, abi: COMET_STOREFRONT_ABI, functionName: "targetReserves" }),
    client.readContract({ address: comet, abi: COMET_STOREFRONT_ABI, functionName: "numAssets" }),
  ])) as [bigint, bigint, number];

  if (!(reserves < target)) return { open: false, items: [] };

  const collats: CollatReserve[] = [];
  for (let i = 0; i < Number(numAssets); i++) {
    const info = (await client.readContract({
      address: comet,
      abi: COMET_STOREFRONT_ABI,
      functionName: "getAssetInfo",
      args: [i],
    })) as { asset: Address; scale: bigint };
    const asset = info.asset;
    const decimals = Math.round(Math.log10(Number(info.scale)));
    const [reservesC, symbol] = await Promise.all([
      client.readContract({ address: comet, abi: COMET_STOREFRONT_ABI, functionName: "getCollateralReserves", args: [asset] }) as Promise<bigint>,
      (client.readContract({ address: asset, abi: erc20Abi, functionName: "symbol" }) as Promise<string>).catch(() => asset.slice(0, 6)),
    ]);
    collats.push({ asset, symbol, reserves: reservesC, decimals });
  }
  return buildStorefront(reserves, target, collats);
}
