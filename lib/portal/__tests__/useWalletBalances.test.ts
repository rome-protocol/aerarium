// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useWalletBalances } from "../hooks/useWalletBalances";
import type { CometMarket } from "../hooks/useCometMarket";

const mockMarket: CometMarket = {
  comet: "0xb8" as `0x${string}`,
  baseToken: "0xaa" as `0x${string}`,
  baseTokenPriceFeed: "0xbb" as `0x${string}`,
  numAssets: 2,
  assets: [
    {
      index: 0,
      asset: "0xcc" as `0x${string}`,
      priceFeed: "0xdd" as `0x${string}`,
      scale: 10n ** 8n,
      borrowCollateralFactor: 0n,
      liquidateCollateralFactor: 0n,
      liquidationFactor: 0n,
      supplyCap: 0n,
    },
    {
      index: 1,
      asset: "0xee" as `0x${string}`,
      priceFeed: "0xff" as `0x${string}`,
      scale: 10n ** 9n,
      borrowCollateralFactor: 0n,
      liquidateCollateralFactor: 0n,
      liquidationFactor: 0n,
      supplyCap: 0n,
    },
  ],
};

const mockReadContract = vi.fn(async ({ address }: any) => {
  if (address === "0xaa") return 1_000_000n;  // base
  if (address === "0xcc") return 2_000_000n;  // collat 0
  if (address === "0xee") return 3_000_000n;  // collat 1
  return 0n;
});

// Stable publicClient ref across renders — otherwise the useCallback in
// useWalletBalances treats publicClient as a fresh dep every render, recreates
// `load`, and the useEffect with [load] dep loops until React's max-depth guard
// trips. Mirrors how real wagmi returns a memoized client per chainId.
const mockPublicClient = { readContract: mockReadContract };
vi.mock("wagmi", () => ({
  usePublicClient: () => mockPublicClient,
}));

describe("useWalletBalances", () => {
  it("returns null balances when account is undefined", () => {
    const { result } = renderHook(() => useWalletBalances(mockMarket, undefined, 200010));
    expect(result.current.balances).toBeNull();
  });

  it("returns balances keyed by lowercased asset address", async () => {
    const { result } = renderHook(() =>
      useWalletBalances(mockMarket, "0x6ba6" as `0x${string}`, 200010),
    );
    await waitFor(() => expect(result.current.balances).not.toBeNull());
    expect(result.current.balances!["0xaa"]).toBe(1_000_000n);
    expect(result.current.balances!["0xcc"]).toBe(2_000_000n);
    expect(result.current.balances!["0xee"]).toBe(3_000_000n);
  });

  it("returns null balances when market is null", () => {
    const { result } = renderHook(() =>
      useWalletBalances(null, "0x6ba6" as `0x${string}`, 200010),
    );
    expect(result.current.balances).toBeNull();
  });

  it("exposes loading and error fields plus refresh callback", async () => {
    const { result } = renderHook(() =>
      useWalletBalances(mockMarket, "0x6ba6" as `0x${string}`, 200010),
    );
    expect(result.current).toHaveProperty("loading");
    expect(result.current).toHaveProperty("error");
    expect(result.current).toHaveProperty("refresh");
    expect(typeof result.current.refresh).toBe("function");
  });

  it("sets error when readContract rejects", async () => {
    mockReadContract.mockRejectedValueOnce(new Error("rpc down"));
    const { result } = renderHook(() =>
      useWalletBalances(mockMarket, "0x6ba6" as `0x${string}`, 200010),
    );
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toMatch("rpc down");
  });
});
