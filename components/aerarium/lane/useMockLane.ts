"use client";
// Mock LaneAdapter — mirrors the designer prototype's LANE_DATA + simulated
// timers (aer-lane.jsx). Lets the shared frame render + be verified against the
// prototype before the real wagmi / lib/solana adapters land. NOT shipped to a
// live lane; useEvmLane / useSolanaLane replace it.
import { useCallback, useMemo, useRef, useState } from "react";
import { signSteps, ACTIVATE_STEPS } from "./primitives";
import { optimisticEntry, mergeActivity } from "@/lib/lane/laneActivity";
import type { ActionResult, ActivityItem, LaneAdapter, LanePosition, LaneSide, SignStep, SubmitActionInput } from "./types";

const LANE_DATA: Record<LaneSide, { wallets: string[]; address: string; assets: LanePosition["assets"]; position: LanePosition }> = {
  evm: {
    wallets: ["MetaMask", "Rabby", "WalletConnect"],
    address: "0x1234aB5cD6eF7890123456789abCdEf012345678",
    assets: [
      { sym: "USDC", name: "USD Coin", supplyApy: 5.18, borrowApy: 7.62, borrowable: true, walletBal: 5000, suppliedBal: 0, borrowedBal: 0, walletTokens: 5000, suppliedTokens: 0, borrowedTokens: 0, priceUsd: 1, borrowCollateralFactor: 0 },
      // wETH carries a supply-cap headroom of 1 token (< the 3.2 wallet), so a
      // supply Max is bound by the cap — demonstrating the supplyCap constraint.
      { sym: "wETH", name: "Wrapped Ether", supplyApy: 2.41, borrowApy: 0, borrowable: false, walletBal: 3.2 * 3100, suppliedBal: 0, borrowedBal: 0, walletTokens: 3.2, suppliedTokens: 0, borrowedTokens: 0, priceUsd: 3100, collateral: true, borrowCollateralFactor: 0.83, supplyHeadroomTokens: 1 },
      { sym: "wBTC", name: "Wrapped Bitcoin", supplyApy: 1.92, borrowApy: 0, borrowable: false, walletBal: 0.4 * 64000, suppliedBal: 0, borrowedBal: 0, walletTokens: 0.4, suppliedTokens: 0, borrowedTokens: 0, priceUsd: 64000, collateral: true, borrowCollateralFactor: 0.8 },
    ],
    position: {
      supplied: 12400, borrowed: 4200, capacity: 8930, healthFactor: 2.12, netApr: 2.14,
      // Market-level limits for the min-of-constraints model. Available
      // liquidity ($2,500) is intentionally BELOW the collateral-capacity
      // headroom ($8,930 − $4,200 = $4,730), so a borrow is bound by liquidity —
      // demonstrating the structural fix the operator flagged.
      limits: { availableLiquidityUsd: 2500, baseBorrowMinUsd: 100 },
      assets: [
        { sym: "USDC", name: "USD Coin", supplyApy: 5.18, borrowApy: 7.62, borrowable: true, walletBal: 900, suppliedBal: 0, borrowedBal: 4200, walletTokens: 900, suppliedTokens: 0, borrowedTokens: 4200, priceUsd: 1, borrowCollateralFactor: 0 },
        { sym: "wETH", name: "Wrapped Ether", supplyApy: 2.41, borrowApy: 0, borrowable: false, walletBal: 0, suppliedBal: 9920, borrowedBal: 0, walletTokens: 0, suppliedTokens: 9920 / 3100, borrowedTokens: 0, priceUsd: 3100, collateral: true, borrowCollateralFactor: 0.83 },
        { sym: "wBTC", name: "Wrapped Bitcoin", supplyApy: 1.92, borrowApy: 0, borrowable: false, walletBal: 0, suppliedBal: 2480, borrowedBal: 0, walletTokens: 0, suppliedTokens: 2480 / 64000, borrowedTokens: 0, priceUsd: 64000, collateral: true, borrowCollateralFactor: 0.8 },
      ],
    },
  },
  sol: {
    wallets: ["Phantom", "Solflare", "Backpack"],
    address: "7mxE2pYrNvKqGwLcHDfXhJtFB5d8aRz9C1bP3MnQgxrW",
    assets: [
      { sym: "USDC", name: "USD Coin", supplyApy: 5.18, borrowApy: 7.62, borrowable: true, walletBal: 4200, suppliedBal: 0, borrowedBal: 0, walletTokens: 4200, suppliedTokens: 0, borrowedTokens: 0, priceUsd: 1, borrowCollateralFactor: 0 },
      { sym: "mSOL", name: "Marinade SOL", supplyApy: 3.91, borrowApy: 0, borrowable: false, walletBal: 60 * 168, suppliedBal: 0, borrowedBal: 0, walletTokens: 60, suppliedTokens: 0, borrowedTokens: 0, priceUsd: 168, collateral: true, borrowCollateralFactor: 0.75 },
      { sym: "JitoSOL", name: "Jito Staked SOL", supplyApy: 3.74, borrowApy: 0, borrowable: false, walletBal: 24 * 172, suppliedBal: 0, borrowedBal: 0, walletTokens: 24, suppliedTokens: 0, borrowedTokens: 0, priceUsd: 172, collateral: true, borrowCollateralFactor: 0.75 },
      { sym: "SOL", name: "Solana", supplyApy: 3.28, borrowApy: 0, borrowable: false, walletBal: 40 * 162, suppliedBal: 0, borrowedBal: 0, walletTokens: 40, suppliedTokens: 0, borrowedTokens: 0, priceUsd: 162, collateral: true, borrowCollateralFactor: 0.7 },
    ],
    position: {
      supplied: 8600, borrowed: 3100, capacity: 6160, healthFactor: 1.84, netApr: 1.72,
      // Liquidity ($4,000) sits above the capacity headroom ($6,160 − $3,100 =
      // $3,060), so here CAPACITY binds the borrow — the complementary case.
      limits: { availableLiquidityUsd: 4000, baseBorrowMinUsd: 100 },
      assets: [
        { sym: "USDC", name: "USD Coin", supplyApy: 5.18, borrowApy: 7.62, borrowable: true, walletBal: 740, suppliedBal: 0, borrowedBal: 3100, walletTokens: 740, suppliedTokens: 0, borrowedTokens: 3100, priceUsd: 1, borrowCollateralFactor: 0 },
        { sym: "mSOL", name: "Marinade SOL", supplyApy: 3.91, borrowApy: 0, borrowable: false, walletBal: 0, suppliedBal: 5300, borrowedBal: 0, walletTokens: 0, suppliedTokens: 5300 / 168, borrowedTokens: 0, priceUsd: 168, collateral: true, borrowCollateralFactor: 0.75 },
        { sym: "JitoSOL", name: "Jito Staked SOL", supplyApy: 3.74, borrowApy: 0, borrowable: false, walletBal: 0, suppliedBal: 3300, borrowedBal: 0, walletTokens: 0, suppliedTokens: 3300 / 172, borrowedTokens: 0, priceUsd: 172, collateral: true, borrowCollateralFactor: 0.75 },
      ],
    },
  },
};

const ACTIVITY_SAMPLE: ActivityItem[] = [
  { id: 1, time: "2 min ago", verb: "Supplied", amount: 5300, sym: "mSOL" },
  { id: 2, time: "1 hr ago", verb: "Borrowed", amount: 3100, sym: "USDC" },
  { id: 3, time: "Yesterday", verb: "Supplied", amount: 3300, sym: "JitoSOL" },
];

export function useMockLane(chain: LaneSide): LaneAdapter {
  const D = LANE_DATA[chain];
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [wallet, setWallet] = useState<string | undefined>();
  const [provisioned, setProvisioned] = useState(chain !== "sol");
  const [activating, setActivating] = useState(false);
  const [activateStep, setActivateStep] = useState(0);
  const [hasPosition, setHasPosition] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signStep, setSignStep] = useState(0);
  const [signPlan, setSignPlan] = useState<SignStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Mirror the real adapters: a transient lastResult + optimistic activity rows
  // set on (simulated) success, so the shared success banner + Recent-activity
  // entry render in the mock-driven UI exactly as they will on a live lane.
  const [lastResult, setLastResult] = useState<ActionResult | null>(null);
  const [optimisticActivity, setOptimisticActivity] = useState<ActivityItem[]>([]);
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);

  const connect = useCallback((w: string) => {
    setStatus("connecting"); setWallet(w);
    setTimeout(() => setStatus("connected"), 1100);
  }, []);

  const disconnect = useCallback(() => {
    timers.current.forEach(clearInterval); timers.current = [];
    setStatus("disconnected"); setWallet(undefined); setProvisioned(chain !== "sol");
    setHasPosition(false); setSigning(false); setSignPlan([]); setActivating(false); setError(null);
    setLastResult(null); setOptimisticActivity([]);
  }, [chain]);

  const activate = useCallback(() => {
    setActivating(true); setActivateStep(0);
    let s = 0;
    const t = setInterval(() => {
      s++; setActivateStep(s);
      if (s >= ACTIVATE_STEPS.length) { clearInterval(t); setTimeout(() => { setActivating(false); setProvisioned(true); }, 600); }
    }, 950);
    timers.current.push(t);
  }, []);

  const submitAction = useCallback((input: SubmitActionInput) => {
    setError(null); setLastResult(null); setSigning(true); setSignStep(0);
    // Representative plan: supply/repay assume an approve (the common case) so the
    // mock shows the same exact count the live adapters compute from chain reads.
    const needsApprove = input.type === "supply" || input.type === "repay";
    const steps = signSteps(chain, input.type, { needsApprove });
    setSignPlan(steps);
    let s = 0;
    const t = setInterval(() => {
      s++; setSignStep(s);
      if (s >= steps.length) {
        clearInterval(t);
        setTimeout(() => {
          setSigning(false); setSignPlan([]); setHasPosition(true);
          // Simulated success → record the optimistic row + banner (no txUrl in
          // the mock). amountUsd = entered token amount × the asset's price.
          const amountTokens = Number(input.amount) || 0;
          const priceUsd = input.asset.priceUsd && input.asset.priceUsd > 0 ? input.asset.priceUsd : 1;
          const amountUsd = amountTokens * priceUsd;
          const entry = optimisticEntry({ type: input.type, amountUsd, sym: input.asset.sym });
          setOptimisticActivity((prev) => [entry, ...prev].slice(0, 10));
          setLastResult({ verb: entry.verb, amount: amountUsd, sym: input.asset.sym });
        }, 600);
      }
    }, 950);
    timers.current.push(t);
  }, [chain]);

  const clearError = useCallback(() => setError(null), []);

  // Empty-state position still carries the asset shells AND the market limits,
  // so the ActionPanel exercises the min-of-constraints model (supply-cap on
  // wETH, liquidity floor) before the first simulated action lands.
  const position = hasPosition
    ? D.position
    : { supplied: 0, borrowed: 0, capacity: 0, healthFactor: 0, netApr: 0, assets: D.assets, limits: D.position.limits };

  // Optimistic rows (this session's simulated actions) first, then the canned
  // sample once there's a position — same merge the real adapters do.
  const activity = useMemo(
    () => mergeActivity(optimisticActivity, hasPosition ? ACTIVITY_SAMPLE : []),
    [optimisticActivity, hasPosition],
  );

  return {
    chain, wallets: D.wallets,
    connection: { status, address: status === "connected" ? D.address : undefined, wallet },
    connect, disconnect,
    provisioned, activating, activateStep, activate,
    position, hasPosition, positionLoading: false, activity,
    submitAction, signing, signStep, signPlan,
    error, clearError, lastResult,
  };
}
