// @vitest-environment jsdom
//
// Solana-lane parity for the un-gate: the liquidatable list is public
// read-only data (scan + enrich run over the lane's wallet-independent
// evmClient), so /solana/liquidate must render the rich table even with NO
// Phantom connected — the SolanaLaneShell must NOT replace the body with the
// ConnectCard here. Only the Absorb action gates to connect.
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import SolanaLiquidatePage from "../page";

const ACC_1 = "0x1111111111111111111111111111111111111111";

// DISCONNECTED Phantom — evmClient (reads) is still available; synthetic is null.
vi.mock("@/lib/lane/useSolanaActions", () => ({
  useSolanaActions: () => ({
    synthetic: null,
    connected: false,
    publicKey: null,
    cfg: { comet: "0x771D2f0000000000000000000000000000000000", chainId: 200010, programId: "Rome1111111111111111111111111111111111111111" },
    evmClient: { readContract: vi.fn(async () => false) },
    submitCall: vi.fn(),
    submitOverAlt: vi.fn(),
    discover: vi.fn(),
  }),
}));
vi.mock("@/lib/lane/useSolanaConnect", () => ({
  useSolanaConnect: () => ({ connect: vi.fn(), disconnect: vi.fn() }),
}));
// SolanaLaneShell reads useWallet — report a disconnected wallet.
vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({ publicKey: null, connected: false, connecting: false, wallet: null }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/solana/liquidate" }));
vi.mock("@/lib/solana/cometCalldata", () => ({ encodeAbsorb: vi.fn(() => "0x") }));

vi.mock("@/lib/portal/fetchUnhealthyAccounts", () => ({
  fetchUnhealthyAccounts: vi.fn(async () => ["0x1111111111111111111111111111111111111111"]),
}));
vi.mock("@/lib/portal/enrichLiquidatable", () => ({
  enrichLiquidatableList: vi.fn(async () => [
    { address: "0x1111111111111111111111111111111111111111", debtUsd: 1200.5, collateralUsd: 1500, bonusPct: 8, healthFactor: 0.88 },
  ]),
  enrichLiquidatable: vi.fn(async () => null),
}));

describe("Solana LiquidatePage — read-only list while DISCONNECTED (un-gate)", () => {
  it("renders the liquidatable table (not the ConnectCard) with no Phantom connected", async () => {
    render(<SolanaLiquidatePage />);
    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: /Borrower/i })).toBeInTheDocument();
    });
    expect(screen.getByText(new RegExp(`${ACC_1.slice(0, 6)}`, "i"))).toBeInTheDocument();
  });

  it("gates the absorb action behind connect when disconnected", async () => {
    render(<SolanaLiquidatePage />);
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /connect to absorb/i }).length).toBeGreaterThan(0);
    });
  });
});
