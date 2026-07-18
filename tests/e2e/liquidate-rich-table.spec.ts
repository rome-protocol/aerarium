// Rich-liquidate-table render check + layout-order check (tasks #130, reorder).
//
// Asserts the shared LiquidateView's shape renders under each lane's chrome and
// in the RESTORED order: hero → filter row + table (PRIMARY, on top) → manual
// "Or absorb a specific address" entry (SECONDARY, below). The filter + table
// structure is ALWAYS on top — the table headers (Borrower | Collateral | Debt
// | Bonus) and the HF-threshold filter are present even when the live comet has
// no liquidatable accounts (then an in-table empty row carries the "No accounts
// below HF…" copy; the per-account enrichment math is covered by vitest units).
//
// This spec is render-only — it does NOT submit a tx, so it runs without
// HADRIAN_E2E_SKIP gating.

import { test, expect } from "@playwright/test";

test.describe("Liquidate rich table — render shape + restored order", () => {
  test("EVM lane: hero → filter+table (top) → manual entry (below)", async ({ page }) => {
    await page.goto("/evm/liquidate");

    // Hero — confirms the shared LiquidateView mounted under the EVM lane chrome
    // (mock-wallet auto-connected; if it hadn't, the ConnectCard would show and
    // this heading would be absent).
    const hero = page.getByRole("heading", { name: /liquidation/i });
    await expect(hero).toBeVisible({ timeout: 60_000 });

    // PRIMARY block: the filter row (HF threshold select) + the table headers are
    // ALWAYS rendered, regardless of whether any account is liquidatable.
    const hfFilter = page.getByLabel(/HF threshold/i);
    const borrowerHeader = page.getByRole("columnheader", { name: /Borrower/i });
    await expect(hfFilter).toBeVisible({ timeout: 30_000 });
    await expect(borrowerHeader).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /Collateral/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /^Debt$/ })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /Bonus/i })).toBeVisible();

    // SECONDARY block: the manual-address entry, under its "Or absorb a specific
    // address" heading, with the borrower input + Check button.
    const manualHeading = page.getByText(/Or absorb a specific address/i);
    await expect(manualHeading).toBeVisible();
    await expect(page.getByLabel(/Borrower address/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Check$/ })).toBeVisible();

    // ORDER: hero ABOVE the filter, filter ABOVE the table headers, table headers
    // ABOVE the manual entry (top-to-bottom y-coordinate ordering of the boxes).
    const heroBox = await hero.boundingBox();
    const filterBox = await hfFilter.boundingBox();
    const headerBox = await borrowerHeader.boundingBox();
    const manualBox = await manualHeading.boundingBox();
    expect(heroBox).not.toBeNull();
    expect(filterBox).not.toBeNull();
    expect(headerBox).not.toBeNull();
    expect(manualBox).not.toBeNull();
    // hero < filter < table-headers < manual entry
    expect(heroBox!.y).toBeLessThan(filterBox!.y);
    expect(filterBox!.y).toBeLessThan(headerBox!.y);
    expect(headerBox!.y).toBeLessThan(manualBox!.y);
  });

  test("Solana lane: route renders under its lane chrome", async ({ page }) => {
    // The Solana lane uses Phantom (wallet-adapter), which the mock-wallet EVM
    // connector doesn't drive — so it renders the ConnectCard, not LiquidateView.
    // We assert the route loads + shows the lane shell (no 500/crash). The
    // shared LiquidateView + restored order is identical to the EVM lane (same
    // component), proven by the EVM render above + the page-level vitest
    // (app/evm/liquidate/__tests__/page.test.tsx).
    const resp = await page.goto("/solana/liquidate");
    expect(resp?.status()).toBeLessThan(400);
    await expect(page.locator("body")).toBeVisible();
  });
});
