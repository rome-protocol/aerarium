import { describe, it, expect } from "vitest";
import { getCompoundConfig } from "../index";

// Every chain a live aerarium deployment points its runtime default at
// (ops testnet-aerarium-*/devnet-aerarium-* inventories) MUST resolve
// from the committed snapshot. A chain missing here is exactly the
// aerarium-martius incident: /api/env says chainId X, the bundle can't
// resolve X, wagmi never registers the chain, and every read silently
// no-ops behind an infinite "Loading your positions…" spinner.
describe("runtime-deployed chains exist in the committed snapshot", () => {
  it("resolves martius (121214) with its registry comet + base asset", () => {
    const c = getCompoundConfig(121214);
    expect(c).toBeDefined();
    expect(c!.chainSlug).toBe("martius");
    expect(c!.baseAsset.address).toBe("0x2fffdfa11a9cef9210dc34e975649f09119c4efb");
    // 8-collat Comet (registry #251, 2026-07-01) — replaced the 2-collat 0xf0E4b754…
    expect(c!.comets.multicollat?.address).toBe("0x2fD2C964342f2332b80D27d4eAbE0E0c4A22a43d");
  });
});
