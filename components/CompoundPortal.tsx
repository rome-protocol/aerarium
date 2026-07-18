"use client";

// Compound v3 portal — Compound-style market view: protocol stats header,
// account summary with risk gauge, per-position card rows, recent activity,
// and an action modal (Supply / Withdraw / Leverage).  All reads target
// the collat-aware Comet — that's where the borrow story is.

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useDisconnect,
  usePublicClient,
  useWalletClient,
} from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { formatUnits, defineChain, type Address, type Hex } from "viem";

import { useEnv } from "@/lib/env-context";
import { DEFAULT_CHAIN_CONFIG, DEFAULT_CHAIN_CONFIG_RAW, configForChain } from "@/lib/config";
import { buildAssetMaps, activeCompoundConfig } from "@/lib/portal/assetMaps";
import { estimateContractGasBuffered, estimateGasBuffered } from "@/lib/gas";
import {
  buildLeverageOpenCalldata,
  isLeverageOpenSupported,
} from "@/lib/flows/leverage-open";
import { useCometMarket } from "@/lib/portal/hooks/useCometMarket";
import { useProtocolStats } from "@/lib/portal/hooks/useProtocolStats";
import { useReserveStats } from "@/lib/portal/hooks/useReserveStats";
import { useAccountStats } from "@/lib/portal/hooks/useAccountStats";
import type { ActionPreviewInput, ActionPreviewRequest, PreviewCollateralInfo } from "@/lib/portal/stats";
import { targetForAddress, type TargetAsset } from "@/lib/portal/targetAsset";
import { explorerTxUrl } from "@/lib/explorer";

import { Card } from "./ui/Card";
import { Eyebrow } from "./ui/Eyebrow";
import { Button } from "./ui/Button";
import { TxLink } from "./ui/TxLink";
import { Hairline } from "./ui/Hairline";
import { AddressChip } from "./ui/AddressChip";
import { InlineError } from "./ui/InlineError";
import { Stat } from "./ui/Stat";
import { RiskGauge } from "./ui/RiskGauge";
import { PositionCardRow } from "./PositionCardRow";
import { ActionModal, type ActionMode } from "./ActionModal";
import { AllReservesTable } from "./AllReservesTable";
import { AssetsToSupplyTable } from "./AssetsToSupplyTable";
import { AssetsToBorrowTable } from "./AssetsToBorrowTable";
import { PositionsRow } from "./PositionsRow";
import { YourSuppliesTable } from "./YourSuppliesTable";
import { YourBorrowsTable } from "./YourBorrowsTable";
import { fmtUSD, fmtPct } from "./ui/format";

const ERC20_ABI = [
  { inputs: [{ type: "address" }], name: "balanceOf", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ type: "address", name: "owner" }, { type: "address", name: "spender" }], name: "allowance", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ type: "address", name: "spender" }, { type: "uint256", name: "amount" }], name: "approve", outputs: [{ type: "bool" }], stateMutability: "nonpayable", type: "function" },
] as const;

const COMET_ACTION_ABI = [
  { inputs: [{ type: "address" }, { type: "uint256" }], name: "supply", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ type: "address" }, { type: "uint256" }], name: "withdraw", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ type: "address", name: "manager" }, { type: "address", name: "owner" }], name: "isAllowed", outputs: [{ type: "bool" }], stateMutability: "view", type: "function" },
  { inputs: [{ type: "address", name: "manager" }, { type: "bool", name: "isAllowed_" }], name: "allow", outputs: [], stateMutability: "nonpayable", type: "function" },
] as const;

const BASE_DECIMALS = 6;

type Phase =
  | "idle"
  | "approving-base"
  | "approving-collat"
  | "allowing-bulker"
  | "supplying"
  | "withdrawing"
  | "leveraging"
  | "done"
  | "error";

interface Status {
  phase: Phase;
  message?: string;
  approveTx?: Hex;
  actionTx?: Hex;
  error?: string;
}

export type CompoundPortalSection = "stats" | "supply" | "borrow" | "allReserves" | "account";

/**
 * Quick-action verbs surfaced in the account-card header. Page-contextual:
 * /supply renders Supply / Withdraw / Leverage; /borrow renders Borrow /
 * Repay / Leverage; dashboard inherits the default (matches /supply).
 * "leverage" is dropped automatically when the chain hasn't deployed a
 * Bulker (see leverageSupported below).
 */
export type AccountAction = "supply" | "withdraw" | "borrow" | "repay" | "leverage";

export interface CompoundPortalProps {
  /**
   * Sections to render and their order. Defaults to a Dashboard-style layout
   * where user actions sit at the top, protocol stats below.
   * Pass a single-element array on /supply / /borrow pages for focused views.
   */
  sections?: CompoundPortalSection[];
  /**
   * Quick-action verbs in the account-card header. Defaults to the legacy
   * supply-centric set; /borrow opts in to ["borrow", "repay", "leverage"]
   * so users on the borrow page don't see a "Supply" button. Each verb is
   * disabled when its underlying state makes it a no-op (withdraw blocked
   * with no supply; repay blocked with no debt).
   */
  accountActions?: AccountAction[];
}

const DEFAULT_SECTIONS: CompoundPortalSection[] = ["account", "stats"];
const DEFAULT_ACCOUNT_ACTIONS: AccountAction[] = ["supply", "withdraw", "leverage"];

export function CompoundPortal({
  sections = DEFAULT_SECTIONS,
  accountActions = DEFAULT_ACCOUNT_ACTIONS,
}: CompoundPortalProps = {}) {
  const { defaultChainId, ready } = useEnv();
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
  // Full active-chain config (collateralAssets, jito, bulker). Resolved by the
  // runtime chainId — never the build-time-default DEFAULT_CHAIN_CONFIG_RAW, which on a
  // multi-chain registry points at a different chain's collaterals.
  const activeFull = useMemo(
    () => activeCompoundConfig(activeChainId, DEFAULT_CHAIN_CONFIG_RAW),
    [activeChainId],
  );

  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: activeChainId });

  const portalComet = useMemo<Address>(() => activeConfig.rome.cometProxyCollateral as Address, [activeConfig]);
  const baseAsset = activeConfig.rome.unifiedToken as Address;
  const baseSymbol = activeConfig.rome.baseSymbol;
  const bulker = activeConfig.rome.bulker as Address;
  const leverageSupported = isLeverageOpenSupported(activeFull);

  const { market } = useCometMarket(portalComet, activeChainId);
  const { stats: protocolStats } = useProtocolStats(market, BASE_DECIMALS, activeChainId);
  const { reserves } = useReserveStats(market, BASE_DECIMALS, activeChainId);

  const { decimalsByAsset, symbolByAsset } = useMemo(
    () => buildAssetMaps(activeChainId, baseAsset, baseSymbol, BASE_DECIMALS),
    [activeChainId, baseAsset, baseSymbol],
  );

  const accountResult = useAccountStats(
    market,
    address,
    BASE_DECIMALS,
    decimalsByAsset,
    symbolByAsset,
    activeChainId,
  );
  const accountStats = accountResult.stats;

  // Wallet balances for the modal (max-button + preview state).
  const [walletBalances, setWalletBalances] = useState<Record<string, bigint>>({});
  const refreshWalletBalances = useCallback(async () => {
    if (!address || !publicClient || !market) return;
    try {
      const baseBal = await publicClient.readContract({
        address: baseAsset,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address],
      });
      const collatBals = await Promise.all(
        market.assets.map((a) =>
          publicClient.readContract({
            address: a.asset,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [address],
          }),
        ),
      );
      const next: Record<string, bigint> = { [baseAsset.toLowerCase()]: baseBal as bigint };
      market.assets.forEach((a, i) => { next[a.asset.toLowerCase()] = collatBals[i] as bigint; });
      setWalletBalances(next);
    } catch {
      // Transient — next refresh picks up.
    }
  }, [address, publicClient, market, baseAsset]);
  useEffect(() => {
    refreshWalletBalances();
    if (!address) return;
    const t = setInterval(refreshWalletBalances, 12_000);
    return () => clearInterval(t);
  }, [refreshWalletBalances, address]);

  // Modal state
  const [modalMode, setModalMode] = useState<ActionMode | null>(null);
  const [modalCollat, setModalCollat] = useState<string>("PCOL");
  // The asset that was clicked in a per-row Supply/Withdraw button.
  // `null` means the click came from the account-card quick actions and the
  // modal should default to the base asset (legacy behavior).
  const [modalTarget, setModalTarget] = useState<TargetAsset | null>(null);
  const [status, setStatus] = useState<Status>({ phase: "idle" });

  const inFlight =
    status.phase === "approving-base" ||
    status.phase === "approving-collat" ||
    status.phase === "allowing-bulker" ||
    status.phase === "supplying" ||
    status.phase === "withdrawing" ||
    status.phase === "leveraging";

  // Refresh state on done. The modal does NOT auto-close — instead it
  // swaps to its built-in success view (✓ + past-tense verb + amount +
  // view-tx + Close button), matching the a companion Aave demo pattern.
  // Auto-close was tried earlier (PR #54) but the inline banner ended up
  // scrolled out of view, so the user saw the modal disappear with no
  // confirmation. Inline success-banner is no longer needed; kept as a
  // belt-and-suspenders fallback so a user who refreshes mid-flow still
  // sees a record.
  useEffect(() => {
    if (status.phase === "done") {
      accountResult.refresh();
      refreshWalletBalances();
    }
  }, [status.phase, accountResult, refreshWalletBalances]);

  function openModal(mode: ActionMode, target?: TargetAsset | null, collatSymbol?: string) {
    setModalMode(mode);
    setModalTarget(target ?? null);
    if (collatSymbol) setModalCollat(collatSymbol);
    setStatus({ phase: "idle" });
  }
  function closeModal() {
    if (!inFlight) {
      setModalMode(null);
      setModalTarget(null);
      setStatus({ phase: "idle" });
    }
  }

  // Per-row click handlers — resolve the clicked address to either null
  // (base asset, falls through to the existing supply/withdraw path) or a
  // {symbol,address,decimals} target (collat row, modal labels + submit
  // dispatch get the right asset).
  function openForAsset(mode: ActionMode, assetAddress: string) {
    const target = targetForAddress(assetAddress, baseAsset, symbolByAsset, decimalsByAsset);
    openModal(mode, target);
  }

  async function handleSubmit(req: ActionPreviewRequest) {
    try {
      if (req.kind === "supply") await doSupply(req.amount);
      else if (req.kind === "withdraw") await doWithdraw(req.amount);
      else if (req.kind === "supplyCollateral") await doSupplyCollat(req.asset, req.amount);
      else if (req.kind === "withdrawCollateral") await doWithdrawCollat(req.asset, req.amount);
      else if (req.kind === "leverageOpen") {
        setModalCollat(req.collateralAsset);
        await doLeverage(req.collateralAsset, req.collateralAmount, req.borrowAmount);
      }
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message?.split("\n")[0] || "Transaction failed";
      setStatus({ phase: "error", error: msg.slice(0, 200) });
    }
  }

  async function doSupply(amt: bigint) {
    if (!walletClient || !address || !publicClient) return;
    const allowance = (await publicClient.readContract({
      address: baseAsset,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [address, portalComet],
    })) as bigint;
    let approveTx: Hex | undefined;
    if (allowance < amt) {
      setStatus({ phase: "approving-base", message: "Approving wUSDC for Comet…" });
      const gas = await estimateContractGasBuffered(publicClient, {
        account: address,
        address: baseAsset,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [portalComet, amt],
      });
      approveTx = await walletClient.writeContract({
        chain: activeChain,
        address: baseAsset,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [portalComet, amt],
        gas,
      });
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
    }
    setStatus({ phase: "supplying", message: "Supplying to Comet…", approveTx });
    const supplyGas = await estimateContractGasBuffered(publicClient, {
      account: address,
      address: portalComet,
      abi: COMET_ACTION_ABI,
      functionName: "supply",
      args: [baseAsset, amt],
    });
    const tx = await walletClient.writeContract({
      chain: activeChain,
      address: portalComet,
      abi: COMET_ACTION_ABI,
      functionName: "supply",
      args: [baseAsset, amt],
      gas: supplyGas,
    });
    await publicClient.waitForTransactionReceipt({ hash: tx });
    setStatus({
      phase: "done",
      message: `Supplied ${Number(formatUnits(amt, BASE_DECIMALS)).toFixed(2)} ${baseSymbol}`,
      approveTx,
      actionTx: tx,
    });
  }

  // Collateral supply/withdraw. Uses the same `comet.supply(asset, amount)`
  // / `comet.withdraw(asset, amount)` primitives — the only difference vs
  // the base path is the asset arg and the approval target (Comet itself).
  // Looks up the on-chain address from the active chain's collateralAssets by
  // symbol so the dispatch matches the symbol-keyed previewReq emitted by
  // ActionModal.
  async function doSupplyCollat(collatSymbol: string, amt: bigint) {
    if (!walletClient || !address || !publicClient) return;
    const info = activeFull.collateralAssets[collatSymbol];
    if (!info) {
      setStatus({ phase: "error", error: `Unknown collateral symbol ${collatSymbol}` });
      return;
    }
    const collatAddr = info.address as Address;
    const allowance = (await publicClient.readContract({
      address: collatAddr,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [address, portalComet],
    })) as bigint;
    let approveTx: Hex | undefined;
    if (allowance < amt) {
      setStatus({ phase: "approving-collat", message: `Approving ${collatSymbol} for Comet…` });
      const gas = await estimateContractGasBuffered(publicClient, {
        account: address,
        address: collatAddr,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [portalComet, amt],
      });
      approveTx = await walletClient.writeContract({
        chain: activeChain,
        address: collatAddr,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [portalComet, amt],
        gas,
      });
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
    }
    setStatus({ phase: "supplying", message: `Supplying ${collatSymbol} to Comet…`, approveTx });
    const supplyGas = await estimateContractGasBuffered(publicClient, {
      account: address,
      address: portalComet,
      abi: COMET_ACTION_ABI,
      functionName: "supply",
      args: [collatAddr, amt],
    });
    const tx = await walletClient.writeContract({
      chain: activeChain,
      address: portalComet,
      abi: COMET_ACTION_ABI,
      functionName: "supply",
      args: [collatAddr, amt],
      gas: supplyGas,
    });
    await publicClient.waitForTransactionReceipt({ hash: tx });
    setStatus({
      phase: "done",
      message: `Supplied ${Number(formatUnits(amt, info.decimals)).toFixed(4)} ${collatSymbol}`,
      approveTx,
      actionTx: tx,
    });
  }

  async function doWithdrawCollat(collatSymbol: string, amt: bigint) {
    if (!walletClient || !address || !publicClient) return;
    const info = activeFull.collateralAssets[collatSymbol];
    if (!info) {
      setStatus({ phase: "error", error: `Unknown collateral symbol ${collatSymbol}` });
      return;
    }
    const collatAddr = info.address as Address;
    setStatus({ phase: "withdrawing", message: `Withdrawing ${collatSymbol} from Comet…` });
    const gas = await estimateContractGasBuffered(publicClient, {
      account: address,
      address: portalComet,
      abi: COMET_ACTION_ABI,
      functionName: "withdraw",
      args: [collatAddr, amt],
    });
    const tx = await walletClient.writeContract({
      chain: activeChain,
      address: portalComet,
      abi: COMET_ACTION_ABI,
      functionName: "withdraw",
      args: [collatAddr, amt],
      gas,
    });
    await publicClient.waitForTransactionReceipt({ hash: tx });
    setStatus({
      phase: "done",
      message: `Withdrew ${Number(formatUnits(amt, info.decimals)).toFixed(4)} ${collatSymbol}`,
      actionTx: tx,
    });
  }

  async function doWithdraw(amt: bigint) {
    if (!walletClient || !address || !publicClient) return;
    setStatus({ phase: "withdrawing", message: "Withdrawing from Comet…" });
    const gas = await estimateContractGasBuffered(publicClient, {
      account: address,
      address: portalComet,
      abi: COMET_ACTION_ABI,
      functionName: "withdraw",
      args: [baseAsset, amt],
    });
    const tx = await walletClient.writeContract({
      chain: activeChain,
      address: portalComet,
      abi: COMET_ACTION_ABI,
      functionName: "withdraw",
      args: [baseAsset, amt],
      gas,
    });
    await publicClient.waitForTransactionReceipt({ hash: tx });
    setStatus({
      phase: "done",
      message: `Withdrew ${Number(formatUnits(amt, BASE_DECIMALS)).toFixed(2)} ${baseSymbol}`,
      actionTx: tx,
    });
  }

  async function doLeverage(collatSymbol: string, collatAmt: bigint, borrowAmt: bigint) {
    if (!walletClient || !address || !publicClient) return;
    const collatInfo = activeFull.collateralAssets[collatSymbol];
    if (!collatInfo) {
      setStatus({ phase: "error", error: `Unknown collateral symbol ${collatSymbol}` });
      return;
    }

    const pcolAllowance = (await publicClient.readContract({
      address: collatInfo.address as Address,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [address, bulker],
    })) as bigint;
    let approveCollatTx: Hex | undefined;
    if (pcolAllowance < collatAmt) {
      setStatus({ phase: "approving-collat", message: `Approving ${collatSymbol} for Bulker…` });
      const gas = await estimateContractGasBuffered(publicClient, {
        account: address,
        address: collatInfo.address as Address,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [bulker, 2n ** 256n - 1n],
      });
      approveCollatTx = await walletClient.writeContract({
        chain: activeChain,
        address: collatInfo.address as Address,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [bulker, 2n ** 256n - 1n],
        gas,
      });
      await publicClient.waitForTransactionReceipt({ hash: approveCollatTx });
    }

    const isAllowed = (await publicClient.readContract({
      address: portalComet,
      abi: COMET_ACTION_ABI,
      functionName: "isAllowed",
      args: [address, bulker],
    })) as boolean;
    if (!isAllowed) {
      setStatus({ phase: "allowing-bulker", message: "Authorizing Bulker on Comet…", approveTx: approveCollatTx });
      const gas = await estimateContractGasBuffered(publicClient, {
        account: address,
        address: portalComet,
        abi: COMET_ACTION_ABI,
        functionName: "allow",
        args: [bulker, true],
      });
      const allowTx = await walletClient.writeContract({
        chain: activeChain,
        address: portalComet,
        abi: COMET_ACTION_ABI,
        functionName: "allow",
        args: [bulker, true],
        gas,
      });
      await publicClient.waitForTransactionReceipt({ hash: allowTx });
    }

    setStatus({ phase: "leveraging", message: `Supplying ${collatSymbol} + borrowing wUSDC…`, approveTx: approveCollatTx });
    const tx = buildLeverageOpenCalldata(activeFull, {
      user: address,
      collatSymbol,
      collatAmount: collatAmt,
      baseAmount: borrowAmt,
    });
    const gas = await estimateGasBuffered(publicClient, {
      account: address,
      to: tx.target,
      data: tx.calldata,
      value: tx.value,
    });
    const hash = await walletClient.sendTransaction({
      chain: activeChain,
      to: tx.target,
      data: tx.calldata,
      value: tx.value,
      gas,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    setStatus({
      phase: "done",
      message: `Supplied ${Number(formatUnits(collatAmt, collatInfo.decimals)).toFixed(2)} ${collatSymbol} · borrowed ${Number(formatUnits(borrowAmt, BASE_DECIMALS)).toFixed(2)} ${baseSymbol}`,
      approveTx: approveCollatTx,
      actionTx: hash,
    });
  }

  // Build preview state for the modal — fold registry + on-chain into ActionPreviewInput.
  const previewState: ActionPreviewInput = useMemo(() => {
    const collateralByAsset: Record<string, PreviewCollateralInfo> = {};
    if (market) {
      for (const a of market.assets) {
        const symbol = symbolByAsset[a.asset.toLowerCase()] ?? "asset";
        const pos = accountResult.positions.find((p) => p.asset.toLowerCase() === a.asset.toLowerCase());
        collateralByAsset[symbol] = {
          symbol,
          decimals: decimalsByAsset[a.asset.toLowerCase()] ?? 18,
          balance: pos?.balance ?? 0n,
          priceUSDx8: pos?.priceUSDx8 ?? 0n,
          borrowCollateralFactor: a.borrowCollateralFactor,
          liquidateCollateralFactor: a.liquidateCollateralFactor,
          walletBalance: walletBalances[a.asset.toLowerCase()] ?? 0n,
        };
      }
    }
    return {
      baseDecimals: BASE_DECIMALS,
      basePriceUSDx8: 100_000_000n, // wUSDC ≈ $1 — TODO: derive from base price feed when feed is wired
      walletBaseBalance: walletBalances[baseAsset.toLowerCase()] ?? 0n,
      baseSupplyBalance: accountResult.baseSupplyBalance ?? 0n,
      baseBorrowBalance: accountResult.baseBorrowBalance ?? 0n,
      collateralValueUSD: accountStats?.collateralValueUSD ?? 0,
      borrowCapacityUSD: accountStats?.borrowCapacityUSD ?? 0,
      liquidationThresholdUSD: accountStats?.liquidationThresholdUSD ?? 0,
      collateralByAsset,
    };
  }, [market, accountResult, accountStats, walletBalances, symbolByAsset, decimalsByAsset, baseAsset]);

  const collatChoices = useMemo(
    () => Object.keys(activeFull.collateralAssets),
    [activeFull],
  );
  const collatDecimalsBySymbol = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(activeFull.collateralAssets).map(([s, info]) => [s, info.decimals]),
      ),
    [activeFull],
  );
  const baseSupply = accountResult.baseSupplyBalance ?? 0n;
  const baseBorrow = accountResult.baseBorrowBalance ?? 0n;

  // Skeleton while EnvProvider hasn't resolved /api/env yet.
  if (!ready) {
    return (
      <div role="status" aria-busy="true" style={{ padding: 24, color: "var(--fg2)" }}>
        Loading market…
      </div>
    );
  }

  // Render sections in the order specified by the prop so each page (Dashboard,
  // /supply, /borrow) can put user actions on top.
  const sectionNodes: Record<CompoundPortalSection, React.ReactNode> = {
    stats: (
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
          <Eyebrow>{activeConfig.rome.name} · Compound v3</Eyebrow>
          {isConnected && address ? (
            <AddressChip address={address} onDisconnect={() => disconnect()} />
          ) : null}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 24 }}>
          <Stat label="Total supplied" value={protocolStats ? fmtUSD(protocolStats.tvlUSD) : "—"} loading={!protocolStats} />
          <Stat label="Total borrowed" value={protocolStats ? fmtUSD(protocolStats.totalBorrowUSD) : "—"} loading={!protocolStats} />
          <Stat label="Supply APY" value={protocolStats ? fmtPct(protocolStats.supplyApyPct * 100) : "—"} loading={!protocolStats} />
          <Stat label="Borrow APY" value={protocolStats ? fmtPct(protocolStats.borrowApyPct * 100) : "—"} loading={!protocolStats} />
          <Stat label="Utilization" value={protocolStats ? fmtPct(protocolStats.utilizationPct * 100) : "—"} loading={!protocolStats} />
        </div>
      </Card>
    ),
    allReserves: <AllReservesTable reserves={reserves} symbolByAsset={symbolByAsset} />,
    supply: (
      <AssetsToSupplyTable
        reserves={reserves}
        balances={walletBalances}
        symbolByAsset={symbolByAsset}
        decimalsByAsset={decimalsByAsset}
        onSupply={(asset) => openForAsset("supply", asset)}
      />
    ),
    borrow: (
      <AssetsToBorrowTable
        reserves={reserves}
        symbolByAsset={symbolByAsset}
        onBorrow={(asset) => openForAsset("borrow", asset)}
        disabled={!isConnected}
      />
    ),
    account: !isConnected ? (
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-start" }}>
            <Eyebrow>Your account</Eyebrow>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--fg2)", lineHeight: 1.5 }}>
              Connect MetaMask to view your supply / borrow positions and access the action panel.
            </div>
            <ConnectButton.Custom>
              {({ openConnectModal, mounted }) =>
                mounted ? (
                  <Button variant="primary" size="md" onClick={openConnectModal}>
                    Connect wallet
                  </Button>
                ) : null
              }
            </ConnectButton.Custom>
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
              <Eyebrow>Your account</Eyebrow>
              <div style={{ display: "flex", gap: 8 }}>
                {accountActions.map((action) => {
                  if (action === "leverage" && !leverageSupported) return null;
                  if (action === "leverage") {
                    return (
                      <Button
                        key={action}
                        size="sm"
                        variant="primary"
                        onClick={() => openModal("leverage")}
                      >
                        Leverage open
                      </Button>
                    );
                  }
                  const label =
                    action === "supply" ? "Supply" :
                    action === "withdraw" ? "Withdraw" :
                    action === "borrow" ? "Borrow" :
                    "Repay";
                  const disabled =
                    action === "withdraw" ? baseSupply === 0n :
                    action === "repay" ? baseBorrow === 0n :
                    false;
                  return (
                    <Button
                      key={action}
                      size="sm"
                      variant="ghost"
                      onClick={() => openModal(action)}
                      disabled={disabled}
                    >
                      {label}
                    </Button>
                  );
                })}
              </div>
            </div>

            {accountStats ? (
              <div style={{ marginBottom: 20 }}>
                <RiskGauge
                  riskPct={accountStats.liquidationRiskPct}
                  borrowValueUSD={accountStats.borrowValueUSD}
                  liquidationThresholdUSD={accountStats.liquidationThresholdUSD}
                  healthFactor={accountStats.healthFactor}
                />
              </div>
            ) : null}

            <PositionsRow
              suppliesSlot={
                <YourSuppliesTable
                  baseSupply={baseSupply}
                  baseAsset={baseAsset}
                  collatBalances={Object.fromEntries(
                    accountResult.positions.map((p) => [p.asset.toLowerCase(), p.balance]),
                  )}
                  symbolByAsset={symbolByAsset}
                  decimalsByAsset={decimalsByAsset}
                  onSupply={(asset) => openForAsset("supply", asset)}
                  onWithdraw={(asset) => openForAsset("withdraw", asset)}
                />
              }
              borrowsSlot={
                <YourBorrowsTable
                  borrowBalance={baseBorrow}
                  baseAsset={baseAsset}
                  symbolByAsset={symbolByAsset}
                  decimalsByAsset={decimalsByAsset}
                  onRepay={(asset) => openForAsset("repay", asset)}
                  onBorrow={(asset) => openForAsset("borrow", asset)}
                />
              }
            />

            {status.phase === "done" && status.actionTx ? (
              <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg1)" }}>{status.message}</div>
                <TxLink href={explorerTxUrl(activeConfig.rome.explorerUrl, status.actionTx)}>view tx →</TxLink>
              </div>
            ) : null}
            {/* When the modal is OPEN the error renders inline inside the
                modal (per ActionModal's errorMessage prop). The bg banner
                only surfaces after the user closes the modal, so the error
                stays available as a retry trail without competing for
                attention with the modal contents. */}
            {modalMode === null && status.phase === "error" && status.error ? (
              <div style={{ marginTop: 24 }}>
                <InlineError message={status.error} onRetry={() => setStatus({ phase: "idle" })} />
              </div>
            ) : null}

            <div
              style={{
                marginTop: 24,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--fg2)",
                letterSpacing: "0.04em",
              }}
            >
              comet: {portalComet}
            </div>
          </Card>
          {/* Recent activity intentionally NOT rendered here — /history is
              the single source. Removed 2026-05-28 per operator: activity
              between the account card and the asset table was a layout
              interruption on /supply and /borrow. */}
        </>
      ),
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {sections.map((s) => (
        <Fragment key={s}>{sectionNodes[s]}</Fragment>
      ))}

      {/* Modal lives outside the cards so the backdrop covers everything. */}
      <ActionModal
        open={modalMode !== null}
        onClose={closeModal}
        mode={modalMode ?? "supply"}
        defaultCollatSymbol={modalCollat}
        collatChoices={collatChoices}
        baseSymbol={baseSymbol}
        baseDecimals={BASE_DECIMALS}
        collatDecimalsBySymbol={collatDecimalsBySymbol}
        previewState={previewState}
        onSubmit={handleSubmit}
        inFlight={inFlight}
        statusMessage={status.message}
        done={status.phase === "done"}
        doneMessage={status.message}
        doneTxLink={status.actionTx ? explorerTxUrl(activeConfig.rome.explorerUrl, status.actionTx) : undefined}
        targetAssetSymbol={modalTarget?.symbol}
        targetAssetDecimals={modalTarget?.decimals}
        targetAssetAddress={modalTarget?.address}
        errorMessage={status.phase === "error" ? status.error : undefined}
        availableLiquidity={protocolStats?.availableLiquidityRaw}
      />
    </div>
  );
}
