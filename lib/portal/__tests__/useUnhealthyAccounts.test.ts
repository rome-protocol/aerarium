// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useUnhealthyAccounts } from "../hooks/useUnhealthyAccounts";

const ACC_1 = "0x1111111111111111111111111111111111111111" as `0x${string}`;
const ACC_2 = "0x2222222222222222222222222222222222222222" as `0x${string}`;
const ACC_3 = "0x3333333333333333333333333333333333333333" as `0x${string}`;
const COMET = "0xb8" as `0x${string}`;

const mockReadContract = vi.fn(async ({ functionName, args }: any) => {
  if (functionName !== "isLiquidatable") return false;
  const account = (args as [string])[0];
  // ACC_1 + ACC_3 are liquidatable; ACC_2 is healthy
  return account === ACC_1 || account === ACC_3;
});

const mockGetLogs = vi.fn(async () => [
  { args: { src: ACC_1 } },
  { args: { src: ACC_2 } },
  { args: { src: ACC_3 } },
  { args: { src: ACC_1 } }, // duplicate — should dedup
]);

const mockGetBlockNumber = vi.fn(async () => 100_000n);

vi.mock("wagmi", () => ({
  usePublicClient: () => ({
    readContract: mockReadContract,
    getLogs: mockGetLogs,
    getBlockNumber: mockGetBlockNumber,
  }),
}));

describe("useUnhealthyAccounts", () => {
  it("returns null when comet is undefined", () => {
    const { result } = renderHook(() => useUnhealthyAccounts(undefined, 200010));
    expect(result.current.accounts).toBeNull();
  });

  it("returns deduplicated unhealthy accounts after polling", async () => {
    const { result } = renderHook(() => useUnhealthyAccounts(COMET, 200010));
    await waitFor(() => expect(result.current.accounts).not.toBeNull());
    // Out of 3 unique candidates (ACC_1, ACC_2, ACC_3), 2 are liquidatable.
    expect(result.current.accounts).toHaveLength(2);
    expect(result.current.accounts).toContain(ACC_1);
    expect(result.current.accounts).toContain(ACC_3);
    expect(result.current.accounts).not.toContain(ACC_2);
  });

  it("exposes loading and error fields plus refresh", () => {
    const { result } = renderHook(() => useUnhealthyAccounts(COMET, 200010));
    expect(result.current).toHaveProperty("loading");
    expect(result.current).toHaveProperty("error");
    expect(typeof result.current.refresh).toBe("function");
  });
});
