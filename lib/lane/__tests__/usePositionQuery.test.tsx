// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePositionQuery } from "../usePositionQuery";

// Fresh client per wrapper; a shared wrapper across two renderHook calls exercises
// the cache key (dedup within a key / isolation across keys).
function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const base = { lane: "evm" as const, identity: "0xabc", chainId: 200010, programId: "Prog1" };

describe("usePositionQuery — gated per-user T0 query", () => {
  it("fetches once when enabled (connected && chainResolved && identity present)", async () => {
    const fetcher = vi.fn(async () => ({ ok: 1 }));
    const { result } = renderHook(() => usePositionQuery({ ...base, enabled: true, fetcher }), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does NOT fetch while unresolved (enabled=false → the chainResolved gate)", () => {
    const fetcher = vi.fn(async () => ({ ok: 1 }));
    renderHook(() => usePositionQuery({ ...base, enabled: false, fetcher }), { wrapper: makeWrapper() });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does NOT fetch without an identity (disconnected) even if enabled", () => {
    const fetcher = vi.fn(async () => ({ ok: 1 }));
    renderHook(() => usePositionQuery({ ...base, identity: undefined, enabled: true, fetcher }), { wrapper: makeWrapper() });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keys by lane+identity so the two lanes never share a cache entry", async () => {
    const evmFetch = vi.fn(async () => ({ v: "evm" }));
    const solFetch = vi.fn(async () => ({ v: "sol" }));
    const wrapper = makeWrapper();
    const evm = renderHook(() => usePositionQuery({ ...base, lane: "evm", enabled: true, fetcher: evmFetch }), { wrapper });
    const sol = renderHook(() => usePositionQuery({ ...base, lane: "sol", enabled: true, fetcher: solFetch }), { wrapper });
    await waitFor(() => expect(evm.result.current.data).toBeTruthy());
    await waitFor(() => expect(sol.result.current.data).toBeTruthy());
    expect(evmFetch).toHaveBeenCalledTimes(1);
    expect(solFetch).toHaveBeenCalledTimes(1);
    expect(evm.result.current.data).toEqual({ v: "evm" });
    expect(sol.result.current.data).toEqual({ v: "sol" });
  });

  it("surfaces an error without infinite-loading (isError true, not perpetually pending)", async () => {
    const fetcher = vi.fn(async () => { throw new Error("rpc down"); });
    const { result } = renderHook(() => usePositionQuery({ ...base, enabled: true, fetcher }), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isPending && result.current.fetchStatus === "fetching").toBe(false);
  });
});
