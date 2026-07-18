import { describe, it, expect } from "vitest";
import { phase1Source } from "../phase1Source";

describe("phase1Source — poolSplit()", () => {
  it("returns the POOL-shape fields at the $48.2M scale", async () => {
    const p = await phase1Source.poolSplit();
    expect(typeof p.totalSupplied).toBe("number");
    expect(typeof p.totalBorrowed).toBe("number");
    expect(typeof p.netApr).toBe("number");
    expect(typeof p.supplyApr).toBe("number");
    expect(typeof p.borrowApr).toBe("number");
    expect(typeof p.suppliedEvm).toBe("number");
    expect(typeof p.suppliedSol).toBe("number");
    expect(typeof p.borrowedEvm).toBe("number");
    expect(typeof p.borrowedSol).toBe("number");
    expect(typeof p.suppliers).toBe("number");
    expect(typeof p.utilization).toBe("number");
    expect(p.illustrative).toBe(true);
  });

  it("matches the designer's exact mock values", async () => {
    const p = await phase1Source.poolSplit();
    expect(p.totalSupplied).toBe(48_215_400);
    expect(p.totalBorrowed).toBe(29_880_120);
    expect(p.netApr).toBe(3.94);
    expect(p.supplyApr).toBe(5.18);
    expect(p.borrowApr).toBe(7.62);
    expect(p.suppliedEvm).toBe(27_640_000);
    expect(p.suppliedSol).toBe(20_575_400);
    expect(p.borrowedEvm).toBe(14_120_000);
    expect(p.borrowedSol).toBe(15_760_120);
    expect(p.suppliers).toBe(4128);
    expect(p.utilization).toBe(62);
  });

  it("does NOT have the old fromEvmPct / fromSolanaPct fields", async () => {
    const p = await phase1Source.poolSplit() as unknown as Record<string, unknown>;
    expect(p["fromEvmPct"]).toBeUndefined();
    expect(p["fromSolanaPct"]).toBeUndefined();
  });
});

describe("phase1Source — arenaStats()", () => {
  it("has evm and sol sub-objects with the correct fields", async () => {
    const a = await phase1Source.arenaStats();
    for (const side of [a.evm, a.sol]) {
      expect(typeof side.liquidationsWon).toBe("number");
      expect(typeof side.valueSeized).toBe("number");
      expect(typeof side.biggestHit).toBe("number");
      expect(typeof side.positionsDefended).toBe("number");
      expect(typeof side.streak).toBe("number");
    }
    expect(a.illustrative).toBe(true);
  });

  it("matches the designer's exact Arena mock values", async () => {
    const a = await phase1Source.arenaStats();
    expect(a.evm.liquidationsWon).toBe(142);
    expect(a.evm.valueSeized).toBe(1_284_500);
    expect(a.evm.biggestHit).toBe(96_400);
    expect(a.evm.positionsDefended).toBe(311);
    expect(a.evm.streak).toBe(4);
    expect(a.sol.liquidationsWon).toBe(169);
    expect(a.sol.valueSeized).toBe(1_512_900);
    expect(a.sol.biggestHit).toBe(121_700);
    expect(a.sol.positionsDefended).toBe(287);
    expect(a.sol.streak).toBe(7);
  });

  it("does NOT use the old evmLiquidatedSolana / borrowersBySide shape", async () => {
    const a = await phase1Source.arenaStats() as unknown as Record<string, unknown>;
    expect(a["evmLiquidatedSolana"]).toBeUndefined();
    expect(a["solanaLiquidatedEvm"]).toBeUndefined();
    expect(a["borrowersBySide"]).toBeUndefined();
    expect(a["valueSeizedBySide"]).toBeUndefined();
    expect(a["biggestHit"]).toBeUndefined();
  });
});

describe("phase1Source — openLiquidations()", () => {
  it("returns all 5 rows matching the designer's LIQUIDATIONS", async () => {
    const rows = await phase1Source.openLiquidations();
    expect(rows).toHaveLength(5);
  });

  it("each row has id, side, borrower, collateral, collateralUsd, debt, health, reward, age, illustrative", async () => {
    const rows = await phase1Source.openLiquidations();
    for (const row of rows) {
      expect(typeof row.id).toBe("string");
      expect(["evm", "sol"]).toContain(row.side);
      expect(typeof row.borrower).toBe("string");
      expect(typeof row.collateral).toBe("string");
      expect(typeof row.collateralUsd).toBe("number");
      expect(typeof row.debt).toBe("string");
      expect(typeof row.health).toBe("number");
      expect(typeof row.reward).toBe("number");
      expect(typeof row.age).toBe("string");
      expect(row.illustrative).toBe(true);
    }
  });

  it("uses 'sol' not 'solana' for the Solana side", async () => {
    const rows = await phase1Source.openLiquidations();
    const sides = rows.map((r) => r.side);
    expect(sides).not.toContain("solana");
  });

  it("matches the designer's exact LIQUIDATIONS mock values", async () => {
    const rows = await phase1Source.openLiquidations();
    expect(rows[0]).toMatchObject({ id: "p1", side: "evm", borrower: "0x4F2a…9bC1", collateral: "wBTC", collateralUsd: 184_200, debt: "USDC", health: 0.97, reward: 9_210, age: "2m" });
    expect(rows[1]).toMatchObject({ id: "p2", side: "sol", borrower: "Gx7k…QvR2", collateral: "mSOL", collateralUsd: 92_640, debt: "USDC", health: 0.98, reward: 4_630, age: "6m" });
    expect(rows[2]).toMatchObject({ id: "p3", side: "evm", borrower: "0xB81e…44Aa", collateral: "wETH", collateralUsd: 61_900, debt: "USDT", health: 0.99, reward: 3_095, age: "11m" });
    expect(rows[3]).toMatchObject({ id: "p4", side: "sol", borrower: "H2mN…8kLp", collateral: "JitoSOL", collateralUsd: 47_300, debt: "USDC", health: 0.99, reward: 2_365, age: "18m" });
    expect(rows[4]).toMatchObject({ id: "p5", side: "sol", borrower: "Ax9Q…2wFe", collateral: "bSOL", collateralUsd: 28_750, debt: "PYUSD", health: 1.00, reward: 1_437, age: "24m" });
  });

  it("does NOT have the old seizableUsd / rewardUsd fields", async () => {
    const rows = await phase1Source.openLiquidations() as unknown as Record<string, unknown>[];
    for (const row of rows) {
      expect(row["seizableUsd"]).toBeUndefined();
      expect(row["rewardUsd"]).toBeUndefined();
    }
  });
});

describe("phase1Source — markets()", () => {
  it("returns all 6 markets matching the designer's MARKETS", async () => {
    const m = await phase1Source.markets();
    expect(m).toHaveLength(6);
  });

  it("each row has asset, kind, supplyApy, borrowApy, total, util, chains", async () => {
    const rows = await phase1Source.markets();
    for (const row of rows) {
      expect(typeof row.asset).toBe("string");
      expect(typeof row.kind).toBe("string");
      expect(typeof row.supplyApy).toBe("number");
      expect(typeof row.borrowApy).toBe("number");
      expect(typeof row.total).toBe("number");
      expect(typeof row.util).toBe("number");
      expect(Array.isArray(row.chains)).toBe(true);
      for (const c of row.chains) expect(["evm", "sol"]).toContain(c);
    }
  });

  it("matches the designer's exact MARKETS mock values", async () => {
    const rows = await phase1Source.markets();
    expect(rows[0]).toMatchObject({ asset: "USDC", kind: "Stablecoin", supplyApy: 5.18, borrowApy: 7.62, total: 22_140_000, util: 71, chains: ["evm", "sol"] });
    expect(rows[1]).toMatchObject({ asset: "USDT", kind: "Stablecoin", supplyApy: 4.83, borrowApy: 7.10, total: 9_420_000, util: 64, chains: ["evm", "sol"] });
    expect(rows[2]).toMatchObject({ asset: "wETH", kind: "Volatile", supplyApy: 2.41, borrowApy: 4.05, total: 7_880_000, util: 48, chains: ["evm"] });
    expect(rows[3]).toMatchObject({ asset: "wBTC", kind: "Volatile", supplyApy: 1.92, borrowApy: 3.66, total: 5_310_000, util: 39, chains: ["evm"] });
    expect(rows[4]).toMatchObject({ asset: "SOL", kind: "Volatile", supplyApy: 3.28, borrowApy: 5.74, total: 6_960_000, util: 57, chains: ["sol"] });
    expect(rows[5]).toMatchObject({ asset: "mSOL", kind: "LST", supplyApy: 3.91, borrowApy: 6.22, total: 3_120_000, util: 52, chains: ["sol"] });
  });

  it("does NOT have the old supplyApr / borrowApr / totalUsd fields", async () => {
    const rows = await phase1Source.markets() as unknown as Record<string, unknown>[];
    for (const row of rows) {
      expect(row["supplyApr"]).toBeUndefined();
      expect(row["borrowApr"]).toBeUndefined();
      expect(row["totalUsd"]).toBeUndefined();
    }
  });

  it("starts with the base stablecoin (USDC)", async () => {
    const m = await phase1Source.markets();
    expect(m[0].asset.toLowerCase()).toContain("usdc");
  });
});
