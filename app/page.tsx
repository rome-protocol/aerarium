// =====================================================================
// AERARIUM — landing page ("/")
// The read-only marketing front page. Async server component: fetches the
// pool / arena / liquidation / market figures from our MarketSource, then
// hands them to the presentational <AerariumLanding> client tree.
//
// Data source: liveSourceForChain reads the comet's reserves on-chain
// (TVL / APR / utilization / market rows) and the supplier + EVM-vs-Solana
// split from the rome-via indexer. arena + open-liquidations stay preview
// until the liquidation/activity scope lands. Every live slice degrades to
// the phase1 preview source on error, so a flaky RPC/indexer shows a preview
// badge rather than failing the page. No wallet here — read-only.
//
// The landing is dark; its dark treatment is scoped to .aerarium-landing
// (app/aerarium-landing.css) so the rest of the light-only app is unaffected.
// =====================================================================
import "./aerarium-landing.css";
import { phase1Source } from "@/lib/market/phase1Source";
import { liveSourceForChain } from "@/lib/market/liveSource";
import { DEFAULT_CHAIN_CONFIG } from "@/lib/config";
import { AerariumLanding } from "@/components/landing/AerariumLanding";

// Live figures are cached per render and revalidated every 30s (ISR). The
// landing then serves instantly (stale-while-revalidate) instead of blocking
// each request's HTML on ~5 live on-chain reads (which made TTFB 3-10s under
// force-dynamic). The figures are slow-moving, so 30s staleness is acceptable.
export const revalidate = 30;

export default async function Home() {
  const source = liveSourceForChain(DEFAULT_CHAIN_CONFIG, phase1Source);
  const [pool, arena, liquidations, markets, activity] = await Promise.all([
    source.poolSplit(),
    source.arenaStats(),
    source.openLiquidations(),
    source.markets(),
    source.recentActivity(),
  ]);

  return (
    <AerariumLanding
      pool={pool}
      arena={arena}
      liquidations={liquidations}
      markets={markets}
      activity={activity}
    />
  );
}
