import { describe, it, expect, vi } from "vitest";
import { createIndexerClient } from "../client";

// Fake fetch typed like client.test.ts so the structural Response satisfies the
// client's MinimalResponse surface.
type FakeFetch = (url: string | URL) => Promise<Response>;
const BASE = "https://via.example/api/v1";
const COMET = "0x771D2f213b4C23f70Fa884d441a405F41F51Ab50";

// The cache path (getCachedActivity/getCachedLiquidatable) must distinguish an
// unreachable indexer from a genuinely empty one: a transient failure must
// THROW so unstable_cache caches nothing (the degrade-wrap then shows preview),
// rather than caching an error-[] as "no activity" for the whole revalidate
// window. strict mode opts into that; default mode keeps the best-effort swallow
// the landing/liveSource degrade depends on.
describe("createIndexerClient — strict mode (cache path)", () => {
  it("strict: listCometTxs throws on a thrown fetch", async () => {
    const c = createIndexerClient(BASE, vi.fn<FakeFetch>(async () => { throw new Error("down"); }), { strict: true });
    await expect(c.listCometTxs(COMET, { max: 1 })).rejects.toThrow();
  });

  it("strict: listCometTxs throws on a non-ok response", async () => {
    const c = createIndexerClient(BASE, vi.fn<FakeFetch>(async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response), { strict: true });
    await expect(c.listCometTxs(COMET, { max: 1 })).rejects.toThrow();
  });

  it("strict: txLogs throws on a thrown fetch", async () => {
    const c = createIndexerClient(BASE, vi.fn<FakeFetch>(async () => { throw new Error("down"); }), { strict: true });
    await expect(c.txLogs("0xhh")).rejects.toThrow();
  });

  it("default (non-strict) still swallows to [] (preserves the degrade path)", async () => {
    const c = createIndexerClient(BASE, vi.fn<FakeFetch>(async () => { throw new Error("down"); }));
    await expect(c.listCometTxs(COMET, { max: 1 })).resolves.toEqual([]);
    await expect(c.txLogs("0xhh")).resolves.toEqual([]);
  });
});
