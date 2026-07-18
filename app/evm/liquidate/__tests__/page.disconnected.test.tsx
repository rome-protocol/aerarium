// @vitest-environment jsdom
//
// The liquidate LIST is public read-only data (the scan + enrich only need an
// RPC client, no wallet). So /evm/liquidate must render the rich table even
// when NO wallet is connected — the shell must NOT replace the body with the
// ConnectCard here (requireConnection=false). Only the Absorb action gates to
// connect. This pins the un-gate so a regression re-hiding the list fails.
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import LiquidatePage from "../page";

const ACC_1 = "0x1111111111111111111111111111111111111111";

// DISCONNECTED wallet. usePublicClient still returns a working read client
// (it's wallet-independent) so the scan/enrich run; useWalletClient is empty.
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: undefined, status: "disconnected", connector: undefined }),
  useConnect: () => ({ connectors: [], connect: vi.fn(), status: "idle", variables: undefined }),
  useDisconnect: () => ({ disconnect: () => {} }),
  useWalletClient: () => ({ data: undefined }),
  usePublicClient: () => ({
    readContract: vi.fn(async () => false),
    waitForTransactionReceipt: vi.fn(),
    estimateContractGas: vi.fn(async () => 1_000_000n),
  }),
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/evm/liquidate" }));
vi.mock("@/lib/env-context", () => ({ useEnv: () => ({ defaultChainId: 200010, ready: true, error: null }) }));

vi.mock("@/lib/portal/fetchUnhealthyAccounts", () => ({
  fetchUnhealthyAccounts: vi.fn(async () => ["0x1111111111111111111111111111111111111111"]),
}));
vi.mock("@/lib/portal/enrichLiquidatable", () => ({
  enrichLiquidatableList: vi.fn(async () => [
    { address: "0x1111111111111111111111111111111111111111", debtUsd: 1200.5, collateralUsd: 1500, bonusPct: 8, healthFactor: 0.88 },
  ]),
  enrichLiquidatable: vi.fn(async () => null),
}));

describe("EVM LiquidatePage — read-only list while DISCONNECTED (un-gate)", () => {
  it("renders the liquidatable table (not the ConnectCard) with no wallet connected", async () => {
    render(<LiquidatePage />);
    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: /Borrower/i })).toBeInTheDocument();
    });
    // The discovered account is visible in the read-only list.
    expect(screen.getByText(new RegExp(`${ACC_1.slice(0, 6)}`, "i"))).toBeInTheDocument();
  });

  it("gates the absorb action behind connect when disconnected", async () => {
    render(<LiquidatePage />);
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /connect to absorb/i }).length).toBeGreaterThan(0);
    });
  });
});
