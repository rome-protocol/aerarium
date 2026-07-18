"use client";
// =====================================================================
// AERARIUM — DashboardView (shared body of /evm/dashboard + /solana/dashboard)
// The dedicated dashboard the header's "Dashboard" link now points at. It is
// lane-agnostic: the page passes the adapter's position slice + a lane-aware
// actionHref. Composition only — reuses PositionSummary (aggregate) +
// DashboardPositions (per-asset breakdown), both already tested. The only logic
// here is the empty/loading branch (so we never flash "—" before the first
// read lands). Actions deep-link back to the lane home, so this page never
// re-hosts the action flow. Phase B adds a storefront section below.
// =====================================================================
import "@/app/aerarium-app.css";
import { Spin, eyebrow } from "./primitives";
import { PositionSummary } from "./PositionSummary";
import { DashboardPositions } from "./DashboardPositions";
import type { LanePosition, ActionType } from "./types";

export interface DashboardViewProps {
  position: LanePosition;
  hasPosition: boolean;
  positionLoading: boolean;
  /** Lane-aware deep-link to the lane home's action surface (/evm?… or /solana?…). */
  actionHref: (action: ActionType, sym: string) => string;
}

export function DashboardView({ position, hasPosition, positionLoading, actionHref }: DashboardViewProps) {
  // Aggregate metrics read "—" until the first read lands or when genuinely empty.
  const empty = !hasPosition || positionLoading;
  return (
    <>
      <section style={{ marginBottom: 24 }}>
        <div style={{ ...eyebrow, marginBottom: 12 }}>Dashboard</div>
        <h1 className="aer-display" style={{ margin: 0, fontWeight: 400, fontSize: "clamp(30px, 4.5vw, 40px)" }}>
          Your portfolio
        </h1>
        <p style={{ margin: "12px 0 0", maxWidth: 640, fontFamily: "var(--font-sans)", fontSize: 14, lineHeight: 1.55, color: "var(--marble-2)" }}>
          Every position and asset in the shared pool — supply, borrow, and balances at a glance. Actions open in your lane.
        </p>
      </section>

      {positionLoading && !hasPosition && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderRadius: "var(--r-md)", background: "var(--lane-wash)", border: "1px solid var(--lane)", marginBottom: 22 }}>
          <Spin size={15} color="var(--lane)" />
          <span style={{ fontSize: 14.5, color: "var(--marble)" }}>Loading your positions…</span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <PositionSummary
          supplied={position.supplied}
          borrowed={position.borrowed}
          capacity={position.capacity}
          healthFactor={position.healthFactor}
          netApr={position.netApr}
          empty={empty}
          pricesStale={position.pricesStale}
        />
        <DashboardPositions assets={position.assets} actionHref={actionHref} />
      </div>
    </>
  );
}
