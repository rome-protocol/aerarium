import { describe, it, expect, vi } from "vitest";
import { fetchUnhealthyAccounts, type UnhealthyScanClient } from "../fetchUnhealthyAccounts";

const ACC_1 = "0x1111111111111111111111111111111111111111" as `0x${string}`;
const ACC_2 = "0x2222222222222222222222222222222222222222" as `0x${string}`;
const ACC_3 = "0x3333333333333333333333333333333333333333" as `0x${string}`;
const COMET = "0x00000000000000000000000000000000000000b8" as `0x${string}`;

function makeClient(logs: Array<{ args: { from?: `0x${string}`; src?: `0x${string}` } }>): {
  client: UnhealthyScanClient;
  getLogs: ReturnType<typeof vi.fn>;
  readContract: ReturnType<typeof vi.fn>;
} {
  const getLogs = vi.fn(async () => logs);
  // ACC_1 + ACC_3 liquidatable; ACC_2 healthy.
  const readContract = vi.fn(async ({ functionName, args }: any) => {
    if (functionName !== "isLiquidatable") return false;
    const account = (args as [string])[0];
    return account === ACC_1 || account === ACC_3;
  });
  const getBlockNumber = vi.fn(async () => 100_000n);
  return { client: { getLogs, readContract, getBlockNumber }, getLogs, readContract };
}

describe("fetchUnhealthyAccounts — client-agnostic scan + probe", () => {
  it("dedupes candidate addresses and keeps only the liquidatable ones", async () => {
    const { client } = makeClient([
      { args: { from: ACC_1 } },
      { args: { from: ACC_2 } },
      { args: { from: ACC_3 } },
      { args: { from: ACC_1 } }, // duplicate — must dedupe
    ]);
    const result = await fetchUnhealthyAccounts(client, COMET);
    expect(result).toHaveLength(2);
    expect(result).toContain(ACC_1);
    expect(result).toContain(ACC_3);
    expect(result).not.toContain(ACC_2);
  });

  it("probes isLiquidatable once per UNIQUE candidate (dedupe before probe)", async () => {
    const { client, readContract } = makeClient([
      { args: { from: ACC_1 } },
      { args: { from: ACC_1 } },
      { args: { from: ACC_1 } },
      { args: { from: ACC_2 } },
    ]);
    await fetchUnhealthyAccounts(client, COMET);
    // 2 unique candidates → exactly 2 isLiquidatable probes.
    expect(readContract).toHaveBeenCalledTimes(2);
  });

  it("tolerates the `src` event-arg shape as well as `from`", async () => {
    const { client } = makeClient([{ args: { src: ACC_1 } }, { args: { src: ACC_2 } }]);
    const result = await fetchUnhealthyAccounts(client, COMET);
    expect(result).toEqual([ACC_1]);
  });

  it("returns an empty list when no candidates are liquidatable", async () => {
    const { client } = makeClient([{ args: { from: ACC_2 } }]);
    const result = await fetchUnhealthyAccounts(client, COMET);
    expect(result).toEqual([]);
  });

  it("scans back a bounded block window from the chain head", async () => {
    const { client, getLogs } = makeClient([{ args: { from: ACC_1 } }]);
    await fetchUnhealthyAccounts(client, COMET, { scanBlocks: 5_000n });
    // head = 100_000 (mock), window 5_000 → fromBlock 95_000.
    expect(getLogs).toHaveBeenCalledWith(
      expect.objectContaining({ address: COMET, fromBlock: 95_000n, toBlock: 100_000n }),
    );
  });

  it("defaults to a tiny ≤10-block window (incident bound — was 10K)", async () => {
    const { client, getLogs } = makeClient([{ args: { from: ACC_1 } }]);
    await fetchUnhealthyAccounts(client, COMET); // no scanBlocks opt → SCAN_BLOCKS default
    // head = 100_000 (mock), default window 10 → fromBlock 99_990 (NOT 90_000).
    expect(getLogs).toHaveBeenCalledWith(
      expect.objectContaining({ fromBlock: 99_990n, toBlock: 100_000n }),
    );
  });
});
