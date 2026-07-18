"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LaneApp } from "@/components/aerarium/lane/LaneApp";
import { useEvmLane } from "@/lib/lane/useEvmLane";

// EVM lane (/evm) — the designer's connected Ethereum-lane screen, driven by
// the real wagmi + Compound-hooks adapter. Reads target the same collat-aware
// Comet the legacy /supply + /borrow pages use, so the numbers match. The
// dashboard deep-links here with ?asset=&action= to pre-open the action panel;
// useSearchParams needs a Suspense boundary (Next App Router).
function EvmLane() {
  const adapter = useEvmLane();
  const sp = useSearchParams();
  return <LaneApp adapter={adapter} initialAsset={sp.get("asset")} initialAction={sp.get("action")} />;
}

export default function EvmLanePage() {
  return (
    <Suspense fallback={null}>
      <EvmLane />
    </Suspense>
  );
}
