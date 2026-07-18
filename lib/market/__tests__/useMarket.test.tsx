// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMarket } from "../useMarket";
import { serializeBigints } from "../bigintJson";

// One QueryClient per wrapper instance so a single wrapper shared across two
// renderHook calls exercises cross-component dedup (same client + queryKey).
function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const payload = serializeBigints({ state: { raw: { totalSupply: 7n } }, activity: [], liquidatable: [] });

describe("useMarket", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn(async () => new Response(payload))));
  afterEach(() => vi.unstubAllGlobals());

  it("fetches /api/market/<chainId> and revives raw bigints", async () => {
    const { result } = renderHook(() => useMarket(200010), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data?.state.raw.totalSupply).toBe(7n);
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/market/200010");
  });

  it("dedups across components sharing one client (1 fetch for 2 consumers)", async () => {
    const wrapper = makeWrapper();
    const a = renderHook(() => useMarket(200010), { wrapper });
    const b = renderHook(() => useMarket(200010), { wrapper });
    await waitFor(() => expect(a.result.current.data).toBeTruthy());
    await waitFor(() => expect(b.result.current.data).toBeTruthy());
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("is disabled when chainId is null (no fetch)", () => {
    renderHook(() => useMarket(null), { wrapper: makeWrapper() });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
