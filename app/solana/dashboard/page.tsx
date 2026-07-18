"use client";

// /solana/dashboard — the Solana lane's rich, read-first portfolio. Driven by
// the SAME useSolanaLane adapter the /solana lane home uses (Phantom →
// DoTxUnsigned, synthetic EVM identity; no new data plumbing — just a different
// view of adapter.position): reuses PositionSummary (aggregate) +
// DashboardPositions (per-asset breakdown). Per-asset actions deep-link back to
// the /solana lane home's action surface (/solana?asset=&action=) so this page
// never re-hosts the action flow. Below that, a read-only StorefrontSection
// surfaces any seized collateral for sale (read over the lane's wallet-
// independent evmClient; the live buy is a funded follow-up). SolanaLaneShell
// gates on connection (positions are wallet-specific → ConnectCard).

import { SolanaLaneShell } from "@/components/aerarium/lane/SolanaLaneShell";
import { DashboardView } from "@/components/aerarium/lane/DashboardView";
import { StorefrontSection } from "@/components/aerarium/lane/StorefrontSection";
import { useSolanaLane } from "@/lib/lane/useSolanaLane";
import { useSolanaActions } from "@/lib/lane/useSolanaActions";
import { useStorefront } from "@/lib/portal/hooks/useStorefront";
import type { Address } from "viem";
import type { ActionType } from "@/components/aerarium/lane/types";

const solHref = (action: ActionType, sym: string) =>
  `/solana?asset=${encodeURIComponent(sym)}&action=${action}`;

export default function SolanaDashboardPage() {
  const adapter = useSolanaLane();
  // The storefront reads are wallet-independent — same evmClient the lane uses.
  const { evmClient, cfg } = useSolanaActions();
  const { storefront, loading: storefrontLoading } = useStorefront(evmClient, cfg.comet as Address | undefined);

  return (
    <SolanaLaneShell>
      <DashboardView
        position={adapter.position}
        hasPosition={adapter.hasPosition}
        positionLoading={adapter.positionLoading}
        actionHref={solHref}
      />
      <div style={{ marginTop: 20 }}>
        <StorefrontSection storefront={storefront} loading={storefrontLoading} />
      </div>
    </SolanaLaneShell>
  );
}
