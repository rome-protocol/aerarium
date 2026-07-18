"use client";

// /evm/liquidate — EVM-lane liquidation (real absorb via wagmi).
//
// Uses the shared LiquidateView (same shape as /solana/liquidate): an
// auto-discovered list of liquidatable accounts (fetchUnhealthyAccounts over
// the connected publicClient) PLUS a manual-address entry for log-invisible
// (Solana-native) positions. Each Absorb is a REAL comet.absorb(connected,
// [victim]) signed in the connected wallet — replacing the old disabled stub.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useWalletClient,
} from "wagmi";
import { defineChain, type Address, type Hex } from "viem";

import { EvmLaneShell } from "@/components/aerarium/lane/EvmLaneShell";
import { LiquidateView } from "@/components/aerarium/lane/LiquidateView";
import { useEvmConnect } from "@/lib/lane/useEvmConnect";
import { useEnv } from "@/lib/env-context";
import { configForChain, DEFAULT_CHAIN_CONFIG } from "@/lib/config";
import { estimateContractGasBuffered } from "@/lib/gas";
import { fetchUnhealthyAccounts } from "@/lib/portal/fetchUnhealthyAccounts";
import {
  enrichLiquidatable,
  enrichLiquidatableList,
  type LiquidatableInfo,
} from "@/lib/portal/enrichLiquidatable";
import { explorerTxUrl } from "@/lib/explorer";

// Same NEXT_PUBLIC_COMET_PROXY override useEvmLane reads, so /evm/liquidate
// targets the identical Comet the lane + /solana use. undefined → registry.
const ENV_COMET_PROXY = process.env.NEXT_PUBLIC_COMET_PROXY || undefined;

const COMET_LIQ_ABI = [
  {
    type: "function",
    name: "isLiquidatable",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "absorb",
    stateMutability: "nonpayable",
    inputs: [
      { name: "absorber", type: "address" },
      { name: "accounts", type: "address[]" },
    ],
    outputs: [],
  },
] as const;

export default function LiquidatePage() {
  const { defaultChainId } = useEnv();
  const activeChainId = defaultChainId ?? DEFAULT_CHAIN_CONFIG.rome.chainId;
  const activeConfig = useMemo(
    () => configForChain(activeChainId) ?? DEFAULT_CHAIN_CONFIG,
    [activeChainId],
  );
  const comet = (ENV_COMET_PROXY ?? activeConfig.rome.cometProxyCollateral) as Address;
  const explorerBase = activeConfig.rome.explorerUrl ?? "";

  const activeChain = useMemo(
    () =>
      defineChain({
        id: activeConfig.rome.chainId,
        name: activeConfig.rome.name,
        nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
        rpcUrls: { default: { http: [activeConfig.rome.rpc] } },
      }),
    [activeConfig],
  );

  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: activeChainId });
  // Connection state for the read-only/gated split — the list + Check are
  // wallet-independent (publicClient); only Absorb needs a signer.
  const { connected, onConnect } = useEvmConnect();

  // ---- auto-discovered + ENRICHED list (shared client-agnostic scan + enrich) ----
  const [accounts, setAccounts] = useState<LiquidatableInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshList = useCallback(async () => {
    if (!publicClient || !comet) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const liq = await fetchUnhealthyAccounts(publicClient, comet);
      const enriched = await enrichLiquidatableList(publicClient, comet, liq);
      setAccounts(enriched);
    } catch {
      // Transient — keep prior list; next refresh retries.
    } finally {
      setLoading(false);
    }
  }, [publicClient, comet]);

  // One bounded scan on mount — NO 30s polling. The old setInterval meant a
  // single left-open tab re-ran a wide getLogs every 30s indefinitely, hammering
  // the proxy. The list also re-scans after an absorb; the indexer path will
  // replace this getLogs scan entirely.
  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  // ---- isLiquidatable + enrich (manual entry + pre-absorb re-check) ----
  // Returns the enriched LiquidatableInfo when liquidatable (so the user sees
  // debt/collateral/bonus before absorbing), or null when healthy.
  const onCheck = useCallback(
    async (account: string): Promise<LiquidatableInfo | null> => {
      if (!publicClient || !comet) return null;
      const acct = account as Address;
      const liquidatable = (await publicClient.readContract({
        address: comet,
        abi: COMET_LIQ_ABI,
        functionName: "isLiquidatable",
        args: [acct],
      })) as boolean;
      if (!liquidatable) return null;
      return enrichLiquidatable(publicClient, comet, acct);
    },
    [publicClient, comet],
  );

  // ---- REAL absorb via wagmi (replaces the old disabled stub) ----
  const onAbsorb = useCallback(
    async (account: string): Promise<{ txUrl?: string }> => {
      if (!walletClient || !publicClient || !address) {
        throw new Error("Connect a wallet first.");
      }
      const acct = account as Address;
      const gas = await estimateContractGasBuffered(publicClient, {
        account: address,
        address: comet,
        abi: COMET_LIQ_ABI,
        functionName: "absorb",
        args: [address, [acct]],
      });
      const tx: Hex = await walletClient.writeContract({
        chain: activeChain,
        address: comet,
        abi: COMET_LIQ_ABI,
        functionName: "absorb",
        args: [address, [acct]],
        gas,
      });
      await publicClient.waitForTransactionReceipt({ hash: tx });
      // Refresh the auto-list so the absorbed account drops off.
      void refreshList();
      return { txUrl: explorerBase ? explorerTxUrl(explorerBase, tx) : undefined };
    },
    [walletClient, publicClient, address, comet, activeChain, explorerBase, refreshList],
  );

  // The liquidatable list is PUBLIC read-only data (scan + enrich + Check run
  // over the wallet-independent publicClient), so the shell renders this body
  // even while disconnected (requireConnection={false}); only the Absorb write
  // is gated — LiquidateView turns it into "Connect to absorb" → onConnect.
  // (onAbsorb still guards address defensively.)
  return (
    <EvmLaneShell requireConnection={false}>
      <LiquidateView
        accounts={accounts}
        loading={loading}
        onAbsorb={onAbsorb}
        onCheck={onCheck}
        chainName={activeConfig.rome.name}
        connected={connected}
        onConnect={() => onConnect()}
      />
    </EvmLaneShell>
  );
}
