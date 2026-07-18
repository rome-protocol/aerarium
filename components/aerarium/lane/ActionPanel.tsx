"use client";
// ActionPanel — selected-asset action form (Supply/Withdraw/Borrow/Repay tabs,
// amount field + Max, the action's consequences, primary submit). The ONE
// consumer of lib/lane/laneActions: it validates feasibility BEFORE the wallet
// opens (gating the submit button + showing the reason in plain language) and
// renders the consequence rows the user gets. Token-denominated throughout —
// Max + validation read the asset's *Tokens balances, not the USD *Bal fields.
import { Button } from "@/components/landing/primitives";
import { eyebrow, num, fmt$, AssetIcon, ACTIONS } from "./primitives";
import { validateAction, actionConsequences, availableLabel, availableFor, floorTokens } from "@/lib/lane/laneActions";
import type { ActionType, LaneAsset, LanePosition } from "./types";

/** Trim a token amount for the Max button / position line — up to 6 dp. */
const fmtTok = (n: number): string =>
  Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 6 }) : "0";

export const ActionPanel = ({ asset, action, amount, position, onAmount, onAction, onActionType, submitLabel, busy }: {
  asset: LaneAsset;
  action: ActionType;
  amount: string;
  position: LanePosition;
  onAmount: (v: string) => void;
  onAction: () => void;
  onActionType: (t: ActionType) => void;
  submitLabel: string;
  busy?: boolean;
}) => {
  const tabs: ActionType[] = asset?.borrowable ? ["supply", "withdraw", "borrow", "repay"] : ["supply", "withdraw"];

  const amountTokens = parseFloat(amount || "");
  const validation = validateAction({ type: action, amountTokens, asset, position });
  const consequences = actionConsequences({ type: action, amountTokens, asset, position });
  // Max = the TRUE available amount — the min across every applicable protocol
  // constraint (wallet/supplied/debt ∧ capacity ∧ liquidity ∧ caps ∧ health),
  // from the SAME availableFor that gates the submit + drives the label. No
  // min-logic lives here; ActionPanel just consumes the single source.
  const max = availableFor({ type: action, asset, position }).tokens;
  // The AVAILABLE amount for the current action — shown under the amount field
  // so the user isn't guessing what they can supply / withdraw / repay / borrow.
  const available = availableLabel(action, asset, position);

  // The Your-{SYM} position line — supplied + borrowed (USD) so the actions have
  // context. Only render the parts that are non-zero so it stays uncluttered.
  const hasPositionLine = asset.suppliedBal > 0 || asset.borrowedBal > 0;

  // Disabled until the action is feasible (or while a tx is in flight).
  const blocked = !validation.ok || !!busy;

  return (
    <div className="aer-card" style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: hasPositionLine ? 12 : 18 }}>
        <AssetIcon sym={asset.sym} tone={asset.collateral ? "var(--lane)" : "var(--gold)"} size={30} />
        <h3 className="aer-display" style={{ fontSize: 19, margin: 0, fontWeight: 400 }}>{asset.sym}</h3>
      </div>
      {/* Your-{SYM} position line — supplied / borrowed context for this asset */}
      {hasPositionLine && (
        <div style={{ display: "flex", gap: 18, marginBottom: 18, padding: "10px 14px", background: "var(--paper)", borderRadius: "var(--r-md)" }}>
          <span style={{ ...eyebrow, textTransform: "none", letterSpacing: 0, fontSize: 12, color: "var(--marble-3)" }}>Your {asset.sym}</span>
          {asset.suppliedBal > 0 && (
            <span style={{ fontSize: 12.5 }}><span style={{ color: "var(--marble-3)" }}>Supplied </span><span style={{ ...num, color: "var(--marble)", fontWeight: 600 }}>{fmt$(asset.suppliedBal)}</span></span>
          )}
          {asset.borrowedBal > 0 && (
            <span style={{ fontSize: 12.5 }}><span style={{ color: "var(--marble-3)" }}>Borrowed </span><span style={{ ...num, color: "var(--marble)", fontWeight: 600 }}>{fmt$(asset.borrowedBal)}</span></span>
          )}
        </div>
      )}
      {/* action tabs */}
      <div style={{ display: "flex", gap: 4, padding: 4, background: "var(--paper)", borderRadius: "var(--r-md)", marginBottom: 20 }}>
        {tabs.map((t) => (
          <button key={t} onClick={() => onActionType(t)} style={{
            flex: 1, padding: "8px 4px", border: "none", cursor: "pointer", borderRadius: "var(--r-sm)",
            background: action === t ? "var(--basalt)" : "transparent",
            boxShadow: action === t ? "0 1px 2px rgba(20,2,24,0.1)" : "none",
            fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 600,
            color: action === t ? "var(--marble)" : "var(--marble-3)", textTransform: "uppercase", letterSpacing: "0.04em",
          }}>{ACTIONS[t]}</button>
        ))}
      </div>
      {/* amount */}
      <div style={{ border: "1px solid var(--stone-line-2)", borderRadius: "var(--r-md)", padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={eyebrow}>Amount</span>
          <span style={{ ...eyebrow, textTransform: "none", letterSpacing: 0 }}>{ACTIONS[action]} {asset.sym}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input className="aer-input" inputMode="decimal" value={amount} onChange={(e) => onAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" disabled={busy} />
          <span style={{ ...eyebrow, fontSize: 12 }}>{asset.sym}</span>
          <button onClick={() => onAmount(floorTokens(max))} disabled={busy} style={{ ...eyebrow, border: "1px solid var(--stone-line-2)", background: "transparent", borderRadius: 999, padding: "5px 9px", cursor: "pointer", color: "var(--marble)" }}>Max</button>
        </div>
        {/* available-for-this-action line — compact mono, under the amount so the
            user isn't guessing the cap (complements Max + the validation gate). */}
        {available && (
          <div style={{ ...eyebrow, textTransform: "none", letterSpacing: 0, fontSize: 11.5, color: "var(--marble-2)", marginTop: 8 }}>{available}</div>
        )}
      </div>
      {/* consequences — the result of this action, shown before signing */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: validation.warning ? 12 : 20 }}>
        {consequences.map((c, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: "var(--marble-2)" }}>{c.label}</span>
            <span style={{ ...num, color: c.tone || "var(--marble)", fontWeight: 500 }}>{c.value}</span>
          </div>
        ))}
      </div>
      {/* non-blocking caution (e.g. thin post-borrow health) */}
      {validation.ok && validation.warning && (
        <div style={{ fontSize: 12.5, color: "var(--gold-bright)", marginBottom: 16, lineHeight: 1.4 }}>{validation.warning}</div>
      )}
      {/* submit — gated on feasibility; reason shown in plain language when blocked */}
      {blocked ? (
        <>
          <button
            type="button"
            disabled
            aria-disabled="true"
            style={{
              width: "100%", padding: "16px 30px", fontSize: 15, fontFamily: "var(--font-sans)", fontWeight: 600,
              letterSpacing: "0.02em", borderRadius: "var(--r-pill)", border: "1px solid transparent",
              textTransform: "uppercase", cursor: "not-allowed", color: "var(--marble-3)",
              background: "var(--basalt)", opacity: 0.6,
            }}
          >{submitLabel}</button>
          {!busy && validation.reason && (
            <div style={{ marginTop: 10, fontSize: 13, color: "var(--oxblood-br)", textAlign: "center" }}>{validation.reason}</div>
          )}
        </>
      ) : (
        <Button variant="gold" size="lg" full onClick={onAction}>{submitLabel}</Button>
      )}
    </div>
  );
};
