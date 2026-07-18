// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import LiquidatePage from "../page";

const CONNECTED = "0x9999999999999999999999999999999999999999" as `0x${string}`;
const ACC_1 = "0x1111111111111111111111111111111111111111" as `0x${string}`;
const ACC_2 = "0x2222222222222222222222222222222222222222" as `0x${string}`;

// Connected wallet so the page renders the shared LiquidateView (the absorb
// path needs a signer). EvmLaneShell also reads useAccount/useDisconnect.
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: CONNECTED, status: "connected", connector: { name: "MetaMask" } }),
  useConnect: () => ({ connectors: [], connect: () => {} }),
  useDisconnect: () => ({ disconnect: () => {} }),
  useWalletClient: () => ({ data: { writeContract: vi.fn() } }),
  usePublicClient: () => ({
    readContract: vi.fn(async () => false),
    waitForTransactionReceipt: vi.fn(),
    estimateContractGas: vi.fn(async () => 1_000_000n),
  }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/evm/liquidate",
}));

vi.mock("@/lib/env-context", () => ({
  useEnv: () => ({ defaultChainId: 200010, ready: true, error: null }),
}));

// The shared client-agnostic scan — stub it to return two liquidatable accounts.
vi.mock("@/lib/portal/fetchUnhealthyAccounts", () => ({
  fetchUnhealthyAccounts: vi.fn(async () => [ACC_1, ACC_2]),
}));

// Enrichment is exercised by lib/portal/__tests__/enrichLiquidatable.test.ts
// (pure math). Here we stub it so the page test asserts the TABLE wiring: the
// page builds LiquidatableInfo[] and the shared view renders real per-account
// cells (collateral / debt / bonus), not the old placeholder "—".
vi.mock("@/lib/portal/enrichLiquidatable", () => ({
  enrichLiquidatableList: vi.fn(async () => [
    { address: ACC_1, debtUsd: 1200.5, collateralUsd: 1500, bonusPct: 8, healthFactor: 0.88 },
    { address: ACC_2, debtUsd: 300, collateralUsd: 420, bonusPct: 5, healthFactor: 0.95 },
  ]),
  enrichLiquidatable: vi.fn(async () => null),
}));

describe("EVM LiquidatePage — shared LiquidateView rich table", () => {
  it("renders the 'Earn the liquidation bonus' hero", async () => {
    render(<LiquidatePage />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /liquidation/i })).toBeInTheDocument();
    });
  });

  it("renders the manual-address entry (borrower 0x… input)", async () => {
    render(<LiquidatePage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/Borrower address/i)).toBeInTheDocument();
    });
  });

  it("renders the rich table headers Borrower | Collateral | Debt | Bonus", async () => {
    render(<LiquidatePage />);
    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: /Borrower/i })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: /Collateral/i })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: /Debt/i })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: /Bonus/i })).toBeInTheDocument();
    });
  });

  it("renders one table row per enriched account with real USD + bonus values", async () => {
    render(<LiquidatePage />);
    await waitFor(() => {
      // Two enriched accounts → two body rows (plus the header row).
      const rows = screen.getAllByRole("row");
      // header + 2 data rows
      expect(rows.length).toBe(3);
    });
    // ACC_1 row shows its real debt/collateral/bonus (not placeholder "—").
    const acc1Cell = screen.getByText(/0x1111…1111/i);
    const row = acc1Cell.closest("tr")!;
    expect(within(row).getByText("$1,500.00")).toBeInTheDocument();
    expect(within(row).getByText("$1,200.50")).toBeInTheDocument();
    expect(within(row).getByText("8.00%")).toBeInTheDocument();
  });

  it("renders a real, ENABLED Absorb action (not the old disabled stub)", async () => {
    render(<LiquidatePage />);
    await waitFor(() => {
      const absorbButtons = screen.getAllByRole("button", { name: /absorb/i });
      expect(absorbButtons.length).toBeGreaterThan(0);
      for (const btn of absorbButtons) {
        expect(btn).not.toBeDisabled();
      }
    });
  });
});
