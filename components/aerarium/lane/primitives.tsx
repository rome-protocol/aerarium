"use client";
// =====================================================================
// AERARIUM — connected lane: shared bits (ported from aer-app-lib.jsx)
// Spinner, check, asset icon, eyebrow/num style consts, formatters, and
// the per-action label maps. Brand primitives (Wordmark/Button/ChainGlyph/
// CHAIN) are reused from the landing port — not redefined here.
// =====================================================================
import type { CSSProperties } from "react";
import type { ActionType, SignStep, LaneSide } from "./types";

export const Spin = ({ size = 15, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: "aer-spin 0.9s linear infinite", flexShrink: 0 }}>
    <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2.5" fill="none" opacity="0.22" />
    <path d="M12 3 a9 9 0 0 1 9 9" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" />
  </svg>
);

export const Check = ({ size = 13, bg = "var(--pos)" }: { size?: number; bg?: string }) => (
  <span style={{ width: size + 9, height: size + 9, borderRadius: "50%", background: bg, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none"><path d="M2.5 6.2 L4.8 8.5 L9.5 3.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>
);

export const AssetIcon = ({ sym, tone = "var(--marble-2)", size = 34 }: { sym: string; tone?: string; size?: number }) => (
  <span style={{
    width: size, height: size, borderRadius: "50%", flexShrink: 0,
    border: "1px solid var(--stone-line-2)", background: "var(--paper)",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    fontFamily: "var(--font-mono)", fontSize: size * 0.3, color: tone, fontWeight: 600,
  }}>{sym.slice(0, 2).toUpperCase()}</span>
);

export const eyebrow: CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.16em",
  textTransform: "uppercase", color: "var(--marble-3)",
};

export const num: CSSProperties = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };

export const fmt$ = (n: number, dp = 2): string =>
  "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** Token amount → compact string: up to 6 dp, no trailing zeros, locale grouping. */
export const fmtTok = (n: number): string =>
  Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 6 }) : "0";

/**
 * Honest balance cell. When the price feed is KNOWN, show the USD value (or "—"
 * at zero). When the price is UNKNOWN — the OG-V2 feed is stale and `getPrice`
 * reverts `StalePriceFeed`, so the lane reads priceUSDx8 = 0 → USD = $0 — show
 * the TOKEN amount instead ("1.001 wBTC"). This keeps supplied collateral
 * VISIBLE during a feed outage rather than silently rendering "—", which reads
 * as "you have nothing here." "—" only when there is genuinely no balance.
 */
export const fmtBalance = (usd: number, tokens: number, sym: string, priceKnown: boolean): string => {
  if (priceKnown) return usd > 0 ? fmt$(usd) : "—";
  return tokens > 0 ? `${fmtTok(tokens)} ${sym}` : "—";
};

export const short = (a: string): string => (a.length > 13 ? a.slice(0, 6) + "…" + a.slice(-4) : a);

export const ACTIONS: Record<ActionType, string> = {
  supply: "Supply",
  withdraw: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
};

// One-time Solana provisioning steps (Create account / Init ATAs). The lane
// attaches the registry's persistent comet + chain ALTs to every tx, so there's
// no per-user "Register address lookup table" step anymore.
export const ACTIVATE_STEPS: SignStep[] = [
  { label: "Create your Aerarium account", tag: "Sign" },
  { label: "Initialize token accounts", tag: "Sign" },
];

// Per-action progress recipe. EVM = simple 2-step; the Solana lane names each
// pop-up because supply/borrow/repay are multi-signature (approve + action),
// while withdraw is a single signature.
//
// Preconditions that add/remove a wallet popup for a given action, read live by
// the adapter so the count shown is EXACTLY what the user will sign — never a
// fixed guess (the user must not see "2" and sign 3, or vice-versa).
export interface SignPlanOpts {
  /** supply/repay: an ERC20 approve popup precedes the action (allowance < amount). */
  needsApprove?: boolean;
  /** Solana withdraw/borrow sweep: the wallet's token account must be created
   *  first (a separate native tx) because its ATA doesn't exist yet. */
  needsWalletAta?: boolean;
}

const EVM_VERB: Record<ActionType, string> = {
  supply: "Supply to pool", withdraw: "Withdraw from pool",
  borrow: "Borrow from pool", repay: "Repay to pool",
};

// DYNAMIC signing plan: build the ordered list of SIGN legs from the live
// preconditions, number them "i of N", then append the single WAIT (confirm).
// The Solana synthetic-transient lane prepends a "Fund from wallet" leg to
// supply/repay and appends a "Return to wallet" sweep to withdraw/borrow — both
// are real Phantom popups, so they're counted here.
export const signSteps = (chain: LaneSide, action: ActionType, opts: SignPlanOpts = {}): SignStep[] => {
  const legs: string[] = [];
  if (chain === "evm") {
    if (opts.needsApprove) legs.push("Approve token transfer");
    legs.push(EVM_VERB[action]);
  } else if (action === "supply" || action === "repay") {
    legs.push("Fund from wallet");
    if (opts.needsApprove) legs.push(action === "supply" ? "Approve token transfer" : "Approve repayment");
    legs.push(action === "supply" ? "Supply to pool" : "Repay to pool");
  } else {
    legs.push(action === "withdraw" ? "Withdraw from pool" : "Authorize borrow");
    if (opts.needsWalletAta) legs.push("Create wallet token account");
    legs.push(action === "withdraw" ? "Return to wallet" : "Send to wallet");
  }
  const n = legs.length;
  const steps: SignStep[] = legs.map((label, i) => ({
    label: n > 1 ? `${label} (${i + 1} of ${n})` : label,
    tag: "Sign",
  }));
  steps.push({ label: `Confirming ${action} on Rome`, tag: "Wait" });
  return steps;
};
