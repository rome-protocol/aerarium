import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "../route";

// Same-origin proxy for the Solana RPC. The browser submits the DoTxUnsigned to
// /api/solana-rpc (never the private RPC directly), and this route forwards the
// JSON-RPC body verbatim server-side to SOLANA_RPC. Mirrors /api/rome-rpc +
// /api/discovery — keeps the private endpoint out of the client entirely.
describe("POST /api/solana-rpc", () => {
  const ORIG_ENV = process.env;
  const ORIG_FETCH = global.fetch;
  beforeEach(() => {
    process.env = { ...ORIG_ENV };
  });
  afterEach(() => {
    process.env = ORIG_ENV;
    global.fetch = ORIG_FETCH;
    vi.restoreAllMocks();
  });

  it("forwards the JSON-RPC body verbatim to SOLANA_RPC and mirrors the upstream response", async () => {
    process.env.SOLANA_RPC = "https://private.rpc";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"jsonrpc":"2.0","result":"ok","id":1}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const reqBody = '{"jsonrpc":"2.0","method":"getLatestBlockhash","id":1}';
    const res = await POST(new Request("http://localhost/api/solana-rpc", { method: "POST", body: reqBody }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://private.rpc");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(reqBody);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ result: "ok" });
  });

  it("mirrors a non-200 upstream status", async () => {
    process.env.SOLANA_RPC = "https://private.rpc";
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response("upstream boom", { status: 502 })) as unknown as typeof fetch;

    const res = await POST(new Request("http://localhost/api/solana-rpc", { method: "POST", body: "{}" }));
    expect(res.status).toBe(502);
  });
});
