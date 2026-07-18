import { describe, it, expect, vi } from "vitest";

// The cache layer + config are mocked: this test exercises the route's
// composition + chain guard + bigint-safe serialization, not the real chain.
vi.mock("@/lib/market/cachedMarket", () => ({
  getCachedMarket: vi.fn().mockResolvedValue({ totalCollateral: 1, raw: { totalSupply: 99n } }),
  getCachedActivity: vi.fn().mockResolvedValue([]),
  getCachedLiquidatable: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/config", () => ({ configForChain: (id: number) => (id === 200010 ? {} : undefined) }));

import { GET } from "../[chainId]/route";
import { reviveBigints } from "@/lib/market/bigintJson";

describe("GET /api/market/[chainId]", () => {
  it("composes the cached fns for a known chain (200) and serializes bigints", async () => {
    const r = await GET(new Request("http://x"), { params: Promise.resolve({ chainId: "200010" }) });
    expect(r.status).toBe(200);
    const body = reviveBigints<{ state: { raw: { totalSupply: bigint } } }>(await r.text());
    expect(body.state.raw.totalSupply).toBe(99n); // survived the JSON boundary as a real bigint
  });

  it("400s an unknown chain", async () => {
    const r = await GET(new Request("http://x"), { params: Promise.resolve({ chainId: "999" }) });
    expect(r.status).toBe(400);
  });

  it("400s a non-numeric chainId", async () => {
    const r = await GET(new Request("http://x"), { params: Promise.resolve({ chainId: "abc" }) });
    expect(r.status).toBe(400);
  });
});
