// Shared, server-side market cache. ONE on-chain read per chain per revalidate
// window (unstable_cache, keyed by chainId) collapses the cross-user/cross-tab
// duplication of the reserve / rate / TVL / price reads — the market half of a
// connected tab's proxy load.
//
// The pure buildMarketState is unit tested; the unstable_cache wrapper is NOT
// unit testable (next/cache needs the Next runtime — plan Issue 3), so it's
// validated by the deferred Task −1 spike + the Task 10 live measurement.
//
// Carries the raw ReserveReads bigints (not just the USD-mapped numbers) so the
// EVM lane's capacity math stays exact across the JSON boundary; the route
// serializes them via lib/market/bigintJson and the client revives them.

import { unstable_cache } from "next/cache";
import { createPublicClient, http, defineChain, type Address } from "viem";
import { configForChain } from "@/lib/config";
import { readOnchainMarket, type OnchainMarket } from "./onchain";
import { serializeBigints } from "./bigintJson";
import { createIndexerClient, type IndexerClient } from "./indexer/client";
import { indexerBaseFromExplorer } from "./liveSource";
import { decodeTransfers, type TransferEvent } from "./indexer/decode";
import { aggregateRecentActivity } from "./indexer/activity";
import type { ActivityRow, OpenLiquidation } from "./MarketSource";

export interface MarketState {
  pool: OnchainMarket["pool"];
  markets: OnchainMarket["markets"];
  basePriceUsd: number;
  symbolByAddr: OnchainMarket["symbolByAddr"];
  /** Σ of every collateral market row's USD (the base row is excluded). */
  totalCollateral: number;
  /** Raw reserve bigints — for exact client-side capacity math (Issue 12). */
  raw: OnchainMarket["raw"];
}

/**
 * Pure, cache-agnostic shaping of a market read into the cached payload. Throws
 * whatever `readMarket` throws, so the unstable_cache wrapper caches NOTHING on
 * an RPC failure (a transient blip degrades to preview rather than caching an
 * error as truth for the whole revalidate window).
 */
export async function buildMarketState(deps: { readMarket: () => Promise<OnchainMarket> }): Promise<MarketState> {
  const m = await deps.readMarket();
  const totalCollateral = m.markets
    .filter((row) => row.kind === "collateral")
    .reduce((sum, row) => sum + row.total, 0);
  return {
    pool: m.pool,
    markets: m.markets,
    basePriceUsd: m.basePriceUsd,
    symbolByAddr: m.symbolByAddr,
    totalCollateral,
    raw: m.raw,
  };
}

/**
 * Make a value safe to hand to unstable_cache, which persists it via an INTERNAL
 * JSON.stringify — and raw bigints throw "Do not know how to serialize a BigInt"
 * there, so the cache silently stores nothing and never collapses load. Encodes
 * bigints as {__bigint__:"<dec>"} tags (JSON-safe); the route passes them through
 * and the client's reviveBigints turns them back into bigints. Applied INSIDE the
 * cached fn so the value crossing the cache boundary is already bigint-free.
 */
export function toCacheSafe<T>(v: T): T {
  return JSON.parse(serializeBigints(v)) as T;
}

/** Server-side viem read client (direct chain RPC + Multicall3) for a chain. */
function clientFor(chainId: number) {
  const cfg = configForChain(chainId);
  if (!cfg) throw new Error(`unknown chain ${chainId}`);
  const r = cfg.rome;
  const chain = defineChain({
    id: r.chainId,
    name: `rome-${r.chainId}`,
    nativeCurrency: { name: "Gas", symbol: "GAS", decimals: 18 },
    rpcUrls: { default: { http: [r.rpcUpstream] } },
    contracts: r.multicall3 ? { multicall3: { address: r.multicall3 as Address } } : undefined,
  });
  // The connected app (both lanes) reads/borrows against cometProxyCollateral,
  // NOT the primary cometProxy — so the shared cache reads the SAME comet the
  // EVM lane's useReserveStats market describes. They coincide on single-comet
  // chains (Hadrian/Trajan); on a multi-comet chain (e.g. 30001 supply-only vs
  // multicollat) reading the primary would misalign reads.collats with the
  // lane's market.assets. The dev-only NEXT_PUBLIC_COMET_PROXY override is not
  // mirrored here (it's unset in prod, where it equals cometProxyCollateral).
  return { client: createPublicClient({ chain, transport: http(r.rpcUpstream) }), comet: r.cometProxyCollateral as Address };
}

/**
 * Shared market state for a chain, cached 30s (T2). keyParts MUST include
 * String(chainId): unstable_cache keys on cb.toString() + keyParts + args, so a
 * static key with chainId only in the closure would collide across chains
 * (cross-chain bleed). Tagged market:${chainId} for POST /api/revalidate.
 */
export const getCachedMarket = (chainId: number) =>
  unstable_cache(
    async () => {
      const { client, comet } = clientFor(chainId);
      // toCacheSafe: unstable_cache JSON.stringifies the return to persist it, and
      // state.raw carries bigints — un-encoded they throw + nothing caches. The
      // client revives via reviveBigints.
      return toCacheSafe(await buildMarketState({ readMarket: () => readOnchainMarket(client, comet) }));
    },
    ["market-state", String(chainId)],
    { revalidate: 30, tags: [`market:${chainId}`] },
  )();

/** Indexer wiring (base URL + comet + base symbol) for a chain. */
function indexerFor(chainId: number) {
  const cfg = configForChain(chainId);
  if (!cfg) throw new Error(`unknown chain ${chainId}`);
  return {
    base: indexerBaseFromExplorer(cfg.rome.explorerUrl),
    comet: cfg.rome.cometProxyCollateral as string, // connected-app comet (see clientFor)
    baseSymbol: cfg.rome.baseSymbol ?? "USDC",
  };
}

/**
 * Pure recent-activity build: indexer tx list + per-tx transfer logs →
 * aggregated rows. Throws if the (strict) indexer is unreachable so the cache
 * caches nothing; `symbolByAddr` resolves the moved token's label + amount.
 */
export async function buildActivity(deps: {
  indexer: IndexerClient;
  comet: string;
  symbolByAddr: Record<string, { symbol: string; decimals: number }>;
  nowMs?: number;
  max?: number;
}): Promise<ActivityRow[]> {
  const { indexer, comet, symbolByAddr, nowMs = Date.now(), max = 200 } = deps;
  const txs = await indexer.listCometTxs(comet, { max });
  const transfersByHash: Record<string, TransferEvent[]> = {};
  await Promise.all(
    txs.map(async (t) => {
      transfersByHash[t.hash] = decodeTransfers(await indexer.txLogs(t.hash));
    }),
  );
  return aggregateRecentActivity({ txs, transfersByHash, symbolByAddr, comet, nowMs });
}

/**
 * Pure open-liquidations build: indexer candidate addresses → on-chain
 * isLiquidatable check (injected) → minimal rows for the liquidatable ones. The
 * candidate set is cross-lane (the indexer sees Solana-origin actions that
 * eth_getLogs would miss). `checkLiquidatable` is the only chain I/O.
 */
export async function buildLiquidatable(deps: {
  indexer: IndexerClient;
  comet: string;
  baseSymbol: string;
  checkLiquidatable: (accounts: string[]) => Promise<boolean[]>;
}): Promise<OpenLiquidation[]> {
  const { indexer, comet, baseSymbol, checkLiquidatable } = deps;
  const txs = await indexer.listCometTxs(comet, { max: 200 });
  const candidates = [...new Set(txs.map((t) => t.from.toLowerCase()))];
  if (!candidates.length) return [];
  const flags = await checkLiquidatable(candidates);
  return candidates
    .filter((_, i) => flags[i])
    .map((acc) => ({
      id: acc,
      side: "evm" as const,
      borrower: `${acc.slice(0, 6)}…${acc.slice(-4)}`,
      collateral: "—",
      collateralUsd: 0,
      debt: baseSymbol,
      health: 0,
      reward: 0,
      age: "",
      illustrative: false,
    }));
}

const ISLIQUIDATABLE_ABI = [
  { type: "function", name: "isLiquidatable", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
] as const;

/**
 * Cross-lane recent activity for a chain, cached 30s (T2). Ages are frozen at
 * cache-fill (≤30s stale) — acceptable at the "2m"/"3h" granularity (Issue 7).
 */
export const getCachedActivity = (chainId: number) =>
  unstable_cache(
    async () => {
      const { base, comet } = indexerFor(chainId);
      const indexer = createIndexerClient(base, fetch, { strict: true });
      const market = await getCachedMarket(chainId); // cached → symbolByAddr, no extra on-chain read
      return buildActivity({ indexer, comet, symbolByAddr: market.symbolByAddr });
    },
    ["activity", String(chainId)],
    { revalidate: 30, tags: [`market:${chainId}`] },
  )();

/**
 * Open liquidations for a chain, cached 30s (T2) — replaces the per-tab getLogs
 * scan. Probes isLiquidatable across the cross-lane candidate addresses.
 */
export const getCachedLiquidatable = (chainId: number) =>
  unstable_cache(
    async () => {
      const { base, comet, baseSymbol } = indexerFor(chainId);
      const { client } = clientFor(chainId);
      const indexer = createIndexerClient(base, fetch, { strict: true });
      const checkLiquidatable = async (accounts: string[]) => {
        const res = await client.multicall({
          allowFailure: true,
          contracts: accounts.map((acc) => ({
            address: comet as Address,
            abi: ISLIQUIDATABLE_ABI,
            functionName: "isLiquidatable",
            args: [acc as Address],
          })),
        });
        return res.map((r) => r.status === "success" && r.result === true);
      };
      return buildLiquidatable({ indexer, comet, baseSymbol, checkLiquidatable });
    },
    ["liquidatable", String(chainId)],
    { revalidate: 30, tags: [`market:${chainId}`] },
  )();
