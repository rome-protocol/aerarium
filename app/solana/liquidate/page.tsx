"use client";

// /solana/liquidate — Solana-native liquidation (real absorb).
//
// Uses the shared LiquidateView (same shape as /evm/liquidate): an
// auto-discovered list of liquidatable accounts (fetchUnhealthyAccounts over
// the lane's evmClient) PLUS a manual-address entry for log-invisible
// (Solana-native) positions. Each Absorb is an actual comet.absorb(synthetic,
// [victim]) driven by Phantom → DoTxUnsigned, with NO Ethereum key — the
// connected wallet's SYNTHETIC EVM address is the absorber.
//
// absorb seizes an underwater account's collateral and clears its debt (the
// absorber can later buyCollateral at the storeFront discount). It walks every
// one of the victim's collateral positions + their price feeds → many accounts,
// so it goes over the shared per-comet ALT in one v0 tx (the proven heavy path,
// 1 popup) via useSolanaActions.submitOverAlt. Guarded by isLiquidatable so we
// never burn a tx on a healthy account (absorb reverts on HF ≥ 1).
//
// Reuses the proven primitives: encodeAbsorb (lib/solana/cometCalldata) + the
// submitOverAlt path the discovery probe's runLiquidate uses verbatim.

import { useCallback, useEffect, useState } from "react";
import { type Address, type Hex } from "viem";

import { SolanaLaneShell } from "@/components/aerarium/lane/SolanaLaneShell";
import { LiquidateView } from "@/components/aerarium/lane/LiquidateView";
import { useSolanaActions } from "@/lib/lane/useSolanaActions";
import { solanaExplorerTx } from "@/lib/solana/explorer";
import { useSolanaConnect } from "@/lib/lane/useSolanaConnect";
import { encodeAbsorb } from "@/lib/solana/cometCalldata";
import { fetchUnhealthyAccounts } from "@/lib/portal/fetchUnhealthyAccounts";
import {
  enrichLiquidatable,
  enrichLiquidatableList,
  type LiquidatableInfo,
} from "@/lib/portal/enrichLiquidatable";

const COMET_LIQ_ABI = [
  {
    type: "function",
    name: "isLiquidatable",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;


export default function SolanaLiquidatePage() {
  const { synthetic, evmClient, cfg, submitOverAlt, connected } = useSolanaActions();
  // Robust connect for the gated Absorb action (the list/Check are reads over
  // evmClient and don't need a wallet). Defaults to Phantom, the first option.
  const { connect } = useSolanaConnect();

  // ---- auto-discovered + ENRICHED list (shared scan + enrich over evmClient) ----
  const [accounts, setAccounts] = useState<LiquidatableInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshList = useCallback(async () => {
    if (!cfg.comet) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const comet = cfg.comet as Address;
      const liq = await fetchUnhealthyAccounts(evmClient, comet);
      const enriched = await enrichLiquidatableList(evmClient, comet, liq);
      setAccounts(enriched);
    } catch {
      // Transient — keep prior list; next refresh retries.
    } finally {
      setLoading(false);
    }
  }, [evmClient, cfg.comet]);

  // One bounded scan on mount — NO 30s polling. The old setInterval meant a
  // single left-open tab re-ran a wide getLogs every 30s indefinitely, hammering
  // the proxy. The list also re-scans after an absorb; the indexer path will
  // replace this getLogs scan entirely.
  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  // ---- isLiquidatable + enrich (manual entry + pre-absorb re-check) ----
  // Returns the enriched info when liquidatable (debt/collateral/bonus shown
  // before absorbing), or null when healthy. Reads are chain-agnostic — same
  // enrichLiquidatable the EVM lane uses, over the lane's evmClient.
  const onCheck = useCallback(
    async (account: string): Promise<LiquidatableInfo | null> => {
      if (!cfg.comet) return null;
      const comet = cfg.comet as Address;
      const acct = account as Address;
      const liquidatable = (await evmClient.readContract({
        address: comet,
        abi: COMET_LIQ_ABI,
        functionName: "isLiquidatable",
        args: [acct],
      })) as boolean;
      if (!liquidatable) return null;
      return enrichLiquidatable(evmClient, comet, acct);
    },
    [evmClient, cfg.comet],
  );

  // ---- REAL absorb via Phantom → DoTxUnsigned over the shared per-comet ALT ----
  const onAbsorb = useCallback(
    async (account: string): Promise<{ txUrl?: string }> => {
      if (!synthetic || !cfg.comet) throw new Error("Connect your Solana wallet first.");
      // comet.absorb(synthetic, [victim]) over the shared per-comet ALT (heavy →
      // v0, 1 popup) — the exact path discovery's runLiquidate uses.
      const data = encodeAbsorb(synthetic, [account as Hex]);
      const signature = await submitOverAlt(cfg.comet as Hex, data);
      void refreshList();
      return { txUrl: solanaExplorerTx(signature, cfg.solanaCluster) };
    },
    [synthetic, cfg.comet, submitOverAlt, refreshList],
  );

  // The liquidatable list is PUBLIC read-only data (scan + enrich + Check run
  // over the wallet-independent evmClient), so the shell renders this body even
  // while disconnected (requireConnection={false}); only the Absorb write is
  // gated — LiquidateView turns it into "Connect to absorb" → connect(Phantom).
  // (onAbsorb still guards synthetic defensively.)
  return (
    <SolanaLaneShell requireConnection={false}>
      <LiquidateView
        accounts={accounts}
        loading={loading}
        onAbsorb={onAbsorb}
        onCheck={onCheck}
        connected={connected}
        onConnect={() => connect("Phantom")}
      />
    </SolanaLaneShell>
  );
}
