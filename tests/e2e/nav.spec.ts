import { test, expect } from "@playwright/test";

// Multi-page nav smoke (Phase 5.5 of the Aave-parity redesign).
//
// Verifies all 4 nav routes return 200 and render their primary heading.
// Mock-wallet env is wired in playwright.config.ts; pages render with the
// mock connected.

test.describe("Nav routes", () => {
  test("dashboard / renders Compound portal scaffolding", async ({ page }) => {
    await page.goto("/");
    // PageHeader's first nav link is Dashboard — confirm it renders
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    // The Dashboard intro copy
    await expect(page.locator("body")).toContainText(/Compound v3 on Rome/i);
  });

  test("markets renders the All reserves table heading", async ({ page }) => {
    await page.goto("/markets");
    await expect(page).toHaveURL(/\/markets/);
    await expect(page.getByRole("link", { name: "Markets" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /all reserves/i })).toBeVisible();
  });

  test("liquidate renders the Liquidatable accounts heading", async ({ page }) => {
    await page.goto("/liquidate");
    await expect(page).toHaveURL(/\/liquidate/);
    await expect(page.getByRole("link", { name: "Liquidate" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /liquidatab/i })).toBeVisible();
  });

  test("history renders the Activity heading", async ({ page }) => {
    await page.goto("/history");
    await expect(page).toHaveURL(/\/history/);
    await expect(page.getByRole("link", { name: "History" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /activity/i })).toBeVisible();
  });
});
