// Live MarketSource for the front page. Composes:
//   - on-chain reserve reads (readOnchainMarket → TVL / APR / utilization / per-asset)
//   - indexer activity (suppliers + EVM/Sol supply/borrow split from /txs + logs)
// for the slices we have real data for (poolSplit, markets). arenaStats and
// openLiquidations stay on the preview `fallback` until the liquidation/activity
// scope lands. Every live path degrades to the preview source on error, so a
// flaky RPC / indexer renders a preview badge rather than crashing the page.

import { createPublicClient, http, defineChain, type Address } from "viem";
import type { MarketSource, PoolSplit, MarketRow, ArenaStats, OpenLiquidation, ActivityRow } from "./MarketSource";
import { readOnchainMarket, type OnchainMarket } from "./onchain";
import { createIndexerClient, type IndexerClient, type IndexerTx } from "./indexer/client";
import { decodeTransfers, type TransferEvent } from "./indexer/decode";
import { aggregatePoolActivity } from "./indexer/aggregate";
import { aggregateRecentActivity, aggregateArenaCounts } from "./indexer/activity";

export interface LiveSourceDeps {
  /** Read the comet's on-chain reserves → pool numbers + market rows. */
  readMarket: () => Promise<OnchainMarket>;
  indexer: IndexerClient;
  comet: string;
  /** Preview source for slices without live data + degraded-mode fallback. */
  fallback: MarketSource;
  /** Cap on per-tx log fetches (each is one indexer round-trip). */
  maxTxs?: number;
  /** Real open-liquidation probe over candidate addresses (on-chain
   *  isLiquidatable + enrichment). Omitted → no liquidatable positions. */
  loadOpenLiquidations?: (candidates: string[]) => Promise<OpenLiquidation[]>;
}

/**
 * Allocate a real `total` (current net, on-chain) across the two lanes by the
 * ratio of their indexer-derived gross activity. The indexer gives *attribution*
 * (which lane the flow came from), not a net balance — so using gross parts as a
 * RATIO against the real total keeps the split consistent (evm + sol === total)
 * while still reflecting lane origin. No attributing activity → 0/0 (can't split;
 * the real headline total still stands).
 */
export function allocateByRatio(total: number, evmPart: number, solPart: number): { evm: number; sol: number } {
  const gross = evmPart + solPart;
  if (gross <= 0) return { evm: 0, sol: 0 };
  // Exact when all activity is on one lane (avoids float drift leaving a tiny
  // negative on the other); proportional otherwise.
  if (solPart <= 0) return { evm: total, sol: 0 };
  if (evmPart <= 0) return { evm: 0, sol: total };
  const evm = (total * evmPart) / gross;
  return { evm, sol: total - evm };
}

export function createLiveSource(deps: LiveSourceDeps): MarketSource {
  const { readMarket, indexer, comet, fallback, maxTxs = 200, loadOpenLiquidations } = deps;

  // Shared indexer+chain fetch, memoized for the lifetime of this source (one
  // request): the page calls poolSplit / markets / arenaStats / openLiquidations
  // / recentActivity in parallel — they all need the same market + tx list +
  // decoded transfers, so fetch it once.
  let cached: Promise<{ market: OnchainMarket; txs: IndexerTx[]; transfersByHash: Record<string, TransferEvent[]> }> | null = null;
  const load = () => {
    if (!cached) {
      cached = (async () => {
        const market = await readMarket();
        const txs = await indexer.listCometTxs(comet, { max: maxTxs });
        const transfersByHash: Record<string, TransferEvent[]> = {};
        await Promise.all(
          txs.map(async (t) => {
            transfersByHash[t.hash] = decodeTransfers(await indexer.txLogs(t.hash));
          }),
        );
        return { market, txs, transfersByHash };
      })();
    }
    return cached;
  };

  return {
    async poolSplit(): Promise<PoolSplit> {
      try {
        const { market, txs, transfersByHash } = await load();

        const baseScale = 10 ** market.baseDecimals;
        const usdValue = (_token: string, raw: bigint) => (Number(raw) / baseScale) * market.basePriceUsd;
        const activity = aggregatePoolActivity({
          txs,
          transfersByHash,
          comet,
          baseToken: market.baseToken,
          usdValue,
        });

        // Attribute the REAL on-chain totals across lanes by the indexer's gross
        // activity ratio (so the split sums to the headline, not lifetime gross).
        const supplied = allocateByRatio(market.pool.totalSuppliedUsd, activity.suppliedEvm, activity.suppliedSol);
        const borrowed = allocateByRatio(market.pool.totalBorrowedUsd, activity.borrowedEvm, activity.borrowedSol);

        // Collateral side = Σ of every collateral market row's USD (the base row
        // is the supplied/borrowed side, excluded here).
        const totalCollateral = market.markets
          .filter((m) => m.kind === "collateral")
          .reduce((sum, m) => sum + m.total, 0);

        return {
          totalSupplied: market.pool.totalSuppliedUsd,
          totalBorrowed: market.pool.totalBorrowedUsd,
          totalCollateral,
          // Net rate from the supplier's view (what the pool pays suppliers).
          netApr: market.pool.supplyAprPct,
          supplyApr: market.pool.supplyAprPct,
          borrowApr: market.pool.borrowAprPct,
          suppliedEvm: supplied.evm,
          suppliedSol: supplied.sol,
          borrowedEvm: borrowed.evm,
          borrowedSol: borrowed.sol,
          suppliers: activity.suppliers,
          utilization: market.pool.utilizationPct,
          illustrative: false,
        };
      } catch {
        return fallback.poolSplit();
      }
    },

    async markets(): Promise<MarketRow[]> {
      try {
        return (await load()).market.markets;
      } catch {
        return fallback.markets();
      }
    },

    async recentActivity(): Promise<ActivityRow[]> {
      try {
        const { market, txs, transfersByHash } = await load();
        return aggregateRecentActivity({
          txs,
          transfersByHash,
          symbolByAddr: market.symbolByAddr,
          comet,
          nowMs: Date.now(),
        });
      } catch {
        return fallback.recentActivity();
      }
    },

    async arenaStats(): Promise<ArenaStats> {
      try {
        const { txs } = await load();
        const c = aggregateArenaCounts(txs);
        // Real liquidation counts per lane. valueSeized / biggestHit /
        // positionsDefended / streak need per-absorb USD decoding — 0 until there
        // ARE liquidations (and a follow-up to value them); honest at zero.
        const side = (won: number) => ({ liquidationsWon: won, valueSeized: 0, biggestHit: 0, positionsDefended: 0, streak: 0 });
        return { evm: side(c.evm), sol: side(c.sol), illustrative: false };
      } catch {
        return fallback.arenaStats();
      }
    },

    async openLiquidations(): Promise<OpenLiquidation[]> {
      try {
        const { txs } = await load();
        // Candidate set = every distinct address that has acted on the comet
        // (cross-lane, from the indexer — eth_getLogs would miss the Solana lane).
        const candidates = [...new Set(txs.map((t) => t.from.toLowerCase()))];
        return loadOpenLiquidations ? await loadOpenLiquidations(candidates) : [];
      } catch {
        return fallback.openLiquidations();
      }
    },
  };
}

/** Indexer base URL = the chain's rome-via explorer host + /api/v1. */
export function indexerBaseFromExplorer(explorerUrl: string): string {
  return `${explorerUrl.replace(/\/+$/, "")}/api/v1`;
}

interface ChainLike {
  rome: {
    chainId: number;
    rpcUpstream: string;
    explorerUrl: string;
    cometProxy: Address;
    multicall3?: Address;
    baseSymbol?: string;
  };
}

/**
 * Build a live source for a resolved chain config (server-side). Uses the
 * chain's direct RPC (not the browser /api/rome-rpc proxy) with Multicall3, and
 * derives the indexer URL from the registry explorerUrl — so NO new config field
 * is required.
 */
export function liveSourceForChain(cfg: ChainLike, fallback: MarketSource): MarketSource {
  const { rome } = cfg;
  const chain = defineChain({
    id: rome.chainId,
    name: `rome-${rome.chainId}`,
    nativeCurrency: { name: "Gas", symbol: "GAS", decimals: 18 },
    rpcUrls: { default: { http: [rome.rpcUpstream] } },
    contracts: rome.multicall3 ? { multicall3: { address: rome.multicall3 } } : undefined,
  });
  const client = createPublicClient({ chain, transport: http(rome.rpcUpstream) });
  const indexer = createIndexerClient(indexerBaseFromExplorer(rome.explorerUrl));

  return createLiveSource({
    readMarket: () => readOnchainMarket(client, rome.cometProxy),
    indexer,
    comet: rome.cometProxy,
    fallback,
    // Real check: probe comet.isLiquidatable across the candidate addresses. The
    // current comet has none liquidatable → []. Full per-account enrichment
    // (collateral / health / reward) is a follow-up for when positions actually
    // go underwater; this returns honest minimal rows for any that are.
    loadOpenLiquidations: async (candidates) => {
      if (!candidates.length) return [];
      const res = await client.multicall({
        allowFailure: true,
        contracts: candidates.map((acc) => ({
          address: rome.cometProxy,
          abi: ISLIQUIDATABLE_ABI,
          functionName: "isLiquidatable",
          args: [acc as Address],
        })),
      });
      const liquidatable = candidates.filter((_, i) => res[i]?.status === "success" && res[i]?.result === true);
      return liquidatable.map((acc) => ({
        id: acc,
        side: "evm" as const,
        borrower: `${acc.slice(0, 6)}…${acc.slice(-4)}`,
        collateral: "—",
        collateralUsd: 0,
        debt: rome.baseSymbol ?? "USDC",
        health: 0,
        reward: 0,
        age: "",
        illustrative: false,
      }));
    },
  });
}

const ISLIQUIDATABLE_ABI = [
  { type: "function", name: "isLiquidatable", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
] as const;
