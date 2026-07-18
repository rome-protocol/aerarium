import { describe, it, expect } from "vitest";
import generated from "../generated.json";

// #72 keeps the Solana RPC OUT of the client. The per-chain solana.rpc is a
// SERVER-ONLY projection (generated.solana-rpc.json, read only by the
// /api/solana-rpc route); it must never land in the client-bundled
// generated.json. This guards against re-introducing the leak (the #77 client
// projection that this refactor reverts).
describe("client generated.json", () => {
  it("carries no solanaRpc on any chain (server-only projection)", () => {
    const chains = Object.values(generated as Record<string, Record<string, unknown>>);
    expect(chains.length).toBeGreaterThan(0);
    for (const cfg of chains) {
      expect(cfg).not.toHaveProperty("solanaRpc");
    }
  });
});
