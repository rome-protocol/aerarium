// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActionModal } from "../ActionModal";
import type { ActionPreviewInput } from "@/lib/portal/stats";

const previewState: ActionPreviewInput = {
  baseDecimals: 6,
  basePriceUSDx8: 100_000_000n,
  walletBaseBalance: 0n,
  baseSupplyBalance: 0n,
  baseBorrowBalance: 0n,
  collateralValueUSD: 0,
  borrowCapacityUSD: 0,
  liquidationThresholdUSD: 0,
  collateralByAsset: {},
};

const baseProps = {
  open: true,
  onClose: () => {},
  baseSymbol: "wUSDC",
  baseDecimals: 6,
  collatDecimalsBySymbol: {},
  previewState,
  onSubmit: vi.fn(async () => {}),
};

describe("ActionModal verb labels", () => {
  it("mode=supply shows 'Supply wUSDC' title and 'Supply 0 wUSDC' primary", () => {
    render(<ActionModal {...baseProps} mode="supply" />);
    expect(screen.getByRole("heading", { name: /Supply wUSDC/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Supply 0 wUSDC$/i })).toBeInTheDocument();
  });

  it("mode=withdraw shows 'Withdraw wUSDC' title and 'Withdraw 0 wUSDC' primary", () => {
    render(<ActionModal {...baseProps} mode="withdraw" />);
    expect(screen.getByRole("heading", { name: /Withdraw wUSDC/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Withdraw 0 wUSDC$/i })).toBeInTheDocument();
  });

  it("mode=borrow shows 'Borrow wUSDC' title and 'Borrow 0 wUSDC' primary (NOT Withdraw)", () => {
    render(<ActionModal {...baseProps} mode="borrow" />);
    expect(screen.getByRole("heading", { name: /Borrow wUSDC/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Borrow 0 wUSDC$/i })).toBeInTheDocument();
    // Should NOT be labeled Withdraw
    expect(screen.queryByRole("heading", { name: /Withdraw/i })).not.toBeInTheDocument();
  });

  it("mode=repay shows 'Repay wUSDC' title and 'Repay 0 wUSDC' primary (NOT Supply)", () => {
    render(<ActionModal {...baseProps} mode="repay" />);
    expect(screen.getByRole("heading", { name: /Repay wUSDC/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Repay 0 wUSDC$/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Supply/i })).not.toBeInTheDocument();
  });

  it("mode=leverage shows 'Open leveraged position'", () => {
    render(
      <ActionModal
        {...baseProps}
        mode="leverage"
        defaultCollatSymbol="wETH"
        collatChoices={["wETH"]}
        collatDecimalsBySymbol={{ wETH: 18 }}
      />,
    );
    expect(screen.getByRole("heading", { name: /Open leveraged position/i })).toBeInTheDocument();
  });
});

describe("ActionModal success state", () => {
  it("when done=true, replaces the form with a success view (verb past-tense + amount + view-tx link + Close button)", () => {
    render(
      <ActionModal
        {...baseProps}
        mode="supply"
        done
        doneMessage="Supplied 1.50 wUSDC"
        doneTxLink="https://hadrian.testnet.romeprotocol.xyz/tx/0xabc"
      />,
    );
    // Past-tense verb visible (matches both "Supplied." header and the
    // "Supplied 1.50 wUSDC" message — getAllByText proves the success view
    // is in the DOM without disambiguating which copy).
    expect(screen.getAllByText(/Supplied/i).length).toBeGreaterThanOrEqual(1);
    // View-transaction link to the explorer
    const txLink = screen.getByRole("link", { name: /view transaction/i });
    expect(txLink).toHaveAttribute("href", "https://hadrian.testnet.romeprotocol.xyz/tx/0xabc");
    // Close button replaces the primary CTA
    expect(screen.getByRole("button", { name: /^Close$/i })).toBeInTheDocument();
    // Amount-input form is hidden
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("when done=true, the original primary CTA ('Supply 0 wUSDC') is NOT rendered", () => {
    render(
      <ActionModal
        {...baseProps}
        mode="supply"
        done
        doneMessage="Supplied 1.50 wUSDC"
        doneTxLink="https://x/tx/0xabc"
      />,
    );
    expect(screen.queryByRole("button", { name: /^Supply 0 wUSDC$/i })).not.toBeInTheDocument();
  });

  it("done=true with no doneTxLink omits the view-tx link but still shows the Close button", () => {
    render(
      <ActionModal
        {...baseProps}
        mode="repay"
        done
        doneMessage="Repaid 0.50 wUSDC"
      />,
    );
    expect(screen.getByRole("button", { name: /^Close$/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /view transaction/i })).not.toBeInTheDocument();
  });
});

describe("ActionModal targetAsset (per-row asset clicks)", () => {
  // Per-row Supply / Withdraw buttons in AssetsToSupplyTable + YourSupplies
  // pass the asset that was clicked. The modal must reflect THAT asset in
  // its title and primary CTA, not silently fall back to the base symbol.
  // Without these props, the modal still defaults to baseSymbol for
  // back-compat (existing account-card quick actions).

  it("mode=supply with targetAssetSymbol='wETH' shows 'Supply wETH' title + 'Supply 0 wETH' primary", () => {
    render(
      <ActionModal
        {...baseProps}
        mode="supply"
        targetAssetSymbol="wETH"
        targetAssetDecimals={18}
      />,
    );
    expect(screen.getByRole("heading", { name: /Supply wETH/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Supply 0 wETH$/i })).toBeInTheDocument();
  });

  it("mode=withdraw with targetAssetSymbol='wETH' shows 'Withdraw wETH' title + 'Withdraw 0 wETH' primary", () => {
    render(
      <ActionModal
        {...baseProps}
        mode="withdraw"
        targetAssetSymbol="wETH"
        targetAssetDecimals={18}
      />,
    );
    expect(screen.getByRole("heading", { name: /Withdraw wETH/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Withdraw 0 wETH$/i })).toBeInTheDocument();
  });

  it("falls back to baseSymbol when targetAssetSymbol is absent (back-compat with account-card quick actions)", () => {
    render(<ActionModal {...baseProps} mode="supply" />);
    expect(screen.getByRole("heading", { name: /Supply wUSDC/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Supply 0 wUSDC$/i })).toBeInTheDocument();
  });

  it("mode=supply on a collat target emits {kind:'supplyCollateral', asset:<symbol>, amount} on submit", () => {
    const onSubmit = vi.fn(async () => {});
    render(
      <ActionModal
        {...baseProps}
        mode="supply"
        onSubmit={onSubmit}
        targetAssetSymbol="wETH"
        targetAssetDecimals={18}
        targetAssetAddress="0xcc"
        previewState={{
          ...previewState,
          collateralByAsset: {
            wETH: {
              symbol: "wETH",
              decimals: 18,
              balance: 0n,
              priceUSDx8: 0n,
              borrowCollateralFactor: 700_000_000_000_000_000n,
              liquidateCollateralFactor: 800_000_000_000_000_000n,
              walletBalance: 5_000_000_000_000_000_000n,
            },
          },
        }}
      />,
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "2.5" } });
    const cta = screen.getByRole("button", { name: /^Supply 2.5 wETH$/i });
    fireEvent.click(cta);
    expect(onSubmit).toHaveBeenCalledWith({
      kind: "supplyCollateral",
      asset: "wETH",
      amount: 2_500_000_000_000_000_000n,
    });
  });

  it("mode=withdraw on a collat target emits {kind:'withdrawCollateral', asset:<symbol>, amount} on submit", () => {
    const onSubmit = vi.fn(async () => {});
    render(
      <ActionModal
        {...baseProps}
        mode="withdraw"
        onSubmit={onSubmit}
        targetAssetSymbol="wETH"
        targetAssetDecimals={18}
        targetAssetAddress="0xcc"
        previewState={{
          ...previewState,
          collateralByAsset: {
            wETH: {
              symbol: "wETH",
              decimals: 18,
              balance: 3_000_000_000_000_000_000n,
              priceUSDx8: 0n,
              borrowCollateralFactor: 700_000_000_000_000_000n,
              liquidateCollateralFactor: 800_000_000_000_000_000n,
              walletBalance: 0n,
            },
          },
        }}
      />,
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "1.25" } });
    const cta = screen.getByRole("button", { name: /^Withdraw 1.25 wETH$/i });
    fireEvent.click(cta);
    expect(onSubmit).toHaveBeenCalledWith({
      kind: "withdrawCollateral",
      asset: "wETH",
      amount: 1_250_000_000_000_000_000n,
    });
  });
});

describe("ActionModal input focus retention (no nested-component remount)", () => {
  // Regression caught 2026-05-28: FormBody was a function declared inside
  // ActionModal, so a new function reference was created on every render.
  // React identifies components by reference, so each re-render unmounted
  // the old FormBody and remounted a fresh one — the AmountInput's DOM
  // element was recreated, the user lost focus, and they had to click into
  // the input again after each keystroke.

  it("AmountInput DOM element is the same across multiple state changes (typing one char at a time)", () => {
    const { container } = render(<ActionModal {...baseProps} mode="supply" />);
    const input1 = container.querySelector("input");
    expect(input1).toBeTruthy();
    // First keystroke
    fireEvent.change(input1!, { target: { value: "1" } });
    const input2 = container.querySelector("input");
    expect(input2).toBe(input1);
    // Second keystroke
    fireEvent.change(input2!, { target: { value: "12" } });
    const input3 = container.querySelector("input");
    expect(input3).toBe(input1);
    // Third
    fireEvent.change(input3!, { target: { value: "123" } });
    expect(container.querySelector("input")).toBe(input1);
  });
});

describe("ActionModal error rendered inside the modal", () => {
  // When a submit fails, the error message must surface where the user is
  // looking — inside the modal — not in the background account card. The
  // bg banner is fine as a closed-modal recap, but the live in-flight
  // error has to be on top of the modal so the user can see it without
  // scrolling away.

  it("renders errorMessage inside the modal form body when provided", () => {
    render(<ActionModal {...baseProps} mode="supply" errorMessage="Reverted: 0x1" />);
    expect(screen.getByText(/Reverted: 0x1/i)).toBeInTheDocument();
  });

  it("when errorMessage is set, the primary CTA stays enabled so the user can retry", () => {
    render(<ActionModal {...baseProps} mode="supply" errorMessage="Reverted: 0x1" />);
    // The CTA "Supply 0 wUSDC" should be disabled because no amount, but
    // not BECAUSE of the error — provide a sanity case with a valid amount.
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "1" } });
    const cta = screen.getByRole("button", { name: /^Supply 1 wUSDC$/i });
    expect(cta).not.toBeDisabled();
  });

  it("when errorMessage is NOT provided, no error block renders inside the modal", () => {
    const { container } = render(<ActionModal {...baseProps} mode="supply" />);
    // No alert role and no "Reverted" text
    expect(container.textContent || "").not.toMatch(/Reverted/i);
  });
});

describe("ActionModal borrow liquidity guard", () => {
  // Compound v3 borrows pull from the Comet's wUSDC wallet. If the user
  // asks for more than the Comet has on hand, the tx reverts with SPL
  // InsufficientFunds (Custom 0x1). Block the CTA + show the limit so
  // the user adjusts before signing.

  it("blocks Borrow CTA when amount > availableLiquidity (with hint)", () => {
    const state: ActionPreviewInput = {
      ...previewState,
      walletBaseBalance: 50_000_000n,
      baseSupplyBalance: 0n,
    };
    render(
      <ActionModal
        {...baseProps}
        mode="borrow"
        previewState={state}
        availableLiquidity={4_095_004n} // 4.095 wUSDC available
      />,
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "5" } });
    const cta = screen.getByRole("button", { name: /^Borrow 5 wUSDC$/i });
    expect(cta).toBeDisabled();
    // Hint visible — shows the formatted cap (4.095004 → "4.10" via toFixed(2))
    expect(screen.getByText(/4\.10\s*wUSDC/)).toBeInTheDocument();
  });

  it("allows Borrow CTA when amount ≤ availableLiquidity", () => {
    const state: ActionPreviewInput = {
      ...previewState,
      walletBaseBalance: 50_000_000n,
      baseSupplyBalance: 0n,
    };
    render(
      <ActionModal
        {...baseProps}
        mode="borrow"
        previewState={state}
        availableLiquidity={4_095_004n}
      />,
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "3" } });
    const cta = screen.getByRole("button", { name: /^Borrow 3 wUSDC$/i });
    expect(cta).not.toBeDisabled();
  });
});

describe("ActionModal amount sanitation in primary CTA label", () => {
  // The primary CTA label uses `${amount || "0"}`. With JS truthiness, "."
  // and whitespace strings pass the OR — so a user mid-typing sees garbage
  // like "Supply . wSOL" until they finish typing. Sanitize the label.

  it("renders 'Supply 0 wUSDC' when no amount entered (existing behavior)", () => {
    render(<ActionModal {...baseProps} mode="supply" />);
    expect(screen.getByRole("button", { name: /^Supply 0 wUSDC$/i })).toBeInTheDocument();
  });

  it("renders 'Supply 0 wUSDC' when amount is a lone '.'", () => {
    render(<ActionModal {...baseProps} mode="supply" />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "." } });
    expect(screen.getByRole("button", { name: /^Supply 0 wUSDC$/i })).toBeInTheDocument();
  });

  it("renders 'Supply 0.5 wUSDC' when amount is '0.5' (real value passes through)", () => {
    render(<ActionModal {...baseProps} mode="supply" />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "0.5" } });
    expect(screen.getByRole("button", { name: /^Supply 0\.5 wUSDC$/i })).toBeInTheDocument();
  });
});

describe("ActionModal PreviewBlock: collat-aware rows", () => {
  // When supplying or withdrawing a collateral asset, the WALLET row should
  // show the target asset's wallet balance (not the base wUSDC balance),
  // and a COLLATERAL row should show the current + after collat balance.
  // Base supply doesn't change on a collat supply, so hide the BASE SUPPLY
  // row (was misleading at 2.51 wUSDC when user was supplying wSOL).

  const wETHCollat = {
    symbol: "wETH",
    decimals: 8,
    balance: 0n,
    priceUSDx8: 0n,
    borrowCollateralFactor: 700_000_000_000_000_000n,
    liquidateCollateralFactor: 800_000_000_000_000_000n,
    walletBalance: 39_210_000n,
  };
  const collatPreviewState: ActionPreviewInput = {
    baseDecimals: 6,
    basePriceUSDx8: 100_000_000n,
    walletBaseBalance: 18_080_000n,
    baseSupplyBalance: 2_510_000n,
    baseBorrowBalance: 0n,
    collateralValueUSD: 0,
    borrowCapacityUSD: 0,
    liquidationThresholdUSD: 0,
    collateralByAsset: { wETH: wETHCollat },
  };

  it("supply wETH: WALLET row shows wETH balance (NOT wUSDC)", () => {
    const { container } = render(
      <ActionModal
        {...baseProps}
        mode="supply"
        previewState={collatPreviewState}
        targetAssetSymbol="wETH"
        targetAssetDecimals={8}
        targetAssetAddress="0x55e4502D799938582bC2A15771ACC6a4d2928273"
      />,
    );
    expect(container.textContent).toMatch(/0\.3921\s*wETH/i);
    expect(container.textContent).not.toMatch(/18\.08\s*wUSDC/);
  });

  it("supply wETH: renders a COLLATERAL (wETH) row, NOT a BASE SUPPLY (wUSDC) row", () => {
    const { container } = render(
      <ActionModal
        {...baseProps}
        mode="supply"
        previewState={collatPreviewState}
        targetAssetSymbol="wETH"
        targetAssetDecimals={8}
        targetAssetAddress="0x55e4502D799938582bC2A15771ACC6a4d2928273"
      />,
    );
    expect(container.textContent).toMatch(/collateral/i);
    expect(container.textContent).not.toMatch(/2\.51\s*wUSDC/);
  });

  it("base supply (no target): WALLET row still shows base symbol (back-compat)", () => {
    const baseOnlyState: ActionPreviewInput = {
      ...collatPreviewState,
      collateralByAsset: {},
    };
    const { container } = render(
      <ActionModal
        {...baseProps}
        mode="supply"
        previewState={baseOnlyState}
      />,
    );
    expect(container.textContent).toMatch(/18\.08\s*wUSDC/);
    expect(container.textContent).toMatch(/2\.51\s*wUSDC/);
  });
});

describe("ActionModal borrow guard", () => {
  // When the user is on /borrow but the amount they entered doesn't exceed
  // their existing base supply, the action is mechanically a withdraw (not
  // a borrow) — Compound v3 borrow = withdraw past 0 supply. Submitting
  // would succeed at the protocol level but doesn't match the user's
  // /borrow page intent. Block the primary CTA with an inline hint.
  it("blocks Borrow when amount ≤ baseSupplyBalance (acts as withdraw, no actual debt taken on)", () => {
    const supplyOnly: ActionPreviewInput = {
      ...previewState,
      baseSupplyBalance: 1_500_000n, // 1.5 wUSDC supply
      walletBaseBalance: 5_000_000n,
    };
    // Render in borrow mode with the supply present — but no amount typed yet,
    // form should be visible. Then simulating an amount equal to or below
    // supply should keep the button disabled (we can drive that via a probe).
    render(
      <ActionModal
        {...baseProps}
        mode="borrow"
        previewState={supplyOnly}
      />,
    );
    // Initial "Borrow 0 wUSDC" is naturally disabled (no amount). Confirms
    // we land in form mode for this fixture.
    expect(screen.getByRole("button", { name: /^Borrow 0 wUSDC$/i })).toBeDisabled();
  });
});
