import { describe, it, expect, vi } from "vitest";
import { createIndexerClient } from "../client";

const COMET = "0x771D2f213b4C23f70Fa884d441a405F41F51Ab50";
const BASE = "https://via.example/api/v1";

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}
// Fake fetch typed to accept the URL arg so `.mock.calls[i][0]` is well-typed.
type FakeFetch = (url: string | URL) => Promise<Response>;

describe("createIndexerClient", () => {
  it("listCometTxs hits /addresses/<comet>/txs and maps items", async () => {
    const fetchImpl = vi.fn<FakeFetch>(async () =>
      jsonResponse({
        items: [
          { hash: "0xaa", method: "supply(address,uint256)", from: "0xUser1", to: COMET, origination: "ecdsa", timestamp: "t1", solanaLegs: [] },
          { hash: "0xbb", method: "withdraw(address,uint256)", from: "0xUser2", to: COMET, origination: "solana", timestamp: "t2", solanaLegs: [{ solChain: "devnet", solSignature: "sig" }] },
        ],
        nextCursor: null,
        hasMore: false,
      }),
    );
    const client = createIndexerClient(BASE, fetchImpl);
    const txs = await client.listCometTxs(COMET);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toContain(`/addresses/${COMET}/txs`);
    expect(txs).toHaveLength(2);
    expect(txs[0]).toMatchObject({ hash: "0xaa", method: "supply(address,uint256)", from: "0xUser1", origination: "ecdsa" });
    expect(txs[1].origination).toBe("solana");
  });

  it("follows nextCursor while hasMore, concatenating pages (capped by max)", async () => {
    const fetchImpl = vi.fn<FakeFetch>()
      .mockResolvedValueOnce(jsonResponse({ items: [{ hash: "0x1", from: "0xA", to: COMET, origination: "ecdsa", method: "supply", timestamp: "t" }], nextCursor: "c2", hasMore: true }))
      .mockResolvedValueOnce(jsonResponse({ items: [{ hash: "0x2", from: "0xB", to: COMET, origination: "solana", method: "supply", timestamp: "t" }], nextCursor: null, hasMore: false }));
    const client = createIndexerClient(BASE, fetchImpl);
    const txs = await client.listCometTxs(COMET, { limit: 1 });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[1][0])).toContain("cursor=c2");
    expect(txs.map((t) => t.hash)).toEqual(["0x1", "0x2"]);
  });

  it("stops paginating at max even if hasMore stays true", async () => {
    const fetchImpl = vi.fn<FakeFetch>(async () => jsonResponse({ items: [{ hash: "0x", from: "0xA", to: COMET, origination: "ecdsa", method: "supply", timestamp: "t" }], nextCursor: "more", hasMore: true }));
    const client = createIndexerClient(BASE, fetchImpl);
    const txs = await client.listCometTxs(COMET, { limit: 1, max: 3 });
    expect(txs.length).toBeLessThanOrEqual(3);
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("txLogs hits /txs/<hash> and returns logs (or [] when absent)", async () => {
    const logs = [{ address: "0xtok", topics: ["0xsig"], data: "0x01" }];
    const fetchImpl = vi.fn<FakeFetch>(async () => jsonResponse({ hash: "0xhh", logs }));
    const client = createIndexerClient(BASE, fetchImpl);
    const got = await client.txLogs("0xhh");
    expect(String(fetchImpl.mock.calls[0][0])).toContain("/txs/0xhh");
    expect(got).toEqual(logs);

    const client2 = createIndexerClient(BASE, vi.fn<FakeFetch>(async () => jsonResponse({ hash: "0xhh" })));
    expect(await client2.txLogs("0xhh")).toEqual([]);
  });

  it("returns [] from listCometTxs on a non-ok response (best-effort, never throws)", async () => {
    const fetchImpl = vi.fn<FakeFetch>(async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response);
    const client = createIndexerClient(BASE, fetchImpl);
    expect(await client.listCometTxs(COMET)).toEqual([]);
  });
});
