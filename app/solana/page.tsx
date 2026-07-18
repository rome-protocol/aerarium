"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LaneApp } from "@/components/aerarium/lane/LaneApp";
import { useSolanaLane } from "@/lib/lane/useSolanaLane";

// Solana lane (/solana) — the designer's connected Solana-lane screen (incl. the
// first-time Activate step + multi-sig progress), driven by the real
// Solana-native adapter: a Phantom/Solflare/Backpack wallet runs EVM Compound-v3
// actions on Rome via DoTxUnsigned, with NO Ethereum key (the user's EVM
// identity is the synthetic address keccak(solana_pubkey)[12:]). See
// lib/lane/useSolanaLane.ts. The dashboard deep-links here with ?asset=&action=
// to pre-open the action panel; useSearchParams needs a Suspense boundary.
function SolanaLane() {
  const adapter = useSolanaLane();
  const sp = useSearchParams();
  return <LaneApp adapter={adapter} initialAsset={sp.get("asset")} initialAction={sp.get("action")} />;
}

export default function SolanaLanePage() {
  return (
    <Suspense fallback={null}>
      <SolanaLane />
    </Suspense>
  );
}
