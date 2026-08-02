import { describe, it, expect } from "vitest";
import serverMap from "../generated.solana-rpc.json";

// The server-only Solana RPC map (generated.solana-rpc.json, read only by the
// /api/solana-rpc route) must NOT ship a Rome-hosted host in a PUBLIC repo. It
// must carry a PUBLIC default; production injects the real upstream via deploy
// env (SOLANA_RPC / SOLANA_RPC_INDEXED_URL). This guards against a registry
// regeneration re-introducing the internal host.
const INTERNAL = /devnet-eu-sol-api|node1\.|romeprotocol\.xyz/;

describe("generated.solana-rpc.json (server-only map)", () => {
  it("carries no internal Rome-hosted Solana RPC host", () => {
    const urls = Object.values(serverMap as Record<string, string>);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url).not.toMatch(INTERNAL);
  });
});
