"use client";
// =====================================================================
// AERARIUM — shared Liquidate view (both lanes)
// One presentational liquidate UI rendered by BOTH /evm/liquidate and
// /solana/liquidate. The lane injects its real absorb (onAbsorb) + an
// enriching isLiquidatable check (onCheck) + the auto-discovered, ENRICHED
// list (accounts: LiquidatableInfo[]); this component owns only the UI + the
// per-entry/per-row absorb lifecycle.
//
// Shape (identical across lanes, under each lane's own chrome), top → bottom:
//   - hero / explainer
//   - PRIMARY: a filter row (HF / collateral / debt / min-size, via the shared
//     LiquidateFilterRow) over an auto-discovered TABLE:
//     Borrower | Collateral | Debt | Bonus | (Absorb), each row populated with
//     real per-account LiquidatableInfo. The filter + table are ALWAYS on top;
//     when the (filtered) list is empty the empty/loading copy lives INSIDE the
//     table region (a full-width row) rather than replacing the structure — the
//     page always reads as a live liquidations surface.
//   - SECONDARY: manual-address entry (0x… → Check → Absorb) BELOW the table,
//     for log-invisible accounts. Check ENRICHES the address (debt / collateral
//     / bonus) so the user sees the reward BEFORE absorbing. (Rome doesn't
//     surface Solana-native DoTxUnsigned positions as EVM logs, so the auto-list
//     misses them — the manual entry is how you hit those.)
//
// Re-checks isLiquidatable (when onCheck is supplied) right before absorbing —
// Comet.absorb reverts on a healthy account, and an account can heal between
// discovery/Check and Absorb.
// =====================================================================
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/landing/primitives";
import { eyebrow, fmt$ } from "@/components/aerarium/lane/primitives";
import { LiquidateFilterRow, type FilterState } from "@/components/LiquidateFilterRow";
import type { LiquidatableInfo } from "@/lib/portal/enrichLiquidatable";

export interface LiquidateViewProps {
  /** Auto-discovered + ENRICHED liquidatable accounts (scan → enrich). */
  accounts: LiquidatableInfo[];
  /** true while the first scan/enrich is in flight; [] when the scan found none. */
  loading: boolean;
  /** The lane's REAL absorb. Resolves with an optional explorer tx link. */
  onAbsorb: (account: string) => Promise<{ txUrl?: string }>;
  /**
   * Manual-entry Check + pre-absorb re-check. Returns the account's
   * LiquidatableInfo when it's liquidatable (so we can show debt/collateral/
   * bonus before absorbing), or null when it's healthy (HF ≥ 1).
   */
  onCheck?: (account: string) => Promise<LiquidatableInfo | null>;
  /** Chain name for copy (the active chain's display name). */
  chainName?: string;
  /** When the auto-scan itself isn't available (no list), hide that section. */
  scanAvailable?: boolean;
  /**
   * Is a wallet connected? The list + filter + Check are reads and ALWAYS
   * render; this only governs the WRITE action. When false, every Absorb
   * button becomes "Connect to absorb" and routes to onConnect instead of
   * onAbsorb — so the page is browsable read-only while disconnected. Defaults
   * to true so connected callers are unchanged.
   */
  connected?: boolean;
  /** Invoked by the gated "Connect to absorb" button when connected === false. */
  onConnect?: () => void;
}

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const fmtAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const fmtBonus = (pct: number) => `${pct.toFixed(2)}%`;
const fmtHF = (hf: number | null) => (hf == null ? "<1" : hf.toFixed(2));

// Default filter: everything strictly liquidatable (HF < 1, plus null = no-debt
// /unknown-HF accounts that passed isLiquidatable), any asset, no dust floor.
const DEFAULT_FILTER: FilterState = {
  hfThreshold: 1.0,
  collateralSymbol: null,
  debtSymbol: null,
  minSizeUSD: 0,
};
// Matches the page's 30s auto-refresh; surfaced in the filter row's Live tick.
const LIVE_SECONDS = 30;

type Phase = "idle" | "checking" | "liquidatable" | "healthy" | "absorbing" | "success" | "error";

interface RowState {
  phase: Phase;
  txUrl?: string;
  error?: string;
  /** Populated by the manual-entry Check so we can show debt/collateral/bonus. */
  info?: LiquidatableInfo;
}

const IDLE: RowState = { phase: "idle" };

export function LiquidateView({
  accounts,
  loading,
  onAbsorb,
  onCheck,
  chainName,
  scanAvailable = true,
  connected = true,
  onConnect,
}: LiquidateViewProps) {
  // When no wallet is connected, the write path (Absorb) is gated to a connect
  // prompt; all reads (list, filter, Check) stay live.
  const gated = !connected;
  // ---- filter state (internal — the data contract to the lane is unchanged) ----
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER);

  // Apply only the filters that map onto LiquidatableInfo:
  //   - hfThreshold: keep null HF (passed isLiquidatable / no-debt → always
  //     liquidatable) OR healthFactor <= threshold.
  //   - minSizeUSD: keep accounts whose debt clears the dust floor.
  // collateralSymbol / debtSymbol are intentionally NOT applied: LiquidatableInfo
  // carries no per-asset symbol, so those controls are parity-only no-ops (kept
  // to match the old EVM liquidate UI; they don't narrow the list).
  const filtered = useMemo(
    () =>
      accounts.filter(
        (a) =>
          (a.healthFactor == null || a.healthFactor <= filter.hfThreshold) &&
          a.debtUsd >= filter.minSizeUSD,
      ),
    [accounts, filter.hfThreshold, filter.minSizeUSD],
  );

  // ---- manual-address entry ----
  const [victim, setVictim] = useState("");
  const [manual, setManual] = useState<RowState>(IDLE);
  const victimTrimmed = victim.trim();
  const validVictim = ADDR_RE.test(victimTrimmed);

  // ---- per-row state for the auto-discovered list, keyed by lowercase addr ----
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const getRow = (addr: string): RowState => rowState[addr.toLowerCase()] ?? IDLE;
  const setRow = useCallback((addr: string, s: RowState) => {
    setRowState((prev) => ({ ...prev, [addr.toLowerCase()]: s }));
  }, []);

  // Shared absorb runner: optional re-check (reverts on healthy) → absorb →
  // success/error. Used by both the manual entry and each table row.
  const runAbsorb = useCallback(
    async (account: string, apply: (fn: (prev: RowState) => RowState) => void) => {
      apply((prev) => ({ ...prev, phase: "absorbing" }));
      try {
        if (onCheck) {
          const info = await onCheck(account);
          if (!info) {
            apply((prev) => ({
              ...prev,
              phase: "healthy",
              error: `${fmtAddr(account)} is healthy (HF ≥ 1) — absorb would revert.`,
            }));
            return;
          }
        }
        const { txUrl } = await onAbsorb(account);
        apply((prev) => ({ ...prev, phase: "success", txUrl }));
      } catch (e: unknown) {
        const err = e as { shortMessage?: string; message?: string };
        apply((prev) => ({
          ...prev,
          phase: "error",
          error: (err.shortMessage ?? err.message ?? String(e)).split("\n")[0].slice(0, 200),
        }));
      }
    },
    [onAbsorb, onCheck],
  );

  const runCheck = useCallback(async () => {
    if (!validVictim || !onCheck) return;
    setManual({ phase: "checking" });
    try {
      const info = await onCheck(victimTrimmed);
      setManual(info ? { phase: "liquidatable", info } : { phase: "healthy" });
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setManual({ phase: "error", error: (err.shortMessage ?? err.message ?? String(e)).split("\n")[0].slice(0, 200) });
    }
  }, [validVictim, victimTrimmed, onCheck]);

  // Empty/loading copy that lives INSIDE the table body (a full-width row) so
  // the filter + table headers stay on top even with nothing to absorb.
  const emptyMessage =
    loading && accounts.length === 0 ? (
      "Scanning for underwater accounts…"
    ) : (
      <>
        No accounts below HF&nbsp;{filter.hfThreshold} in the recent scan window
        {chainName ? <> — {chainName} is healthy</> : null}. Solana-native positions aren&apos;t
        event-indexed; use the manual entry below to absorb a known underwater address.
      </>
    );

  return (
    <>
      <Hero chainName={chainName} />

      {/* ---- PRIMARY: filter row + auto-discovered TABLE (always on top) ---- */}
      {scanAvailable && (
        <div style={{ ...cardStyle, maxWidth: 860 }}>
          <div style={{ ...eyebrow, marginBottom: 12 }}>Liquidatable accounts</div>

          <div style={{ marginBottom: 16 }}>
            <LiquidateFilterRow
              value={filter}
              onChange={setFilter}
              collatSymbols={[]}
              debtSymbols={[]}
              liveSeconds={LIVE_SECONDS}
            />
          </div>

          {/* The table structure (headers) is ALWAYS rendered; empty/loading is
              an in-table full-width row, never a replacement for the table. */}
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Borrower</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Collateral</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Debt</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Bonus</th>
                  <th style={{ ...thStyle, textAlign: "right" }} aria-label="Absorb" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr style={trStyle}>
                    <td
                      colSpan={5}
                      style={{ ...tdStyle, color: "var(--marble-2)", fontSize: 14, lineHeight: 1.55 }}
                      {...(loading && accounts.length === 0 ? { role: "status", "aria-busy": true } : {})}
                    >
                      {emptyMessage}
                    </td>
                  </tr>
                ) : (
                  filtered.map((acc) => (
                    <AccountRow
                      key={acc.address.toLowerCase()}
                      info={acc}
                      state={getRow(acc.address)}
                      gated={gated}
                      onConnect={onConnect}
                      onAbsorb={() => runAbsorb(acc.address, (fn) => setRow(acc.address, fn(getRow(acc.address))))}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {loading && accounts.length > 0 && (
            <div style={{ marginTop: 12, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em", color: "var(--marble-3)" }}>
              refreshing…
            </div>
          )}
          <p style={{ ...explainerStyle, marginTop: 16 }}>
            <span aria-hidden="true" style={{ marginRight: 6, color: "var(--marble-3)" }}>ⓘ</span>
            <strong>Bonus</strong> is an estimate — the USD-weighted liquidation discount
            (<code>1 − liquidationFactor</code>) across each account&apos;s held collateral. The realized
            reward depends on the storeFront price at <code>buyCollateral</code> time.
          </p>
        </div>
      )}

      {/* ---- SECONDARY: manual-address entry (below the table) ---- */}
      <div style={{ ...cardStyle, marginTop: 20 }}>
        <div style={{ ...eyebrow, marginBottom: 12 }}>Or absorb a specific address</div>
        <label htmlFor="aer-liq-victim" style={labelStyle}>
          Borrower address (0x…)
        </label>
        <input
          id="aer-liq-victim"
          value={victim}
          onChange={(e) => {
            setVictim(e.target.value);
            setManual(IDLE);
          }}
          placeholder="0x0000000000000000000000000000000000000000"
          spellCheck={false}
          autoComplete="off"
          style={inputStyle}
        />
        {victimTrimmed.length > 0 && !validVictim && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#c0392b", fontFamily: "var(--font-mono)" }}>
            Enter a 0x-prefixed 40-hex address.
          </div>
        )}

        <div style={{ marginTop: 18, display: "flex", gap: 12, flexWrap: "wrap" }}>
          {onCheck && (
            <Button variant="outline" size="md" onClick={runCheck}>
              {manual.phase === "checking" ? "Checking…" : "Check"}
            </Button>
          )}
          {gated ? (
            <Button variant="gold" size="md" onClick={onConnect}>
              Connect to absorb
            </Button>
          ) : (
            <Button
              variant="gold"
              size="md"
              onClick={() => {
                if (validVictim) void runAbsorb(victimTrimmed, (fn) => setManual(fn));
              }}
            >
              {manual.phase === "absorbing" ? "Absorbing… check wallet" : "Liquidate (absorb)"}
            </Button>
          )}
        </div>

        <ManualStatus state={manual} />

        <p style={explainerStyle}>
          <span aria-hidden="true" style={{ marginRight: 6, color: "var(--marble-3)" }}>ⓘ</span>
          This is the way to hit <strong>Solana-native</strong> / log-invisible accounts the scan above
          can&apos;t see. <code>Comet.absorb</code> seizes an underwater account&apos;s collateral and clears
          its debt. The collateral moves to the protocol&apos;s reserves; you can later{" "}
          <code>buyCollateral</code> at the storeFront discount, and the discount is your reward.
          HF&nbsp;&lt;&nbsp;1 is actionable; absorb reverts on a healthy account.
        </p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------
function AccountRow({
  info,
  state,
  onAbsorb,
  gated = false,
  onConnect,
}: {
  info: LiquidatableInfo;
  state: RowState;
  onAbsorb: () => void;
  /** When true, the row's write action becomes a connect prompt. */
  gated?: boolean;
  onConnect?: () => void;
}) {
  const busy = state.phase === "absorbing";
  return (
    <tr style={trStyle}>
      <td style={tdStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--marble)" }}>
            {fmtAddr(info.address)}
          </span>
          <span style={hfPillStyle}>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 6, background: "#c0392b" }} />
            HF&nbsp;{fmtHF(info.healthFactor)}
          </span>
        </div>
      </td>
      <td style={{ ...tdStyle, ...numCell }}>{fmt$(info.collateralUsd)}</td>
      <td style={{ ...tdStyle, ...numCell }}>{fmt$(info.debtUsd)}</td>
      <td style={{ ...tdStyle, ...numCell, color: "var(--pos)" }}>{fmtBonus(info.bonusPct)}</td>
      <td style={{ ...tdStyle, textAlign: "right" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, justifyContent: "flex-end" }}>
          {state.phase === "success" ? (
            <span style={{ fontSize: 12.5, color: "var(--pos)" }}>
              Absorbed
              {state.txUrl && (
                <>
                  {" · "}
                  <a href={state.txUrl} target="_blank" rel="noreferrer" style={{ color: "var(--pos)" }}>
                    tx ↗
                  </a>
                </>
              )}
            </span>
          ) : state.phase === "healthy" ? (
            <span style={{ fontSize: 12, color: "var(--marble-2)" }}>healthy now</span>
          ) : state.phase === "error" ? (
            <span style={{ fontSize: 12, color: "#c0392b", fontFamily: "var(--font-mono)", maxWidth: 220, display: "inline-block" }}>
              {state.error}
            </span>
          ) : null}
          {gated ? (
            <Button variant="gold" size="sm" onClick={onConnect}>
              Connect to absorb
            </Button>
          ) : (
            state.phase !== "success" && (
              <Button variant="gold" size="sm" onClick={onAbsorb}>
                {busy ? "Absorbing…" : "Absorb"}
              </Button>
            )
          )}
        </div>
      </td>
    </tr>
  );
}

function ManualStatus({ state }: { state: RowState }) {
  if (state.phase === "idle") return null;
  return (
    <div style={{ marginTop: 18 }}>
      {state.phase === "liquidatable" && (
        <div style={dangerBanner}>
          <strong>Liquidatable.</strong> HF&nbsp;{fmtHF(state.info?.healthFactor ?? null)} — absorb will seize
          collateral and clear the debt.
          {state.info && (
            <div style={{ marginTop: 10, display: "flex", gap: 18, flexWrap: "wrap", fontFamily: "var(--font-mono)", fontSize: 12.5 }}>
              <span>Collateral <strong>{fmt$(state.info.collateralUsd)}</strong></span>
              <span>Debt <strong>{fmt$(state.info.debtUsd)}</strong></span>
              <span>
                Bonus <strong style={{ color: "var(--pos)" }}>{fmtBonus(state.info.bonusPct)}</strong>{" "}
                <span style={{ color: "var(--marble-3)" }}>(est.)</span>
              </span>
            </div>
          )}
        </div>
      )}
      {state.phase === "healthy" && (
        <div style={warnBanner}>
          {state.error ?? "This account is healthy (HF ≥ 1). Absorb would revert; nothing to do."}
        </div>
      )}
      {state.phase === "success" && (
        <div style={successBanner}>
          Absorbed — collateral seized and debt cleared.
          {state.txUrl && (
            <>
              <br />
              <a href={state.txUrl} target="_blank" rel="noreferrer" style={{ color: "var(--pos)" }}>
                View transaction ↗
              </a>
            </>
          )}
        </div>
      )}
      {state.phase === "error" && state.error && <div style={errorBanner}>{state.error}</div>}
      {(state.phase === "checking" || state.phase === "absorbing") && (
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--marble-3)", fontFamily: "var(--font-mono)" }}>working…</div>
      )}
    </div>
  );
}

function Hero({ chainName }: { chainName?: string }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ ...eyebrow, marginBottom: 14 }}>Liquidate</div>
      <h1 className="aer-display" style={{ margin: 0, fontWeight: 400, fontSize: "clamp(32px, 5vw, 44px)", maxWidth: 820 }}>
        Earn the <em style={{ fontStyle: "italic" }}>liquidation</em> bonus.
      </h1>
      <p style={subStyle}>
        Repay an undercollateralized account&apos;s debt and seize its collateral at a discount
        {chainName ? <> on {chainName}</> : null}. HF&nbsp;&lt;&nbsp;1 is actionable; absorb reverts on a
        healthy account.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------
// Styles (light Aerarium lane chrome — same tokens the Solana page used).
const subStyle: React.CSSProperties = {
  margin: "12px 0 0",
  maxWidth: 700,
  fontFamily: "var(--font-sans)",
  fontSize: 14,
  lineHeight: 1.55,
  color: "var(--marble-2)",
};

const cardStyle: React.CSSProperties = {
  maxWidth: 560,
  width: "100%",
  background: "var(--paper)",
  border: "1px solid var(--stone-line)",
  borderRadius: 12,
  padding: 24,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  color: "var(--marble-2)",
  marginBottom: 8,
  fontFamily: "var(--font-sans)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 13px",
  borderRadius: 8,
  border: "1px solid var(--stone-line-2)",
  background: "var(--basalt)",
  color: "var(--marble)",
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  outline: "none",
};

const explainerStyle: React.CSSProperties = {
  margin: "20px 0 0",
  fontSize: 12.5,
  lineHeight: 1.6,
  color: "var(--marble-2)",
  fontFamily: "var(--font-sans)",
};

// --- table ---
const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--marble-3)",
  borderBottom: "1px solid var(--stone-line-2)",
  whiteSpace: "nowrap",
};

const trStyle: React.CSSProperties = {
  borderBottom: "1px solid var(--stone-line)",
};

const tdStyle: React.CSSProperties = {
  padding: "12px",
  color: "var(--marble)",
  verticalAlign: "middle",
};

const numCell: React.CSSProperties = {
  textAlign: "right",
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};

const hfPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 10px",
  borderRadius: 999,
  background: "rgba(226, 106, 106, 0.10)",
  color: "#c0392b",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.06em",
  whiteSpace: "nowrap",
};

const successBanner: React.CSSProperties = {
  padding: "12px 16px",
  background: "rgba(92, 207, 166, 0.10)",
  border: "1px solid rgba(92, 207, 166, 0.35)",
  borderRadius: 8,
  color: "var(--pos)",
  fontSize: 14,
};

const dangerBanner: React.CSSProperties = {
  padding: "12px 16px",
  background: "rgba(226, 106, 106, 0.10)",
  border: "1px solid rgba(226, 106, 106, 0.35)",
  borderRadius: 8,
  color: "#c0392b",
  fontSize: 13.5,
};

const warnBanner: React.CSSProperties = {
  padding: "12px 16px",
  background: "rgba(232, 160, 78, 0.10)",
  border: "1px solid rgba(232, 160, 78, 0.35)",
  borderRadius: 8,
  color: "var(--marble-2)",
  fontSize: 14,
};

const errorBanner: React.CSSProperties = {
  padding: "12px 16px",
  background: "rgba(226, 106, 106, 0.10)",
  border: "1px solid rgba(226, 106, 106, 0.35)",
  borderRadius: 8,
  color: "#c0392b",
  fontSize: 13,
  fontFamily: "var(--font-mono)",
};
