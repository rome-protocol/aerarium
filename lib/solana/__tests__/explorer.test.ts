import { describe, it, expect } from "vitest";
import { solanaExplorerTx } from "../explorer";

describe("solanaExplorerTx", () => {
  it("builds a cluster-correct Solana Explorer tx URL", () => {
    expect(solanaExplorerTx("SIG", "devnet")).toBe(
      "https://explorer.solana.com/tx/SIG?cluster=devnet",
    );
    expect(solanaExplorerTx("SIG", "mainnet-beta")).toBe(
      "https://explorer.solana.com/tx/SIG?cluster=mainnet-beta",
    );
  });

  it("omits the cluster query for mainnet-beta? no — keeps it explicit for testnet", () => {
    expect(solanaExplorerTx("S", "testnet")).toContain("?cluster=testnet");
  });
});
