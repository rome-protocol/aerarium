import { describe, it, expect } from "vitest";
import { extractChainFields } from "../loader";

// contracts.json is an array of { name, versions[] }; the live version wins.
const contractsLive = [
  { name: "WrappedUSDC", versions: [{ address: "0xWUSDC", status: "live" }] },
  {
    name: "Multicall3",
    versions: [
      { address: "0xOLD", status: "retired" },
      { address: "0xLIVE", status: "live" },
    ],
  },
];

describe("extractChainFields", () => {
  // chain.json#solana.rpc is intentionally NOT extracted into the client config
  // — it's server-only (generated.solana-rpc.json). See no-solana-rpc-in-client-
  // config.test.ts + solanaRpc.test.ts for the server-side path.
  it("pulls program id, cluster, and the LIVE multicall3 (never solanaRpc)", () => {
    const chain = {
      romeEvmProgramId: "PROG",
      solana: { cluster: "devnet", rpc: "https://api.devnet.solana.com" },
    };
    const fields = extractChainFields(chain, contractsLive);
    expect(fields).toEqual({
      romeEvmProgramId: "PROG",
      solanaCluster: "devnet",
      multicall3: "0xLIVE",
    });
    expect(fields).not.toHaveProperty("solanaRpc");
  });

  it("tolerates a missing contracts.json (Aurelius has none)", () => {
    const chain = { romeEvmProgramId: "PROG", solana: { cluster: "testnet" } };
    expect(extractChainFields(chain, undefined)).toEqual({
      romeEvmProgramId: "PROG",
      solanaCluster: "testnet",
      multicall3: undefined,
    });
  });

  it("returns undefined program/cluster when chain.json omits them", () => {
    expect(extractChainFields({}, contractsLive)).toEqual({
      romeEvmProgramId: undefined,
      solanaCluster: undefined,
      multicall3: "0xLIVE",
    });
  });

  it("returns undefined multicall3 when no version is live", () => {
    const chain = { romeEvmProgramId: "P", solana: { cluster: "devnet" } };
    const retiredOnly = [{ name: "Multicall3", versions: [{ address: "0xX", status: "retired" }] }];
    expect(extractChainFields(chain, retiredOnly).multicall3).toBeUndefined();
  });
});
