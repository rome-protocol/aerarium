"use client";

// Modal for Supply / Withdraw / Leverage actions.  Renders a preview block
// computed by lib/portal/stats.computeActionPreview so the user sees the
// post-action state before confirming.

import { useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { computeActionPreview, type ActionPreviewInput, type ActionPreviewRequest } from "@/lib/portal/stats";
import { Button } from "./ui/Button";
import { AmountInput } from "./ui/AmountInput";
import { TokenIcon } from "./ui/TokenIcon";
import { Spinner } from "./ui/Spinner";
import { Eyebrow } from "./ui/Eyebrow";
import { Hairline } from "./ui/Hairline";
import { fmtUSDC, fmtUSD } from "./ui/format";

// "borrow" and "repay" are display-only verbs. At the protocol level Compound v3
// has no distinct borrow/repay primitive — taking debt is `withdraw` past your
// supply, repaying debt is `supply` against an existing borrow. The modal
// keeps these as separate modes so the user sees the verb that matches the
// page they came from (Borrow on /borrow, Repay on the borrows row).
export type ActionMode = "supply" | "withdraw" | "borrow" | "repay" | "leverage";

interface ActionModalProps {
  open: boolean;
  onClose: () => void;
  mode: ActionMode;
  /** Pre-selected collateral symbol when mode === "leverage". */
  defaultCollatSymbol?: string;
  /** Available collat symbols (for leverage picker). */
  collatChoices?: string[];
  baseSymbol: string;
  baseDecimals: number;
  collatDecimalsBySymbol: Record<string, number>;
  /** Current state passed to computeActionPreview. */
  previewState: ActionPreviewInput;
  /** Action: invoked when user clicks the primary submit; returns when done. */
  onSubmit: (input: ActionPreviewRequest) => Promise<void>;
  /** Action drawer status messaging — caller maintains this. */
  inFlight?: boolean;
  statusMessage?: string;
  /**
   * Success state. When true the modal swaps from the form to a ✓ + past-tense
   * verb + amount summary + (optional) view-tx link + Close button view.
   * Mirrors the a companion Aave demo ActionModal "success" phase. Caller is
   * responsible for resetting the parent state when the modal closes
   * (typically setStatus({phase:"idle"}) inside onClose).
   */
  done?: boolean;
  doneMessage?: string;
  doneTxLink?: string;
  /**
   * Per-row asset selector. When the user clicks Supply/Withdraw on a row
   * in AssetsToSupplyTable or YourSuppliesTable, that row's asset is
   * forwarded here so the modal labels match the click. When all three
   * are absent the modal defaults to the base asset (back-compat with the
   * account-card quick actions, which don't carry a row context).
   *
   * `targetAssetAddress` flips the submit branch onto the collateral
   * preview kinds — see `previewReq` below. If the row IS the base asset,
   * the caller omits these props and the modal stays on the base path.
   */
  targetAssetSymbol?: string;
  targetAssetDecimals?: number;
  targetAssetAddress?: string;
  /**
   * Error message to surface INSIDE the modal — usually the revert reason
   * from a failed approve / supply / withdraw. Rendered above the primary
   * CTA so the user sees the failure in-context instead of having to
   * scroll past the modal to the background. When undefined, no error
   * block renders.
   */
  errorMessage?: string;
  /**
   * Available base liquidity (raw bigint, base decimals) in the protocol
   * for borrow. When set + mode=borrow, the CTA is disabled and a hint
   * shows if the entered amount exceeds it. Prevents the user from
   * signing a tx that would revert with SPL InsufficientFunds at the
   * Comet level.
   */
  availableLiquidity?: bigint;
}

export function ActionModal({
  open,
  onClose,
  mode,
  defaultCollatSymbol,
  collatChoices = [],
  baseSymbol,
  baseDecimals,
  collatDecimalsBySymbol,
  previewState,
  onSubmit,
  inFlight = false,
  statusMessage,
  done = false,
  doneMessage,
  doneTxLink,
  targetAssetSymbol,
  targetAssetDecimals,
  targetAssetAddress,
  errorMessage,
  availableLiquidity,
}: ActionModalProps) {
  const effectiveSymbol = targetAssetSymbol ?? baseSymbol;
  const effectiveDecimals = targetAssetDecimals ?? baseDecimals;
  const isCollatRow = Boolean(targetAssetAddress);
  const [amount, setAmount] = useState("");
  const [collatAmount, setCollatAmount] = useState("");
  const [collatSymbol, setCollatSymbol] = useState<string>(defaultCollatSymbol ?? collatChoices[0] ?? "");

  // Reset form on open transitions OR when the mode changes mid-flow
  // (e.g. user switches Supply → Leverage with the modal still open).
  // Not on collatChoices ref changes (which fire every parent re-render
  // if the array isn't memoized upstream).
  useEffect(() => {
    if (open) {
      setAmount("");
      setCollatAmount("");
      setCollatSymbol((prev) => prev || defaultCollatSymbol || collatChoices[0] || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  const collatDecimals = collatDecimalsBySymbol[collatSymbol] ?? 18;

  const parsed = useMemo(() => {
    try {
      // For non-leverage modes the primary amount parses against the row's
      // decimals (base by default, or the targetAsset's when supplied via
      // per-row clicks). For leverage, the primary amount is always base.
      const primaryDecimals = mode === "leverage" ? baseDecimals : effectiveDecimals;
      const base = amount && Number(amount) > 0 ? parseUnits(amount, primaryDecimals) : 0n;
      const collat = collatAmount && Number(collatAmount) > 0 ? parseUnits(collatAmount, collatDecimals) : 0n;
      return { base, collat, ok: true };
    } catch {
      return { base: 0n, collat: 0n, ok: false };
    }
  }, [amount, collatAmount, baseDecimals, collatDecimals, effectiveDecimals, mode]);

  const previewReq: ActionPreviewRequest | null = useMemo(() => {
    if (!parsed.ok) return null;
    // borrow → withdraw, repay → supply at the protocol level (Compound v3
    // has no distinct primitives — see ActionMode comment above).
    // When the user landed on this modal from a per-row click on a non-base
    // asset (isCollatRow), the supply/withdraw modes dispatch to the
    // collateral preview kinds so computeActionPreview adjusts the right
    // pocket. Borrow/repay always touch the base asset in Compound v3.
    if (mode === "supply" && isCollatRow && targetAssetSymbol && parsed.base > 0n)
      return { kind: "supplyCollateral", asset: targetAssetSymbol, amount: parsed.base };
    if (mode === "withdraw" && isCollatRow && targetAssetSymbol && parsed.base > 0n)
      return { kind: "withdrawCollateral", asset: targetAssetSymbol, amount: parsed.base };
    if ((mode === "supply" || mode === "repay") && parsed.base > 0n)
      return { kind: "supply", asset: "base", amount: parsed.base };
    if ((mode === "withdraw" || mode === "borrow") && parsed.base > 0n)
      return { kind: "withdraw", asset: "base", amount: parsed.base };
    if (mode === "leverage" && parsed.collat > 0n && parsed.base > 0n) {
      return {
        kind: "leverageOpen",
        collateralAsset: collatSymbol,
        collateralAmount: parsed.collat,
        borrowAmount: parsed.base,
      };
    }
    return null;
  }, [parsed, mode, collatSymbol, isCollatRow, targetAssetSymbol]);

  const preview = useMemo(
    () => (previewReq ? computeActionPreview(previewState, previewReq) : null),
    [previewReq, previewState],
  );

  // Compound v3 quirk: "borrow" is mechanically `withdraw` past 0 base
  // supply. If the user is on /borrow and enters an amount ≤ their current
  // base supply, the action mechanically succeeds but the result is a
  // withdraw from supply (no debt). Block the Borrow CTA with an inline
  // hint so the /borrow page never silently performs a withdraw.
  const borrowIsActuallyWithdraw =
    mode === "borrow" &&
    parsed.base > 0n &&
    parsed.base <= previewState.baseSupplyBalance;

  // Compound v3 borrow pulls from the Comet's wUSDC ATA. If the user asks
  // for more than the Comet has on hand, the SPL Token CPI reverts with
  // InsufficientFunds (Custom 0x1). Block CTA + show the actual cap.
  const exceedsLiquidity =
    mode === "borrow" &&
    availableLiquidity !== undefined &&
    parsed.base > availableLiquidity;
  const availableLiquidityDisplay =
    availableLiquidity !== undefined
      ? Number(formatUnits(availableLiquidity, baseDecimals)).toFixed(2)
      : null;

  if (!open) return null;

  const title =
    mode === "supply" ? `Supply ${effectiveSymbol}` :
    mode === "withdraw" ? `Withdraw ${effectiveSymbol}` :
    mode === "borrow" ? `Borrow ${baseSymbol}` :
    mode === "repay" ? `Repay ${baseSymbol}` :
    "Open leveraged position";

  // Sanitize for the CTA label. `${amount || "0"}` left "." and whitespace
  // through (both truthy), giving "Supply . wSOL" mid-typing. Show the raw
  // amount only when it's a valid positive number; otherwise show "0".
  const amountForLabel = amount && Number(amount) > 0 ? amount : "0";
  const collatAmountForLabel = collatAmount && Number(collatAmount) > 0 ? collatAmount : "0";
  const primaryLabel =
    mode === "supply" ? `Supply ${amountForLabel} ${effectiveSymbol}` :
    mode === "withdraw" ? `Withdraw ${amountForLabel} ${effectiveSymbol}` :
    mode === "borrow" ? `Borrow ${amountForLabel} ${baseSymbol}` :
    mode === "repay" ? `Repay ${amountForLabel} ${baseSymbol}` :
    `Supply ${collatAmountForLabel} ${collatSymbol} + borrow ${amountForLabel} ${baseSymbol}`;

  const walletBase = previewState.walletBaseBalance;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !inFlight) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "min(440px, 100%)",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 12,
          padding: 24,
          boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <TokenIcon
              symbol={
                mode === "leverage"
                  ? collatSymbol || baseSymbol
                  : mode === "supply" || mode === "withdraw"
                  ? effectiveSymbol
                  : baseSymbol
              }
              size={28}
            />
            <h2 style={{
              fontFamily: "var(--font-serif)",
              fontSize: 22,
              fontWeight: 400,
              margin: 0,
              color: "var(--fg1)",
            }}>
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={inFlight}
            aria-label="Dismiss"
            style={{
              appearance: "none",
              background: "transparent",
              border: "none",
              cursor: inFlight ? "not-allowed" : "pointer",
              color: "var(--fg2)",
              fontSize: 20,
              padding: 4,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {done ? (
          // Success view — ✓ icon + past-tense verb + amount + (optional)
          // view-tx link + Close button. Mirrors a companion Aave demo's
          // "success" phase. Caller is responsible for resetting state when
          // the modal closes.
          <SuccessView
            mode={mode}
            message={doneMessage}
            txLink={doneTxLink}
            onClose={onClose}
          />
        ) : (
          // Form body — JSX inlined directly (NOT wrapped in a nested
          // component). A nested `function FormBody()` declared inside
          // ActionModal creates a fresh function reference on every render;
          // React treats `<FormBody />` as a new component type each render
          // and remounts the whole subtree, blowing away focus on the
          // AmountInput. Inlined here so the input keeps its DOM identity
          // across keystrokes.
          <>
            {mode === "leverage" && collatChoices.length > 1 ? (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Eyebrow>Collateral</Eyebrow>
                {collatChoices.map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={collatSymbol === s ? "primary" : "ghost"}
                    onClick={() => setCollatSymbol(s)}
                    disabled={inFlight}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            ) : null}

            {mode === "leverage" ? (
              <>
                <AmountInput
                  value={collatAmount}
                  onChange={setCollatAmount}
                  max={
                    previewState.collateralByAsset[collatSymbol]
                      ? formatUnits(previewState.collateralByAsset[collatSymbol].walletBalance, collatDecimals)
                      : undefined
                  }
                  maxLabel="Max"
                  suffix={`${collatSymbol} collat`}
                />
                <AmountInput
                  value={amount}
                  onChange={setAmount}
                  suffix={`${baseSymbol} borrow`}
                />
              </>
            ) : (
              <AmountInput
                value={amount}
                onChange={setAmount}
                max={
                  isCollatRow && targetAssetSymbol
                    ? mode === "supply"
                      ? previewState.collateralByAsset[targetAssetSymbol]
                        ? formatUnits(
                            previewState.collateralByAsset[targetAssetSymbol].walletBalance,
                            effectiveDecimals,
                          )
                        : undefined
                      : mode === "withdraw"
                      ? previewState.collateralByAsset[targetAssetSymbol]
                        ? formatUnits(
                            previewState.collateralByAsset[targetAssetSymbol].balance,
                            effectiveDecimals,
                          )
                        : undefined
                      : undefined
                    : mode === "supply"
                    ? formatUnits(walletBase, baseDecimals)
                    : mode === "repay"
                    ? formatUnits(
                        previewState.baseBorrowBalance < walletBase
                          ? previewState.baseBorrowBalance
                          : walletBase,
                        baseDecimals,
                      )
                    : mode === "borrow"
                    ? availableLiquidity !== undefined
                      ? formatUnits(availableLiquidity, baseDecimals)
                      : undefined
                    : formatUnits(previewState.baseSupplyBalance, baseDecimals)
                }
                maxLabel="Max"
                suffix={mode === "supply" || mode === "withdraw" ? effectiveSymbol : baseSymbol}
              />
            )}

            <Hairline />

            <PreviewBlock
              baseSymbol={baseSymbol}
              baseDecimals={baseDecimals}
              previewState={previewState}
              preview={preview}
              mode={mode}
              targetAssetSymbol={isCollatRow ? targetAssetSymbol : undefined}
              targetAssetDecimals={isCollatRow ? targetAssetDecimals : undefined}
              parsedAmount={parsed.base}
            />

            {borrowIsActuallyWithdraw ? (
              <div
                role="status"
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "var(--hf-warn-bg)",
                  border: "1px solid var(--border-default)",
                  color: "var(--hf-warn)",
                  fontFamily: "var(--font-sans)",
                  fontSize: 12,
                  lineHeight: 1.45,
                }}
              >
                That amount is within your supply, so this would withdraw from
                supply (no actual borrow). Use the Withdraw action on /supply
                instead, or enter an amount above your current supply to take on
                real debt.
              </div>
            ) : null}

            {exceedsLiquidity && availableLiquidityDisplay ? (
              <div
                role="status"
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "var(--hf-warn-bg)",
                  border: "1px solid var(--border-default)",
                  color: "var(--hf-warn)",
                  fontFamily: "var(--font-sans)",
                  fontSize: 12,
                  lineHeight: 1.45,
                }}
              >
                Comet only has <strong>{availableLiquidityDisplay} {baseSymbol}</strong> available to borrow right now.
                Enter an amount at or below that to avoid an insufficient-liquidity revert.
              </div>
            ) : null}

            {errorMessage ? (
              <div
                role="alert"
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "var(--hf-danger-bg, #2a1a1a)",
                  border: "1px solid var(--hf-danger, #c44)",
                  color: "var(--hf-danger, #c44)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  lineHeight: 1.45,
                  wordBreak: "break-word",
                }}
              >
                {errorMessage}
              </div>
            ) : null}

            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => previewReq && onSubmit(previewReq)}
              disabled={inFlight || !previewReq || borrowIsActuallyWithdraw || exceedsLiquidity}
            >
              {inFlight ? <><Spinner /> {statusMessage || "Working…"}</> : primaryLabel}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ────────────── Success view ──────────────
// Past-tense verb + amount summary + (optional) view-tx + Close. Renders
// instead of the form when ActionModal receives `done={true}`. Mirrors the
// a companion Aave demo modal's success phase.

const PAST_VERB: Record<ActionMode, string> = {
  supply: "Supplied",
  withdraw: "Withdrew",
  borrow: "Borrowed",
  repay: "Repaid",
  leverage: "Position opened",
};

function SuccessView({
  mode,
  message,
  txLink,
  onClose,
}: {
  mode: ActionMode;
  message?: string;
  txLink?: string;
  onClose: () => void;
}) {
  return (
    <>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          padding: "24px 0",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 56,
            height: 56,
            borderRadius: 999,
            background: "var(--hf-safe-bg)",
            color: "var(--hf-safe)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 28,
          }}
        >
          ✓
        </div>
        <div
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 22,
            color: "var(--fg1)",
            fontWeight: 400,
          }}
        >
          {PAST_VERB[mode]}.
        </div>
        {message ? (
          <div style={{ color: "var(--fg2)", fontSize: 13, fontFamily: "var(--font-sans)" }}>
            {message}
          </div>
        ) : null}
        {txLink ? (
          <a
            href={txLink}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: "var(--fg-brand)",
              textDecoration: "none",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.04em",
            }}
          >
            View transaction ↗
          </a>
        ) : null}
      </div>
      <Button variant="primary" size="lg" fullWidth onClick={onClose}>
        Close
      </Button>
    </>
  );
}

interface PreviewBlockProps {
  baseSymbol: string;
  baseDecimals: number;
  previewState: ActionPreviewInput;
  preview: ReturnType<typeof computeActionPreview> | null;
  mode: ActionMode;
  /**
   * When set, the modal is acting on a collateral row (per-row supply/
   * withdraw). The preview rows reflect the COLLATERAL pocket instead of
   * the base pocket: WALLET shows the collat's wallet balance, COLLATERAL
   * shows the current and after collat balance, BASE SUPPLY row hides
   * (unchanged by a collat action). Falls back to the base-pocket rows
   * when undefined (account-card quick actions, base-row clicks).
   */
  targetAssetSymbol?: string;
  targetAssetDecimals?: number;
  /** Parsed amount in target decimals — needed to compute "after" balances
   *  in the collat-aware rows. */
  parsedAmount?: bigint;
}

function PreviewBlock({
  baseSymbol,
  baseDecimals,
  previewState,
  preview,
  mode,
  targetAssetSymbol,
  targetAssetDecimals,
  parsedAmount = 0n,
}: PreviewBlockProps) {
  const isCollatPreview =
    targetAssetSymbol !== undefined &&
    targetAssetDecimals !== undefined &&
    previewState.collateralByAsset[targetAssetSymbol] !== undefined &&
    (mode === "supply" || mode === "withdraw");

  if (isCollatPreview) {
    const collat = previewState.collateralByAsset[targetAssetSymbol!];
    const dec = targetAssetDecimals!;
    // Delta sign by action direction (supply pulls from wallet → balance,
    // withdraw pushes from balance → wallet).
    const walletAfter =
      mode === "supply"
        ? collat.walletBalance - parsedAmount
        : collat.walletBalance + parsedAmount;
    const balanceAfter =
      mode === "supply"
        ? collat.balance + parsedAmount
        : collat.balance - parsedAmount;
    const hasAmount = parsedAmount > 0n;
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "12px 0",
          fontFamily: "var(--font-sans)",
          fontSize: 13,
          color: "var(--fg1)",
        }}
      >
        <PreviewRow
          label="Wallet"
          before={Number(formatUnits(collat.walletBalance, dec)).toFixed(4)}
          after={hasAmount ? Number(formatUnits(walletAfter, dec)).toFixed(4) : null}
          suffix={targetAssetSymbol}
        />
        <PreviewRow
          label="Collateral"
          before={Number(formatUnits(collat.balance, dec)).toFixed(4)}
          after={hasAmount ? Number(formatUnits(balanceAfter, dec)).toFixed(4) : null}
          suffix={targetAssetSymbol}
        />
        <PreviewRow
          label="Health"
          before={hf(previewState)}
          after={preview ? hf2(preview.healthFactorAfter) : null}
        />
        {preview && preview.hint ? (
          <div
            style={{
              marginTop: 8,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.04em",
              color: "var(--fg2)",
            }}
          >
            {preview.hint}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "12px 0",
        fontFamily: "var(--font-sans)",
        fontSize: 13,
        color: "var(--fg1)",
      }}
    >
      <PreviewRow
        label="Wallet"
        before={fmtUSDC(Number(formatUnits(previewState.walletBaseBalance, baseDecimals)))}
        after={preview ? fmtUSDC(Number(formatUnits(preview.walletBaseAfter, baseDecimals))) : null}
        suffix={baseSymbol}
      />
      {mode !== "leverage" ? (
        <PreviewRow
          label="Base supply"
          before={fmtUSDC(Number(formatUnits(previewState.baseSupplyBalance, baseDecimals)))}
          after={preview ? fmtUSDC(Number(formatUnits(preview.baseSupplyAfter, baseDecimals))) : null}
          suffix={baseSymbol}
        />
      ) : null}
      {mode !== "supply" ? (
        <PreviewRow
          label="Borrow"
          before={fmtUSDC(Number(formatUnits(previewState.baseBorrowBalance, baseDecimals)))}
          after={preview ? fmtUSDC(Number(formatUnits(preview.baseBorrowAfter, baseDecimals))) : null}
          suffix={baseSymbol}
        />
      ) : null}
      {mode === "leverage" ? (
        <PreviewRow
          label="Collateral"
          before={fmtUSD(previewState.collateralValueUSD)}
          after={preview ? fmtUSD(preview.collateralValueAfterUSD) : null}
        />
      ) : null}
      <PreviewRow
        label="Health"
        before={hf(previewState)}
        after={preview ? hf2(preview.healthFactorAfter) : null}
      />
      {preview && preview.hint ? (
        <div
          style={{
            marginTop: 8,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.04em",
            color: "var(--fg2)",
          }}
        >
          {preview.hint}
        </div>
      ) : null}
    </div>
  );
}

function PreviewRow({ label, before, after, suffix }: { label: string; before: string; after: string | null; suffix?: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "100px 1fr auto 1fr", gap: 12, alignItems: "center" }}>
      <span style={{ color: "var(--fg2)", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ color: "var(--fg2)" }}>{before}{suffix ? ` ${suffix}` : ""}</span>
      <span style={{ color: "var(--fg2)" }}>→</span>
      <span style={{ color: after ? "var(--fg1)" : "var(--fg2)", fontWeight: after ? 500 : 400 }}>
        {after ?? "—"}{suffix ? ` ${suffix}` : ""}
      </span>
    </div>
  );
}

function hf(state: ActionPreviewInput): string {
  const borrowValueUSD = (Number(state.baseBorrowBalance) / 10 ** state.baseDecimals) * (Number(state.basePriceUSDx8) / 1e8);
  if (borrowValueUSD === 0) return "∞";
  return (state.liquidationThresholdUSD / borrowValueUSD).toFixed(2) + "x";
}

function hf2(h: number): string {
  return h === Infinity ? "∞" : h.toFixed(2) + "x";
}
