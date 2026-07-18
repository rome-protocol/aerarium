"use client";
// =====================================================================
// AERARIUM — connected lane app (state machine + assembly)
// One parameterized <LaneApp adapter={…} /> renders both lanes. The Solana
// lane adds the first-time ACTIVATE step + multi-signature progress; that
// difference lives entirely behind the LaneAdapter. Ported from aer-lane.jsx,
// with the review-only Tweaks switcher removed and the mock timers replaced by
// the adapter's real connection / position / action state.
// =====================================================================
import "@/app/aerarium-app.css";
import { useEffect, useState } from "react";
import { setLastLane } from "@/lib/lastLane";
import { ACTIONS, Check, Spin, eyebrow, fmt$ } from "./primitives";
import { LaneHeader } from "./LaneHeader";
import { HealthCapacity } from "./HealthCapacity";
import { AssetTable } from "./AssetTable";
import { SelectedAssetStats } from "./SelectedAssetStats";
import { ActionPanel } from "./ActionPanel";
import { ProgressCard } from "./ProgressCard";
import { ActivityFeed } from "./ActivityFeed";
import { ConnectCard } from "./ConnectCard";
import { ActivateCard, ErrorBanner } from "./ActivateCard";
import type { LaneAdapter, ActionType, ActionResult, LaneAsset } from "./types";

type Screen = "disconnected" | "connecting" | "activate" | "activating" | "loading" | "empty" | "position" | "signing" | "error";

// EVM-lane secondary nav — surfaces the re-chromed /evm/liquidate + /evm/faucet
// sub-pages from the main lane header.
export const EVM_LANE_LINKS = [
  { label: "Liquidate", href: "/evm/liquidate" },
  { label: "Faucet", href: "/evm/faucet" },
];

// Solana-lane secondary nav — surfaces the Solana-native /solana/liquidate +
// /solana/faucet sub-pages (Phantom → DoTxUnsigned, no MetaMask) from the main
// /solana lane header.
export const SOL_LANE_LINKS = [
  { label: "Liquidate", href: "/solana/liquidate" },
  { label: "Faucet", href: "/solana/faucet" },
];

// One-shot success confirmation, rendered in the rail above the ActionPanel
// when the adapter reports a lastResult (and we're not signing/erroring). Green
// check + "{verb} {amount} {sym}" + an optional view-tx link; dismissable via
// the adapter's clearError (which also clears lastResult). Auto-clears on the
// next submit start (the adapter nulls lastResult there). Uses the lane tokens.
const SuccessBanner = ({ result, onDismiss }: { result: ActionResult; onDismiss: () => void }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderRadius: "var(--r-md)", background: "var(--pos-wash, rgba(45,122,90,0.10))", border: "1px solid var(--pos)", marginBottom: 20 }}>
    <Check size={13} />
    <span style={{ flex: 1, fontSize: 14, color: "var(--marble)" }}>
      <strong style={{ fontWeight: 600 }}>{result.verb}</strong>
      {result.sym ? <> <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{fmt$(result.amount)}</span> {result.sym}</> : null}
      {result.txUrl ? (
        <>{" · "}<a href={result.txUrl} target="_blank" rel="noopener noreferrer" style={{ ...eyebrow, fontSize: 11, color: "var(--lane)", textDecoration: "none" }}>view tx →</a></>
      ) : null}
    </span>
    <button aria-label="Dismiss" onClick={onDismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--marble-3)", fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
  </div>
);

const ACTION_TYPES: ActionType[] = ["supply", "withdraw", "borrow", "repay"];

export const LaneApp = ({ adapter, initialAsset, initialAction }: {
  adapter: LaneAdapter;
  /** Deep-link seed from the dashboard (?asset=). Pre-selects that asset; an
   *  unknown symbol harmlessly falls back to the first asset. */
  initialAsset?: string | null;
  /** Deep-link seed from the dashboard (?action=). Pre-sets the action tab;
   *  ignored unless it's a valid ActionType. */
  initialAction?: ActionType | string | null;
}) => {
  const { chain } = adapter;

  // Remember this lane so the landing can offer the returning-user Resume link.
  useEffect(() => { setLastLane(chain); }, [chain]);

  // UI-only state (selection + the action form). All chain/data state is the
  // adapter's. Seeded from the deep-link params on first mount so the dashboard
  // can land the user on a specific asset + action; defaults preserve the
  // original behavior (first asset + supply) when no params are passed.
  const [selSym, setSelSym] = useState<string | null>(initialAsset ?? null);
  const [action, setAction] = useState<ActionType>(
    initialAction && (ACTION_TYPES as string[]).includes(initialAction) ? (initialAction as ActionType) : "supply",
  );
  const [amount, setAmount] = useState("");

  const data = adapter.position;
  const assets = data.assets;
  const sel: LaneAsset | undefined = assets.find((a) => a.sym === selSym) ?? assets[0];
  // The borrowable (base) asset drives the elevated "available to borrow" readout.
  const baseAsset = assets.find((a) => a.borrowable);

  // derive the effective screen from adapter state
  const status = adapter.connection.status;
  let screen: Screen;
  if (status === "disconnected") screen = "disconnected";
  else if (status === "connecting") screen = "connecting";
  else if (chain === "sol" && !adapter.provisioned) screen = adapter.activating ? "activating" : "activate";
  else if (adapter.error) screen = "error";
  else if (adapter.signing) screen = "signing";
  // Loading takes precedence over "empty" so we never flash "No position yet"
  // before the first read lands; once loaded, fall through to position/empty.
  else if (adapter.positionLoading && !adapter.hasPosition) screen = "loading";
  else screen = adapter.hasPosition ? "position" : "empty";

  const acct = screen === "disconnected" || screen === "connecting" || !adapter.connection.address
    ? null
    : { ...adapter.connection, address: adapter.connection.address };

  const openAction = (type: ActionType, a: LaneAsset) => { setSelSym(a.sym); setAction(type); setAmount(""); };

  return (
    <div className={`aer-connected lane-${chain}`}>
      <div className="aer-light-bg" />
      <LaneHeader chain={chain} account={acct} extraLinks={chain === "sol" ? SOL_LANE_LINKS : (chain === "evm" ? EVM_LANE_LINKS : undefined)} onDisconnect={() => { adapter.disconnect(); setSelSym(null); setAction("supply"); setAmount(""); }} />

      <div className="aer-app" style={{ paddingTop: 32 }}>
        {screen === "disconnected" || screen === "connecting" ? (
          <ConnectCard chain={chain} wallets={adapter.wallets} connecting={screen === "connecting" ? (adapter.connection.wallet ?? adapter.wallets[0]) : null} onConnect={(w) => adapter.connect(w)} />
        ) : screen === "activate" || screen === "activating" ? (
          <ActivateCard activating={screen === "activating"} step={adapter.activateStep} onActivate={() => adapter.activate()} />
        ) : (
          <>
            {screen === "loading" && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderRadius: "var(--r-md)", background: "var(--lane-wash)", border: "1px solid var(--lane)", marginBottom: 22 }}>
                <Spin size={15} color="var(--lane)" />
                <span style={{ fontSize: 14.5, color: "var(--marble)" }}>Loading your positions…</span>
              </div>
            )}
            {screen === "empty" && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderRadius: "var(--r-md)", background: "var(--lane-wash)", border: "1px solid var(--lane)", marginBottom: 22 }}>
                <span style={{ fontSize: 14.5, color: "var(--marble)" }}><strong style={{ fontWeight: 600 }}>No position yet.</strong> Supply an asset to start earning and unlock borrowing.</span>
              </div>
            )}
            {/* Elevated account-health readout (full width, prominent) — the
                lane home's risk surface. The full aggregate position lives on
                the dashboard now; here we keep only what's decision-relevant
                while acting: HF + band, available-to-borrow, capacity used. */}
            <div style={{ marginBottom: 20 }}>
              <HealthCapacity position={data} baseAsset={baseAsset} empty={screen === "empty" || screen === "loading"} />
            </div>
            <div className="aer-app-grid">
              {/* LEFT = the action surface (prominent + sticky). The action panel
                  is the first thing the eye hits; the selected-asset stats sit
                  BELOW it, so supporting info never buries the action again. */}
              <div className="aer-rail">
                {adapter.lastResult && screen !== "signing" && screen !== "error" && (
                  <SuccessBanner result={adapter.lastResult} onDismiss={() => adapter.clearError()} />
                )}
                {screen === "error" && <ErrorBanner message={adapter.error ?? (chain === "sol" ? "A signature was rejected in your wallet." : "Transaction rejected in your wallet.")} onRetry={() => adapter.clearError()} />}
                {screen === "signing" && sel
                  ? <ProgressCard
                      title={`${ACTIONS[action]}ing ${sel.sym}`}
                      note={
                        adapter.signPlan.length === 0
                          ? "Preparing…"
                          : chain === "sol"
                            ? "Approve each pop-up in Phantom — the steps below show exactly how many."
                            : "Approve in your wallet, then we confirm on Rome."
                      }
                      steps={adapter.signPlan} current={adapter.signStep} />
                  : sel && (
                    <>
                      <ActionPanel
                        asset={sel} action={action} amount={amount} position={data}
                        onAmount={setAmount} onActionType={setAction}
                        onAction={() => adapter.submitAction({ asset: sel, type: action, amount })}
                        submitLabel={`${ACTIONS[action]} ${amount || "0.00"} ${sel.sym}`} />
                      {/* Supporting detail for the selected asset — BELOW the
                          action, never above it. */}
                      <SelectedAssetStats asset={sel} position={data} />
                    </>
                  )}
              </div>
              {/* RIGHT = the click-to-select asset list + recent activity. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <AssetTable title="Assets" assets={assets} onSelect={(sym) => { setSelSym(sym); setAmount(""); }} activeSym={sel?.sym ?? ""} />
                <ActivityFeed items={adapter.activity} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
