import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "../route";

// Same-origin proxy for the Solana RPC. The browser submits JSON-RPC to
// /api/solana-rpc (never an RPC URL directly) and this route forwards the
// body VERBATIM server-side — parsing is used only to classify the method.
//
// Method-aware tier failover:
//   point reads / tx submit: SOLANA_RPC → SOLANA_RPC_INDEXED_URL → public
//   scan-class (getTokenAccountsByOwner et al.):
//                            SOLANA_RPC_INDEXED_URL → public (NEVER SOLANA_RPC —
//     on the unindexed self-hosted node an owner scan is a full token-program
//     sweep that keeps running after client disconnect; the 2026-07-24 wedge).
// Failover on connect error / 429 / 5xx only; JSON-RPC application errors
// (200 + error body) are answers and are mirrored, not retried.
describe("POST /api/solana-rpc", () => {
  const ORIG_ENV = process.env;
  const ORIG_FETCH = global.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;
  const calledUrls = () => fetchMock.mock.calls.map((c) => c[0]);

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  const request = (body: string) =>
    new Request("http://localhost/api/solana-rpc", { method: "POST", body });

  const pointReadBody = '{"jsonrpc":"2.0","method":"getLatestBlockhash","id":1}';
  const scanBody = '{"jsonrpc":"2.0","method":"getTokenAccountsByOwner","params":["o"],"id":1}';

  beforeEach(() => {
    process.env = { ...ORIG_ENV };
    process.env.SOLANA_RPC = "https://private.rpc";
    process.env.SOLANA_RPC_INDEXED_URL = "https://indexed.rpc";
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    process.env = ORIG_ENV;
    global.fetch = ORIG_FETCH;
    vi.restoreAllMocks();
  });

  it("forwards point reads verbatim to SOLANA_RPC and mirrors the upstream response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ jsonrpc: "2.0", result: "ok", id: 1 }));

    const res = await POST(request(pointReadBody));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://private.rpc");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(pointReadBody);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ result: "ok" });
  });

  it("sends scan-class calls to the indexed tier — never SOLANA_RPC", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ jsonrpc: "2.0", id: 1, result: { value: [] } }));

    await POST(request(scanBody));

    expect(calledUrls()).toEqual(["https://indexed.rpc"]);
  });

  it("scan-class without an indexed endpoint goes straight to public — never SOLANA_RPC", async () => {
    delete process.env.SOLANA_RPC_INDEXED_URL;
    fetchMock.mockResolvedValue(jsonResponse({ jsonrpc: "2.0", id: 1, result: { value: [] } }));

    await POST(request(scanBody));

    expect(calledUrls()).toEqual(["https://api.devnet.solana.com"]);
  });

  it("fails over self-hosted → indexed → public on connect errors and 429/5xx", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce(jsonResponse({ error: "rate limited" }, 429))
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: "2.0", result: "ok", id: 1 }));

    const res = await POST(request(pointReadBody));

    expect(calledUrls()).toEqual([
      "https://private.rpc",
      "https://indexed.rpc",
      "https://api.devnet.solana.com",
    ]);
    expect(res.status).toBe(200);
  });

  it("does NOT fail over on a JSON-RPC application error (200 + error body)", async () => {
    const appError = { jsonrpc: "2.0", id: 1, error: { code: -32602, message: "bad param" } };
    fetchMock.mockResolvedValue(jsonResponse(appError, 200));

    const res = await POST(request(pointReadBody));

    expect(calledUrls()).toEqual(["https://private.rpc"]);
    expect(await res.json()).toEqual(appError);
  });

  it("mirrors non-failover upstream statuses (e.g. 400) without retrying", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "bad request" }, 400));

    const res = await POST(request(pointReadBody));

    expect(calledUrls()).toEqual(["https://private.rpc"]);
    expect(res.status).toBe(400);
  });

  it("degrades an unparseable body to the point-read chain and forwards it verbatim", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ jsonrpc: "2.0", id: 1, result: null }));

    await POST(request("not-json{{"));

    expect(calledUrls()).toEqual(["https://private.rpc"]);
    expect(fetchMock.mock.calls[0][1].body).toBe("not-json{{");
  });

  it("returns a generic 502 when every tier is unreachable (no internals leaked)", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED internal-host:8899"));

    const res = await POST(request(pointReadBody));

    expect(calledUrls()).toHaveLength(3);
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("internal-host");
  });
});
