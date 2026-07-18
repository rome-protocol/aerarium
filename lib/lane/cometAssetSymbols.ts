// Shared, canonical Comet asset enumeration for BOTH lanes.
//
// The /evm and /solana lanes must render the SAME asset rows (set + symbol +
// decimals + order). Both enumerate the Comet's on-chain assets via
// numAssets + getAssetInfo, so the SET already matches by construction — but
// the LABELS used to diverge: the EVM lane labelled collaterals from the
// registry map (DEFAULT_CHAIN_CONFIG_RAW.collateralAssets), which only carries the
// collaterals known at registry-publish time, so a Comet with extra collats
// rendered "asset" for the unknown ones. The Solana lane read on-chain
// symbol()/decimals() and got them right.
//
// This module is the single source of truth both lanes call: it reads the
// on-chain symbol() + decimals() for the base asset and every collateral,
// in the canonical Comet order (base first), so the rendered rows are
// identical by construction. No wallet / account needed — it reads only the
// Comet's static asset config + each wrapper's ERC20 metadata.

import { erc20Abi, type Address } from "viem";

/** Minimal Comet ABI needed to enumerate assets. */
const COMET_ENUM_ABI = [
  { type: "function", name: "numAssets", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  {
    type: "function",
    name: "getAssetInfo",
    stateMutability: "view",
    inputs: [{ type: "uint8" }],
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

/** One Comet asset with its canonical (on-chain) symbol + decimals. */
export interface CometAssetSymbol {
  /** Wrapper (SPL_ERC20) contract address. */
  address: Address;
  /** On-chain ERC20 symbol() — the canonical display symbol. */
  symbol: string;
  /** On-chain ERC20 decimals(). */
  decimals: number;
  /** true for the Comet base asset (first row). */
  isBase: boolean;
}

export interface CometAssetSymbols {
  /** Canonical asset order: base first, then collaterals as getAssetInfo lists them. */
  ordered: CometAssetSymbol[];
  /** address (lowercased) → on-chain symbol. */
  symbolByAddress: Record<string, string>;
  /** address (lowercased) → on-chain decimals. */
  decimalsByAddress: Record<string, number>;
}

/**
 * The viem read surface both lanes' clients satisfy (wagmi's publicClient and
 * the Solana lane's createPublicClient both expose these). viem's readContract
 * / multicall are heavily generic; we only need to call them, so the params are
 * loosely typed (any) — the ABIs + functionNames passed below are concrete.
 */
export interface CometReadClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readContract: (args: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  multicall: (args: any) => Promise<readonly { status: string; result?: unknown }[]>;
}

/** Pull a multicall result, undefined on failure. */
function mcResult(entry: { status: string; result?: unknown } | undefined): unknown {
  return entry && entry.status === "success" ? entry.result : undefined;
}

/**
 * Read the canonical (on-chain) symbol + decimals for the Comet's base asset
 * and every collateral, in Comet order (base first). Used by BOTH lanes so the
 * rendered asset rows are identical by construction.
 *
 * Falls back gracefully: a wrapper whose symbol()/decimals() reverts gets a
 * truncated-address symbol and a 0-decimals placeholder (rather than crashing
 * the whole enumeration). The base address + order always come from the Comet.
 */
export async function readCometAssetSymbols(
  client: CometReadClient,
  comet: Address,
  baseAddress: Address,
): Promise<CometAssetSymbols> {
  const numAssets = Number(
    await client.readContract({ address: comet, abi: COMET_ENUM_ABI, functionName: "numAssets" }),
  );

  const infoRes = await client.multicall({
    allowFailure: true,
    contracts: Array.from({ length: numAssets }, (_, i) => ({
      address: comet,
      abi: COMET_ENUM_ABI,
      functionName: "getAssetInfo",
      args: [i],
    })),
  });
  const collatAddrs = infoRes
    .map((r) => (r.status === "success" ? (r.result as { asset: Address }).asset : null))
    .filter((a): a is Address => a != null);

  // Base first, then collaterals — the canonical Comet order both lanes share.
  const addrs: Address[] = [baseAddress, ...collatAddrs];

  const symDec = await client.multicall({
    allowFailure: true,
    contracts: addrs.flatMap((address) => [
      { address, abi: erc20Abi, functionName: "symbol" },
      { address, abi: erc20Abi, functionName: "decimals" },
    ]),
  });

  const ordered: CometAssetSymbol[] = addrs.map((address, i) => {
    const symRaw = mcResult(symDec[i * 2]);
    const decRaw = mcResult(symDec[i * 2 + 1]);
    const symbol = typeof symRaw === "string" && symRaw.length > 0 ? symRaw : address.slice(0, 6);
    const decimals = decRaw === undefined ? 0 : Number(decRaw);
    return { address, symbol, decimals, isBase: i === 0 };
  });

  const symbolByAddress: Record<string, string> = {};
  const decimalsByAddress: Record<string, number> = {};
  for (const a of ordered) {
    symbolByAddress[a.address.toLowerCase()] = a.symbol;
    decimalsByAddress[a.address.toLowerCase()] = a.decimals;
  }

  return { ordered, symbolByAddress, decimalsByAddress };
}
