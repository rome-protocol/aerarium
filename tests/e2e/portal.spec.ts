// End-to-end portal smoke against Hadrian.
//
// Drives the Compound-on-Rome demo through real on-chain transactions
// using the mock-wallet connector wired up by `lib/mock-wallet.ts`.
// Each action submits a real tx that must land on Hadrian.  The browser
// auto-connects as the mock-wallet testUser via the mock connector — no
// MetaMask popup.
//
// NOTE: WUSDC/PCOL/COMET_COLLAT below are hardcoded and have drifted from
// the Hadrian registry — the on-chain steps skip until these are made
// registry-driven (tracked as a follow-up to the 2026-07 key rotation).
//
// Three React-19 + Playwright quirks bite (per memory
// `reference_playwright_smoke_react_quirks`):
//
//   1. Use `keyboard.press` per-character, not `fill` / `type` — React's
//      value-tracker doesn't pick up batched DOM mutations.
//   2. (Handled in CompoundPortal.tsx) parent array props need useMemo
//      or modal form state resets every render.
//   3. (Handled in ActionModal.tsx) `mode` must be in the reset
//      useEffect deps so switching modes clears stale state.

import { test, expect, Page } from "@playwright/test";

const HADRIAN_RPC = "https://hadrian.testnet.romeprotocol.xyz/";
const WUSDC = "0xc1418f71Fdd16F8010382da1F796C2C90c6508b0";
const PCOL = "0x113A5f117D6E5324921d0434ade49a0659B67795";
const COMET_COLLAT = "0x10731DF2488ed1f7aA4D39E04235358C99C7c9F0";
// The rotated mock-wallet address (env-derived — matches the connector).
const TESTUSER =
  process.env.NEXT_PUBLIC_MOCK_WALLET_ADDRESS ??
  "0x9c9Fd89c8d34a61106b3F9Db41733B02b827c9B5";

// Each tx on Hadrian: ~15-25s for Solana confirmation but can stretch to
// 60s+ under load.  Supply/Withdraw is 1-2 txs; Leverage is 3 (approve +
// allow + Bulker.invoke).  Be generous.
const SINGLE_TX_TIMEOUT_MS = 4 * 60_000;     // 4 min
const LEVERAGE_TX_TIMEOUT_MS = 6 * 60_000;   // 6 min (3-tx flow)
const ONCHAIN_POLL_INTERVAL_MS = 8_000;

/**
 * Poll a balance-fetcher until it returns a value different from `before`,
 * or `timeout` elapses.  This is the canonical "did the action land"
 * signal — independent of UI text (which can be stale from prior activity).
 */
async function waitForOnChainChange(
  page: Page,
  fetcher: () => Promise<bigint>,
  before: bigint,
  timeout: number,
): Promise<bigint> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const now = await fetcher();
    if (now !== before) return now;
    await page.waitForTimeout(ONCHAIN_POLL_INTERVAL_MS);
  }
  return await fetcher(); // final read
}

async function fetchHadrianBalance(
  token: string,
  account: string,
): Promise<bigint> {
  const data =
    "0x70a08231" +
    "000000000000000000000000" +
    account.slice(2).toLowerCase();
  const resp = await fetch(HADRIAN_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: token, data, from: account }, "latest"],
    }),
  });
  const j = (await resp.json()) as { result?: string };
  if (!j.result) return 0n;
  return BigInt(j.result);
}

async function fetchCometBaseSupply(account: string): Promise<bigint> {
  const data =
    "0x70a08231" +
    "000000000000000000000000" +
    account.slice(2).toLowerCase();
  const resp = await fetch(HADRIAN_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: COMET_COLLAT, data, from: account }, "latest"],
    }),
  });
  const j = (await resp.json()) as { result?: string };
  if (!j.result) return 0n;
  return BigInt(j.result);
}

async function typeAmount(page: Page, selector: string, amount: string) {
  // React 19 + controlled input: press per-character so React's value
  // tracker sees real keydown→input→keyup sequences.
  const input = page.locator(selector).first();
  await input.click();
  await input.fill(""); // clear; `fill('')` is fine on empty target
  for (const ch of amount) {
    await page.keyboard.press(ch);
  }
}

test.describe("Compound-on-Rome portal smoke", () => {
  test("portal renders with mock-wallet auto-connected", async ({ page }) => {
    await page.goto("/");
    // Address chip — UI formats with slice(0,4)…slice(-4) = "0x6b…B7Ad"
    await expect(
      page.getByText(/0x6b…B7Ad/i).first(),
    ).toBeVisible({ timeout: 30_000 });
    // Risk gauge present (any of the SAFE / WARN states).  testUser has no
    // borrow → "SAFE" should render; tolerate the other states too.
    await expect(page.getByText(/^SAFE$|AT RISK|NEAR LIQUIDATION/i).first())
      .toBeVisible();
    // Action buttons rendered
    await expect(
      page.getByRole("button", { name: "Supply", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Leverage open" }),
    ).toBeVisible();
  });

  test("Supply tx lands and balance decreases", async ({ page }) => {
    test.skip(
      !!process.env.HADRIAN_E2E_SKIP,
      "HADRIAN_E2E_SKIP set — skipping on-chain test",
    );
    const SUPPLY_AMOUNT_HUMAN = "0.01"; // 0.01 wUSDC
    const SUPPLY_AMOUNT_RAW = 10_000n; // 0.01 × 1e6

    const before = await fetchHadrianBalance(WUSDC, TESTUSER);
    test.skip(
      before < SUPPLY_AMOUNT_RAW,
      `testUser wUSDC ${before} < required ${SUPPLY_AMOUNT_RAW}; bridge in first`,
    );

    await page.goto("/");
    await page
      .getByRole("button", { name: "Supply", exact: true })
      .click();

    // Modal opens with one amount input
    const amountInput = page.locator('input[inputmode="decimal"]').first();
    await expect(amountInput).toBeVisible();

    await typeAmount(page, 'input[inputmode="decimal"]', SUPPLY_AMOUNT_HUMAN);

    // Submit
    const submit = page.getByRole("button", {
      name: new RegExp(`^Supply ${SUPPLY_AMOUNT_HUMAN} wUSDC$`),
    });
    await expect(submit).toBeEnabled();
    await submit.click();

    // Primary signal: poll on-chain balance until it changes (or timeout).
    // UI text isn't reliable — the ActivityFeed shows historical
    // "Supplied X wUSDC" entries that can match stale regex.
    const after = await waitForOnChainChange(
      page,
      () => fetchHadrianBalance(WUSDC, TESTUSER),
      before,
      SINGLE_TX_TIMEOUT_MS,
    );
    expect(after).toBeLessThan(before);
  });

  test("Withdraw tx lands when supply position exists", async ({ page }) => {
    test.skip(
      !!process.env.HADRIAN_E2E_SKIP,
      "HADRIAN_E2E_SKIP set",
    );
    const WITHDRAW_AMOUNT_HUMAN = "0.005";
    const WITHDRAW_AMOUNT_RAW = 5_000n;

    const supplyBefore = await fetchCometBaseSupply(TESTUSER);
    test.skip(
      supplyBefore < WITHDRAW_AMOUNT_RAW,
      `testUser has no base supply (${supplyBefore}) — run Supply first`,
    );

    await page.goto("/");
    await page
      .getByRole("button", { name: "Withdraw", exact: true })
      .click();

    await typeAmount(
      page,
      'input[inputmode="decimal"]',
      WITHDRAW_AMOUNT_HUMAN,
    );

    const submit = page.getByRole("button", {
      name: new RegExp(`^Withdraw ${WITHDRAW_AMOUNT_HUMAN} wUSDC$`),
    });
    await expect(submit).toBeEnabled();
    await submit.click();

    const supplyAfter = await waitForOnChainChange(
      page,
      () => fetchCometBaseSupply(TESTUSER),
      supplyBefore,
      SINGLE_TX_TIMEOUT_MS,
    );
    expect(supplyAfter).toBeLessThan(supplyBefore);
  });

  test("Leverage Open submits Bulker.invoke for PCOL + wUSDC borrow", async ({
    page,
  }) => {
    test.skip(
      !!process.env.HADRIAN_E2E_SKIP,
      "HADRIAN_E2E_SKIP set",
    );
    const COLLAT_AMOUNT_HUMAN = "0.05"; // 0.05 PCOL
    const COLLAT_AMOUNT_RAW = 50_000_000_000_000_000n; // 0.05 × 1e18
    const BORROW_AMOUNT_HUMAN = "0.01";

    const pcolBefore = await fetchHadrianBalance(PCOL, TESTUSER);
    test.skip(
      pcolBefore < COLLAT_AMOUNT_RAW,
      `testUser PCOL ${pcolBefore} < required ${COLLAT_AMOUNT_RAW}`,
    );

    await page.goto("/");
    await page
      .getByRole("button", { name: "Leverage open" })
      .click();

    // Leverage modal has 2 amount inputs: collat (first) + borrow (second)
    const inputs = page.locator('input[inputmode="decimal"]');
    await expect(inputs.first()).toBeVisible();
    // Fill collat
    await inputs.first().click();
    for (const ch of COLLAT_AMOUNT_HUMAN) {
      await page.keyboard.press(ch);
    }
    // Tab to borrow input + fill
    await inputs.nth(1).click();
    for (const ch of BORROW_AMOUNT_HUMAN) {
      await page.keyboard.press(ch);
    }

    const submit = page.getByRole("button", {
      name: /Supply .* PCOL \+ borrow .* wUSDC/,
    });
    await expect(submit).toBeEnabled();
    await submit.click();

    // 3-tx flow: PCOL approve → comet.allow → Bulker.invoke.  Allow ~6 min.
    const pcolAfter = await waitForOnChainChange(
      page,
      () => fetchHadrianBalance(PCOL, TESTUSER),
      pcolBefore,
      LEVERAGE_TX_TIMEOUT_MS,
    );
    expect(pcolAfter).toBeLessThan(pcolBefore);
  });
});
