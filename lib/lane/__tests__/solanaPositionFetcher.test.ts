import { describe, it, expect, vi, beforeEach } from "vitest";
import { PublicKey } from "@solana/web3.js";

vi.mock("../solanaReads", () => ({ readSolanaPosition: vi.fn() }));
vi.mock("../mapSolanaPosition", () => ({ buildSolanaReadsAndStats: vi.fn() }));
vi.mock("@/lib/solana/syntheticTransientFlows", () => ({
  readWalletSplBalances: vi.fn(),
  buildFundLeg: vi.fn(),
  buildSweepLeg: vi.fn(),
}));

import { readSolanaPosition } from "../solanaReads";
import { buildSolanaReadsAndStats } from "../mapSolanaPosition";
import { readWalletSplBalances } from "@/lib/solana/syntheticTransientFlows";
import { fetchSolanaPosition } from "../solanaPositionFetcher";

const MINT = "So11111111111111111111111111111111111111112"; // valid base58
const WALLET = new PublicKey("11111111111111111111111111111111");
const meta = (mint: string | null) => ({ mint, symbol: "wSOL" }) as never;

function stubStats() {
  vi.mocked(buildSolanaReadsAndStats).mockReturnValue({
    reads: [], borrowCapacityUSD: 100, healthFactor: 2, limits: undefined,
  } as never);
}

describe("fetchSolanaPosition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubStats();
  });

  const baseArgs = () => ({
    evmClient: {} as never,
    comet: "0xComet" as `0x${string}`,
    synthetic: "0xSynth" as `0x${string}`,
    assetMetas: [meta(MINT)],
    connection: {} as never,
    publicKey: WALLET,
    basePriceUSDx8: 100_000_000n,
  });

  it("overrides synthetic walletRaw with the live wallet SPL balance (walletUnknown=false)", async () => {
    vi.mocked(readSolanaPosition).mockResolvedValue({ resolved: [{ walletRaw: 0n }], market: {} } as never);
    vi.mocked(readWalletSplBalances).mockResolvedValue([5n] as never);

    const res = await fetchSolanaPosition(baseArgs());

    expect(res.walletUnknown).toBe(false);
    expect(readWalletSplBalances).toHaveBeenCalledTimes(1);
    // the resolved row handed to the stats builder has the wallet balance, not 0
    const resolvedArg = vi.mocked(buildSolanaReadsAndStats).mock.calls[0][0] as Array<{ walletRaw: bigint }>;
    expect(resolvedArg[0].walletRaw).toBe(5n);
    // resolved is returned (the lane rebuilds the activity lookup from it)
    expect((res.resolved as Array<{ walletRaw: bigint }>)[0].walletRaw).toBe(5n);
  });

  it("surfaces walletUnknown=true on a wallet-read FAILURE (no silent synthetic-0 fallback)", async () => {
    vi.mocked(readSolanaPosition).mockResolvedValue({ resolved: [{ walletRaw: 0n }], market: {} } as never);
    vi.mocked(readWalletSplBalances).mockRejectedValue(new Error("rpc down"));

    const res = await fetchSolanaPosition(baseArgs());

    expect(res.walletUnknown).toBe(true);
    // stats still built (synthetic position/capacity/health stand on their own)
    expect(buildSolanaReadsAndStats).toHaveBeenCalledTimes(1);
  });

  it("does not attempt a wallet read when disconnected (publicKey null) → walletUnknown=false", async () => {
    vi.mocked(readSolanaPosition).mockResolvedValue({ resolved: [{ walletRaw: 0n }], market: {} } as never);
    const res = await fetchSolanaPosition({ ...baseArgs(), publicKey: null });
    expect(readWalletSplBalances).not.toHaveBeenCalled();
    expect(res.walletUnknown).toBe(false);
  });

  it("skips the wallet read when any asset meta lacks a mint → walletUnknown=false", async () => {
    vi.mocked(readSolanaPosition).mockResolvedValue({ resolved: [{ walletRaw: 0n }], market: {} } as never);
    const res = await fetchSolanaPosition({ ...baseArgs(), assetMetas: [meta(null)] });
    expect(readWalletSplBalances).not.toHaveBeenCalled();
    expect(res.walletUnknown).toBe(false);
  });
});
