import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag: (...a: unknown[]) => revalidateTag(...a) }));
vi.mock("@/lib/config", () => ({ configForChain: (id: number) => (id === 200010 ? {} : undefined) }));

import { POST } from "../route";

const SECRET = "topsecret-revalidate-key";
function post(headers: Record<string, string>, body: unknown) {
  return POST(new Request("http://x/api/revalidate", { method: "POST", headers, body: JSON.stringify(body) }));
}

describe("POST /api/revalidate (gated)", () => {
  beforeEach(() => {
    vi.stubEnv("REVALIDATE_SECRET", SECRET);
    revalidateTag.mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("401 without the secret header (and does not revalidate)", async () => {
    const r = await post({}, { chainId: 200010 });
    expect(r.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("401 with a wrong secret", async () => {
    const r = await post({ "x-revalidate-secret": "nope" }, { chainId: 200010 });
    expect(r.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("400 for a non-allowlisted chain (good secret) and does not revalidate", async () => {
    const r = await post({ "x-revalidate-secret": SECRET }, { chainId: 999 });
    expect(r.status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("200 + revalidateTag(market:<id>) for a good secret + allowlisted chain", async () => {
    const r = await post({ "x-revalidate-secret": SECRET }, { chainId: 200010 });
    expect(r.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith("market:200010");
  });
});
