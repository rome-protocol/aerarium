"use client";

// /evm/dashboard — the EVM lane's rich, read-first portfolio. Driven by the
// SAME useEvmLane adapter the lane home uses (no new data plumbing — just a
// different view of adapter.position): reuses PositionSummary (aggregate) +
// DashboardPositions (per-asset breakdown). The per-asset Supply/Borrow/Withdraw
// buttons deep-link back to the lane home's action surface (/evm?asset=&action=)
// so the dashboard never re-hosts the ActionPanel. Below that, a read-only
// StorefrontSection surfaces any seized collateral for sale (buyCollateral
// opportunity; the live buy is a funded follow-up). EvmLaneShell gates on
// connection (positions are wallet-specific → ConnectCard when disconnected).

import { useMemo } from "react";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";

import { EvmLaneShell } from "@/components/aerarium/lane/EvmLaneShell";
import { DashboardView } from "@/components/aerarium/lane/DashboardView";
import { StorefrontSection } from "@/components/aerarium/lane/StorefrontSection";
import { useEvmLane } from "@/lib/lane/useEvmLane";
import { useStorefront } from "@/lib/portal/hooks/useStorefront";
import { useEnv } from "@/lib/env-context";
import { configForChain, DEFAULT_CHAIN_CONFIG } from "@/lib/config";
import type { ActionType } from "@/components/aerarium/lane/types";

// Same NEXT_PUBLIC_COMET_PROXY override the lane + /evm/liquidate read, so the
// dashboard targets the identical Comet. undefined → registry/config.
const ENV_COMET_PROXY = process.env.NEXT_PUBLIC_COMET_PROXY || undefined;

const evmHref = (action: ActionType, sym: string) =>
  `/evm?asset=${encodeURIComponent(sym)}&action=${action}`;

export default function EvmDashboardPage() {
  const adapter = useEvmLane();
  const { defaultChainId } = useEnv();
  const activeChainId = defaultChainId ?? DEFAULT_CHAIN_CONFIG.rome.chainId;
  const activeConfig = useMemo(() => configForChain(activeChainId) ?? DEFAULT_CHAIN_CONFIG, [activeChainId]);
  const comet = (ENV_COMET_PROXY ?? activeConfig.rome.cometProxyCollateral) as Address;
  const publicClient = usePublicClient({ chainId: activeChainId });

  const { storefront, loading: storefrontLoading } = useStorefront(publicClient, comet);

  return (
    <EvmLaneShell>
      <DashboardView
        position={adapter.position}
        hasPosition={adapter.hasPosition}
        positionLoading={adapter.positionLoading}
        actionHref={evmHref}
      />
      <div style={{ marginTop: 20 }}>
        <StorefrontSection storefront={storefront} loading={storefrontLoading} />
      </div>
    </EvmLaneShell>
  );
}
