// Playwright config for the compound-on-rome-demo portal e2e smoke.
//
// One spec: tests/e2e/portal.spec.ts. Boots `npm run dev` with mock-wallet
// env (NEXT_PUBLIC_MOCK_WALLET=1) on a free port, drives a real Hadrian
// transaction through each portal action (Supply / Withdraw / Leverage).
//
// To run locally:
//   npm run test:e2e
//
// To run in CI: see `.github/workflows/ci.yml`.  Skipped when
// HADRIAN_E2E_SKIP=1 is set (default in CI when Hadrian isn't reachable
// or when CI is running in a restricted environment).

import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

const PORT = process.env.E2E_PORT ?? "3001";
const BASE_URL = `http://localhost:${PORT}`;

// Mock-wallet identity for the headless smoke — a throwaway devnet test
// wallet. NEVER a committed literal: loaded from env (.env.local locally,
// the MOCK_WALLET_PRIVATE_KEY CI secret in Actions). Enforced by
// scripts/check-no-committed-secrets.ts.
loadEnvConfig(process.cwd());
const HADRIAN_TESTUSER_PK = process.env.NEXT_PUBLIC_MOCK_WALLET_PRIVATE_KEY;
const HADRIAN_TESTUSER_ADDR = process.env.NEXT_PUBLIC_MOCK_WALLET_ADDRESS;
if (!HADRIAN_TESTUSER_PK || !HADRIAN_TESTUSER_ADDR) {
  throw new Error(
    "e2e mock wallet not configured — set NEXT_PUBLIC_MOCK_WALLET_ADDRESS + " +
      "NEXT_PUBLIC_MOCK_WALLET_PRIVATE_KEY in .env.local (local run) or provide " +
      "the MOCK_WALLET_PRIVATE_KEY secret (CI). See .env.example.",
  );
}

export default defineConfig({
  testDir: "./tests/e2e",
  // Each portal action is a real on-chain tx; serial is mandatory.
  fullyParallel: false,
  workers: 1,
  // Hadrian tx confirmation can take 15-25s — be generous.
  timeout: 5 * 60 * 1000,
  expect: { timeout: 60 * 1000 },
  // No retries — failures are real; flaky retries hide bugs.
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT,
      NEXT_PUBLIC_MOCK_WALLET: "1",
      NEXT_PUBLIC_MOCK_WALLET_ADDRESS: HADRIAN_TESTUSER_ADDR,
      NEXT_PUBLIC_MOCK_WALLET_PRIVATE_KEY: HADRIAN_TESTUSER_PK,
    },
  },
});
