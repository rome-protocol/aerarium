"use client";
// =====================================================================
// AERARIUM — EVM lane adapter (real)
// Implements the LaneAdapter contract for the Ethereum lane (/evm) on top of
// wagmi + the existing Compound portal read-hooks (useCometMarket /
// useReserveStats / useAccountStats) and the portal's write recipe
// (approve → estimateContractGasBuffered → writeContract → waitForReceipt).
//
// Reads target the SAME Comet the CompoundPortal uses — cometProxyCollateral
// (the collat-aware "multicollat" market) — so the lane shows the same numbers
// as the legacy /supply + /borrow pages. The pure Comet→LanePosition mapping
// lives in mapEvmPosition.ts (unit-tested); this hook only fetches + drives
// the action lifecycle.
// =====================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
  useWalletClient,
} from "wagmi";
import { defineChain, parseUnits, type Address, type Hex } from "viem";

import { useEnv } from "@/lib/env-context";
import { DEFAULT_CHAIN_CONFIG, DEFAULT_CHAIN_CONFIG_RAW, configForChain } from "@/lib/config";
import { estimateContractGasBuffered } from "@/lib/gas";
import { useCometMarket } from "@/lib/portal/hooks/useCometMarket";
import { useReserveStats } from "@/lib/portal/hooks/useReserveStats";
import { fetchRecentActivity } from "@/lib/portal/activity";
import { usePositionQuery } from "./usePositionQuery";
import { fetchEvmPosition, type EvmPositionReads } from "./evmPositionFetcher";
import type {
  ActionResult,
  ActivityItem,
  LaneAdapter,
  LaneConnectionStatus,
  SignStep,
  SubmitActionInput,
} from "@/components/aerarium/lane/types";
import { signSteps } from "@/components/aerarium/lane/primitives";
import { mapEvmPosition } from "./mapEvmPosition";
import { hasHoldings } from "./laneActions";
import { cappedBaseLiquidityRaw } from "./availableLiquidity";
import { toLaneActivity, optimisticEntry, mergeActivity, type AssetLookup } from "./laneActivity";
import { explorerTxUrl } from "@/lib/explorer";
import { readCometAssetSymbols } from "./cometAssetSymbols";

/** Whole-token USD price for an asset — same fallback chain as laneActions'
 *  priceOf (asset.priceUsd, then the USD/token wallet pair, then $1). Used to
 *  value the optimistic activity row in USD (the feed shows USD amounts). */
function assetPriceUsd(asset: { priceUsd?: number; walletTokens: number; walletBal: number }): number {
  if (asset.priceUsd && asset.priceUsd > 0) return asset.priceUsd;
  if (asset.walletTokens > 0 && asset.walletBal > 0) return asset.walletBal / asset.walletTokens;
  return 1;
}

// Literal NEXT_PUBLIC_ refs so Next inlines them client-side (same pattern as
// useSolanaLane's ENV map). When set, these pin BOTH lanes to the same Comet +
// base asset, guaranteeing an identical asset set. undefined → registry config.
const ENV_COMET_PROXY = process.env.NEXT_PUBLIC_COMET_PROXY || undefined;
const ENV_UNIFIED_TOKEN = process.env.NEXT_PUBLIC_UNIFIED_TOKEN || undefined;

// Base wUSDC has 6 decimals on the demo chains; matches CompoundPortal.
const BASE_DECIMALS = 6;
// wUSDC ≈ $1. TODO: derive from the base price feed once useReserveStats
// exposes the raw base price (today it only surfaces USD-converted totals).
// CompoundPortal makes the same assumption (previewState.basePriceUSDx8).
const BASE_PRICE_USDx8 = 100_000_000n;

const COMET_ACTION_ABI = [
  { inputs: [{ type: "address" }, { type: "uint256" }], name: "supply", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ type: "address" }, { type: "uint256" }], name: "withdraw", outputs: [], stateMutability: "nonpayable", type: "function" },
] as const;

// baseBorrowMin view — the Compound v3 dust-borrow floor (a borrow must leave
// total debt ≥ this). Read once per market for the min-of-constraints model.
const COMET_BASE_BORROW_MIN_ABI = [
  { inputs: [], name: "baseBorrowMin", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
] as const;

const ERC20_RW_ABI = [
  { inputs: [{ type: "address", name: "owner" }, { type: "address", name: "spender" }], name: "allowance", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ type: "address", name: "spender" }, { type: "uint256", name: "amount" }], name: "approve", outputs: [{ type: "bool" }], stateMutability: "nonpayable", type: "function" },
] as const;

function mapWagmiStatus(status: ReturnType<typeof useAccount>["status"]): LaneConnectionStatus {
  // wagmi: "connected" | "reconnecting" | "connecting" | "disconnected"
  if (status === "connected") return "connected";
  if (status === "connecting" || status === "reconnecting") return "connecting";
  return "disconnected";
}

export function useEvmLane(): LaneAdapter {
  const { defaultChainId } = useEnv();
  const activeChainId = defaultChainId ?? DEFAULT_CHAIN_CONFIG.rome.chainId;
  const activeConfig = useMemo(
    () => configForChain(activeChainId) ?? DEFAULT_CHAIN_CONFIG,
    [activeChainId],
  );
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

  // Comet + base asset: prefer the NEXT_PUBLIC_COMET_PROXY / _UNIFIED_TOKEN env
  // override (the SAME source the Solana lane's resolveProbeConfig reads), so
  // BOTH lanes target the identical Comet — i.e. identical asset SET — by
  // construction. The literal process.env refs let Next inline them client-side
  // (mirrors useSolanaLane's ENV map). Falls back to the registry config when
  // the override is unset. Without this the EVM lane read the registry Comet
  // while the Solana lane read the env Comet, so the two lanes showed entirely
  // different collaterals.
  const portalComet = (ENV_COMET_PROXY ?? activeConfig.rome.cometProxyCollateral) as Address;
  const baseAsset = (ENV_UNIFIED_TOKEN ?? activeConfig.rome.unifiedToken) as Address;
  const baseSymbol = activeConfig.rome.baseSymbol;

  // ---- wagmi connection ----
  const { address, status: wagmiStatus, connector } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: activeChainId });

  const status = mapWagmiStatus(wagmiStatus);

  // ---- reads (reuse the portal hooks verbatim) ----
  const { market } = useCometMarket(portalComet, activeChainId);

  // ---- symbol/decimals maps — canonical on-chain source (parity with Solana
  // lane). Collateral labels MUST come from each wrapper's on-chain symbol()/
  // decimals(), NOT the registry map: the registry only carries the collats
  // known at publish time, so a Comet with extra collats rendered "asset" for
  // the unknown ones on /evm while /solana (on-chain) showed the real symbol.
  // Both lanes now call readCometAssetSymbols → identical rows by construction.
  // The registry base symbol/decimals seed the map so the base row labels
  // correctly on first render before the async read resolves. ----
  const [onChainSymbols, setOnChainSymbols] = useState<{
    symbolByAddress: Record<string, string>;
    decimalsByAddress: Record<string, number>;
  }>({ symbolByAddress: {}, decimalsByAddress: {} });

  const refreshAssetSymbols = useCallback(async () => {
    if (!publicClient || !portalComet || !baseAsset) return;
    try {
      const { symbolByAddress, decimalsByAddress } = await readCometAssetSymbols(
        publicClient,
        portalComet,
        baseAsset,
      );
      setOnChainSymbols({ symbolByAddress, decimalsByAddress });
    } catch {
      // Transient — keep the registry-seeded labels; next refresh retries.
    }
  }, [publicClient, portalComet, baseAsset]);

  useEffect(() => {
    void refreshAssetSymbols();
  }, [refreshAssetSymbols]);

  // ---- baseBorrowMin (static per market) — the dust-borrow floor for the
  // min-of-constraints model. Read once when the comet resolves; cached. ----
  const [baseBorrowMinRaw, setBaseBorrowMinRaw] = useState<bigint | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!publicClient || !portalComet) return;
      try {
        const v = (await publicClient.readContract({
          address: portalComet,
          abi: COMET_BASE_BORROW_MIN_ABI,
          functionName: "baseBorrowMin",
        })) as bigint;
        if (!cancelled) setBaseBorrowMinRaw(v);
      } catch {
        // leave undefined → no minimum-borrow floor in the model (best-effort).
      }
    })();
    return () => { cancelled = true; };
  }, [publicClient, portalComet]);

  const { decimalsByAsset, symbolByAsset } = useMemo(() => {
    // Registry seed (base + any known collats) so labels exist pre-read; the
    // on-chain reads then OVERLAY/override every address with its canonical
    // symbol/decimals once resolved.
    const decimals: Record<string, number> = { [baseAsset.toLowerCase()]: BASE_DECIMALS };
    const symbols: Record<string, string> = { [baseAsset.toLowerCase()]: baseSymbol };
    for (const [symbol, info] of Object.entries(DEFAULT_CHAIN_CONFIG_RAW.collateralAssets)) {
      decimals[info.address.toLowerCase()] = info.decimals;
      symbols[info.address.toLowerCase()] = symbol;
    }
    return {
      decimalsByAsset: { ...decimals, ...onChainSymbols.decimalsByAddress },
      symbolByAsset: { ...symbols, ...onChainSymbols.symbolByAddress },
    };
  }, [baseAsset, baseSymbol, onChainSymbols]);
  const { reserves, refresh: refreshReserves } = useReserveStats(market, BASE_DECIMALS, activeChainId);
  // ---- per-user position (T0): ONE gated TanStack query in place of
  // useAccountStats + the wallet-balance 12s poller. `enabled` only once the chain
  // RESOLVES (defaultChainId from /api/env) so a connected user never reads against
  // the build-time default chain (the #76 family); keyed [lane,identity,chainId,
  // programId] so the two lanes never share a cache entry. Display symbols/decimals
  // come from the live symbolByAsset map (mapEvmPosition reads that + scale-derived
  // decimals, not the fetched rows), so the query needn't re-key on async symbol
  // resolution. ----
  const chainResolved = defaultChainId != null;
  const positionQuery = usePositionQuery<EvmPositionReads>({
    lane: "evm",
    identity: address,
    chainId: activeChainId,
    programId: activeConfig.rome.programId,
    enabled: status === "connected" && chainResolved && market != null && publicClient != null,
    fetcher: () =>
      fetchEvmPosition({
        publicClient: publicClient!,
        market: market!,
        baseAsset,
        user: address!,
        baseDecimals: BASE_DECIMALS,
        decimalsByAsset,
        symbolByAsset,
      }),
  });

  // Map the query → the accountResult shape mapEvmPosition consumes. On error, fall
  // to empty (stats null) — reproduces useAccountStats's error→empty so a failed
  // read shows the empty state, never an infinite spinner (positionLoading gates on
  // `error == null` below).
  const accountResult = useMemo(() => {
    const d = positionQuery.data;
    return {
      stats: d?.stats ?? null,
      positions: d?.positions ?? [],
      baseSupplyBalance: d?.baseSupplyBalance ?? null,
      baseBorrowBalance: d?.baseBorrowBalance ?? null,
      isBorrowCollateralized: d?.isBorrowCollateralized ?? null,
      error: positionQuery.isError
        ? positionQuery.error instanceof Error
          ? positionQuery.error.message
          : "Failed to load account stats"
        : null,
    };
  }, [positionQuery.data, positionQuery.isError, positionQuery.error]);

  const walletBalances = positionQuery.data?.walletBalances ?? {};
  const refreshPosition = useCallback(async () => {
    await positionQuery.refetch();
  }, [positionQuery]);

  // ---- market-level liquidity + supply-cap totals (min-of-constraints seam) ----
  // availableLiquidityRaw = the base the Comet can actually pay out now =
  // min(totalSupply − totalBorrow, baseToken.balanceOf(comet)). The physical
  // balance is the real ceiling: when the Comet runs a base deficit (negative
  // reserves) it holds LESS than the accounting net, so a withdraw/borrow of the
  // net reverts. Capping here makes Max land on what's truly withdrawable.
  // totalCollateralByAddress = each collat's protocol-total supply
  // (= wrapper.balanceOf(comet)) off the reserves' collateral rows, for supply-cap.
  const { availableLiquidityRaw, totalCollateralByAddress } = useMemo(() => {
    const rows = reserves ?? [];
    const baseRow = rows.find((r) => r.kind === "base");
    const liq =
      baseRow && baseRow.totalBorrowRaw != null
        ? cappedBaseLiquidityRaw(baseRow.totalSupplyRaw, baseRow.totalBorrowRaw, baseRow.baseBalanceRaw ?? null)
        : undefined;
    const totals: Record<string, bigint> = {};
    for (const r of rows) {
      if (r.kind === "collateral") totals[r.asset.toLowerCase()] = r.totalSupplyRaw;
    }
    return { availableLiquidityRaw: liq, totalCollateralByAddress: totals };
  }, [reserves]);

  // ---- position (pure mapping) ----
  const position = useMemo(
    () =>
      mapEvmPosition({
        baseSymbol,
        baseDecimals: BASE_DECIMALS,
        baseAddress: baseAsset,
        basePriceUSDx8: BASE_PRICE_USDx8,
        reserves,
        stats: accountResult.stats,
        positions: accountResult.positions,
        baseSupplyBalance: accountResult.baseSupplyBalance,
        baseBorrowBalance: accountResult.baseBorrowBalance,
        walletBalancesByAddress: walletBalances,
        symbolByAddress: symbolByAsset,
        availableLiquidityRaw,
        baseBorrowMinRaw,
        totalCollateralByAddress,
      }),
    [baseSymbol, baseAsset, reserves, accountResult.stats, accountResult.positions, accountResult.baseSupplyBalance, accountResult.baseBorrowBalance, walletBalances, symbolByAsset, availableLiquidityRaw, baseBorrowMinRaw, totalCollateralByAddress],
  );

  // Token-based: a stale price feed zeroes the USD totals but the user still
  // has a real position (e.g. 12 wUSDC supplied while the base feed is stale).
  const hasPosition = hasHoldings(position);

  // First position read in flight: connected, no stats yet, AND no error. Gating
  // on `error == null` is load-bearing — useAccountStats leaves `stats` null on a
  // failed read, so without the error guard a read failure (e.g. a slow/unreachable
  // RPC) would hang "Loading your positions…" forever. On error we fall through to
  // the empty state instead of an infinite spinner.
  const positionLoading =
    status === "connected" && accountResult.error == null && (market == null || accountResult.stats == null);

  // ---- recent activity ----
  // Per-asset {sym, decimals, price} lookup for the activity USD conversion,
  // built from the data the adapter already reads: symbol/decimals maps +
  // base price + per-collateral priceUSDx8 from the account positions. Keyed by
  // "base" (the Comet base asset) or a lowercased collateral address — matching
  // ActivityEntry.asset.
  const activityLookup = useMemo<AssetLookup>(() => {
    const priceByAddr = new Map<string, bigint>();
    priceByAddr.set(baseAsset.toLowerCase(), BASE_PRICE_USDx8);
    for (const p of accountResult.positions) {
      priceByAddr.set(p.asset.toLowerCase(), p.priceUSDx8);
    }
    return (asset: "base" | string) => {
      const addr = asset === "base" ? baseAsset.toLowerCase() : asset.toLowerCase();
      const sym = symbolByAsset[addr];
      const decimals = decimalsByAsset[addr];
      if (sym === undefined || decimals === undefined) return undefined;
      return { sym, decimals, priceUSDx8: priceByAddr.get(addr) ?? 0n };
    };
  }, [baseAsset, symbolByAsset, decimalsByAsset, accountResult.positions]);

  const explorerBase = activeConfig.rome.explorerUrl ?? "";

  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const refreshActivity = useCallback(async () => {
    if (!publicClient || !address || !portalComet) {
      setActivity([]);
      return;
    }
    try {
      const entries = await fetchRecentActivity(publicClient, portalComet, address);
      setActivity(toLaneActivity(entries, activityLookup, explorerBase));
    } catch {
      // Transient — keep prior activity; next refresh retries.
    }
  }, [publicClient, address, portalComet, activityLookup, explorerBase]);

  // Activity refreshes WITH the position query: refreshActivity's deps include
  // activityLookup (← positionQuery data), so it re-runs each time the position
  // refetches (~10s) + on action, and inherits the query's pause-on-hidden. No
  // standalone setInterval — P5 retires the last EVM per-tab poller.
  useEffect(() => {
    void refreshActivity();
  }, [refreshActivity]);

  // ---- action lifecycle ----
  const [signing, setSigning] = useState(false);
  const [signStep, setSignStep] = useState(0);
  // Exact popup plan for the in-flight action (2 steps when an approve is needed,
  // 1 otherwise) so the count shown matches what MetaMask actually prompts.
  const [signPlan, setSignPlan] = useState<SignStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  // The adapter OWNS its action lifecycle, so it records each success itself:
  // an optimistic "just now" row (so the feed populates immediately — and on
  // the Solana lane at all, since Rome doesn't surface DoTxUnsigned via logs)
  // and a transient lastResult LaneApp turns into a success banner. Capped,
  // most-recent-first.
  const [optimisticActivity, setOptimisticActivity] = useState<ActivityItem[]>([]);
  const [lastResult, setLastResult] = useState<ActionResult | null>(null);

  // Optimistic rows (first) + the fetched log feed, de-duped + capped. Memoised
  // so LaneApp/ActivityFeed get a stable reference between unrelated re-renders.
  const mergedActivity = useMemo(
    () => mergeActivity(optimisticActivity, activity),
    [optimisticActivity, activity],
  );

  // Latest refs so submitAction stays a stable callback while reading fresh
  // wallet/public clients + addresses + refreshers. submitAction is wrapped in
  // useCallback([]) (the LaneAdapter contract's imperative methods are stable),
  // so it captures the first render's closure — everything it reads must come
  // through this ref to avoid staleness (e.g. address=undefined on first render).
  const ref = useRef({
    walletClient, publicClient, activeChain, address,
    baseAsset, portalComet, decimalsByAsset,
    refreshPosition, refreshReserves, refreshActivity,
  });
  ref.current = {
    walletClient, publicClient, activeChain, address,
    baseAsset, portalComet, decimalsByAsset,
    refreshPosition, refreshReserves, refreshActivity,
  };

  const clearError = useCallback(() => { setError(null); setLastResult(null); }, []);

  const submitAction = useCallback((input: SubmitActionInput) => {
    // Clear any prior success banner the moment a new action starts (lastResult
    // is a one-shot confirmation of the PREVIOUS action).
    setLastResult(null);
    void runAction(input);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The actual async flow — separated so submitAction returns void synchronously
  // (matching the LaneAdapter contract's fire-and-forget imperative methods).
  async function runAction(input: SubmitActionInput) {
    const {
      walletClient: wc, publicClient: pc, activeChain: chain, address: user,
      baseAsset: base, portalComet: comet, decimalsByAsset: decMap,
      refreshPosition: rp, refreshReserves: rr,
      refreshActivity: ract,
    } = ref.current;
    if (!wc || !pc || !user) {
      setError("Connect a wallet first.");
      return;
    }

    const assetAddr = (input.asset.address as Address) ?? base;
    const decimals = input.asset.decimals ?? decMap[assetAddr.toLowerCase()] ?? BASE_DECIMALS;

    let amount: bigint;
    try {
      amount = parseUnits(input.amount || "0", decimals);
    } catch {
      setError("Enter a valid amount.");
      return;
    }
    if (amount <= 0n) {
      setError("Enter an amount greater than zero.");
      return;
    }

    setError(null);
    setSigning(true);
    setSignStep(0);
    setSignPlan([]); // filled below once the approve precondition is known

    try {
      // supply / repay: token leaves the wallet → may need an ERC20 approve to
      // the Comet first. repay is `supply(baseAsset, amount)`. withdraw / borrow
      // are `withdraw(asset, amount)` — no approve.
      const isSupplyLike = input.type === "supply" || input.type === "repay";

      // borrow/repay always operate on the base asset; supply/withdraw operate
      // on whichever asset the user picked (base or a collateral).
      const targetAsset: Address =
        input.type === "borrow" || input.type === "repay" ? base : assetAddr;

      // Read the allowance UP-FRONT so the popup plan is exact: supply/repay show
      // an Approve step only when the Comet can't already pull `amount`.
      let needsApprove = false;
      if (isSupplyLike) {
        const allowance = (await pc.readContract({
          address: targetAsset, abi: ERC20_RW_ABI, functionName: "allowance", args: [user, comet],
        })) as bigint;
        needsApprove = allowance < amount;
      }
      setSignPlan(signSteps("evm", input.type, { needsApprove }));
      let step = 0;
      const next = () => setSignStep(step++);

      if (needsApprove) {
        next(); // ① approve popup
        const approveGas = await estimateContractGasBuffered(pc, {
          account: user, address: targetAsset, abi: ERC20_RW_ABI, functionName: "approve", args: [comet, amount],
        });
        const approveTx = await wc.writeContract({
          chain, address: targetAsset, abi: ERC20_RW_ABI, functionName: "approve", args: [comet, amount], gas: approveGas,
        });
        await pc.waitForTransactionReceipt({ hash: approveTx });
      }

      next(); // ② the action popup
      const fnName = isSupplyLike ? "supply" : "withdraw";
      const actionGas = await estimateContractGasBuffered(pc, {
        account: user, address: comet, abi: COMET_ACTION_ABI, functionName: fnName, args: [targetAsset, amount],
      });
      const tx: Hex = await wc.writeContract({
        chain, address: comet, abi: COMET_ACTION_ABI, functionName: fnName, args: [targetAsset, amount], gas: actionGas,
      });

      // Signature obtained — confirming on Rome (index = # of sign legs).
      setSignStep(step);
      await pc.waitForTransactionReceipt({ hash: tx });

      // Success — record the optimistic activity row + the success banner
      // BEFORE the (slower) on-chain refresh, so the user sees confirmation the
      // instant the tx confirms. amountUsd = token amount × the asset's USD
      // price (same fallback chain as laneActions); txUrl from the explorer base.
      const amountTokens = Number(input.amount) || 0;
      const priceUsd = assetPriceUsd(input.asset);
      const amountUsd = amountTokens * priceUsd;
      const txUrl = explorerBase ? explorerTxUrl(explorerBase, tx) : undefined;
      const entry = optimisticEntry({ type: input.type, amountUsd, sym: input.asset.sym, txUrl });
      setOptimisticActivity((prev) => [entry, ...prev].slice(0, 10));
      setLastResult({ verb: entry.verb, amount: amountUsd, sym: input.asset.sym, txUrl });

      // refresh position + wallet + activity, drop the progress card.
      setSigning(false);
      setSignStep(0);
      setSignPlan([]);
      await Promise.all([rp(), rr(), ract()]);
    } catch (e: unknown) {
      setSigning(false);
      setSignStep(0);
      setSignPlan([]);
      setError(shortError(e));
    }
  }

  // ---- connect / disconnect ----
  const connectFn = useCallback(
    (walletName: string) => {
      const wanted = walletName.toLowerCase();
      const match =
        connectors.find((c) => c.name.toLowerCase().includes(wanted)) ??
        connectors.find((c) => c.type === "injected") ??
        connectors[0];
      if (match) connect({ connector: match });
    },
    [connectors, connect],
  );

  const disconnectFn = useCallback(() => {
    wagmiDisconnect();
    setSigning(false);
    setSignStep(0);
    setSignPlan([]);
    setError(null);
    setLastResult(null);
    setOptimisticActivity([]);
  }, [wagmiDisconnect]);

  return {
    chain: "evm",
    wallets: ["MetaMask", "Rabby", "WalletConnect"],

    connection: {
      status,
      address: status === "connected" ? address : undefined,
      wallet: connector?.name,
    },
    connect: connectFn,
    disconnect: disconnectFn,

    // EVM is always provisioned — no Activate step.
    provisioned: true,
    activating: false,
    activateStep: 0,
    activate: () => {},

    position,
    hasPosition,
    positionLoading,
    // The adapter's own optimistic entries (first) merged with the fetched log
    // feed, de-duped + capped. The optimistic rows give an immediate "just now"
    // confirmation; the fetched feed is the durable on-chain history.
    activity: mergedActivity,

    submitAction,
    signing,
    signStep,
    signPlan,

    error,
    clearError,
    lastResult,
  };
}

function shortError(e: unknown): string {
  const anyE = e as { shortMessage?: string; message?: string } | undefined;
  const raw = anyE?.shortMessage || anyE?.message || "Transaction failed";
  // wagmi/viem surface user rejection as a long string — normalise it.
  if (/user rejected|denied|rejected the request/i.test(raw)) {
    return "Transaction rejected in your wallet.";
  }
  return raw.split("\n")[0].slice(0, 160);
}
