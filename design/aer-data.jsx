// =====================================================================
// AERARIUM — mock data (plausible testnet-to-mid scale)
// =====================================================================

const POOL = {
  totalSupplied: 48_215_400,
  totalBorrowed: 29_880_120,
  netApr: 3.94,
  supplyApr: 5.18,
  borrowApr: 7.62,
  // share of liquidity by origin chain
  suppliedEvm: 27_640_000,
  suppliedSol: 20_575_400,
  borrowedEvm: 14_120_000,
  borrowedSol: 15_760_120,
  suppliers: 4128,
  utilization: 62,
};

// The Arena — head-to-head liquidation rivalry (last 30 days)
const ARENA = {
  evm: {
    liquidationsWon: 142,        // EVM liquidators seizing Solana-side collateral
    valueSeized: 1_284_500,
    biggestHit: 96_400,
    positionsDefended: 311,
    streak: 4,
  },
  sol: {
    liquidationsWon: 169,
    valueSeized: 1_512_900,
    biggestHit: 121_700,
    positionsDefended: 287,
    streak: 7,
  },
};

// Open for liquidation — claimable underwater positions
const LIQUIDATIONS = [
  { id: 'p1', side: 'evm', borrower: '0x4F2a…9bC1', collateral: 'wBTC', collateralUsd: 184_200, debt: 'USDC', health: 0.97, reward: 9_210, age: '2m' },
  { id: 'p2', side: 'sol', borrower: 'Gx7k…QvR2', collateral: 'mSOL', collateralUsd: 92_640, debt: 'USDC', health: 0.98, reward: 4_630, age: '6m' },
  { id: 'p3', side: 'evm', borrower: '0xB81e…44Aa', collateral: 'wETH', collateralUsd: 61_900, debt: 'USDT', health: 0.99, reward: 3_095, age: '11m' },
  { id: 'p4', side: 'sol', borrower: 'H2mN…8kLp', collateral: 'JitoSOL', collateralUsd: 47_300, debt: 'USDC', health: 0.99, reward: 2_365, age: '18m' },
  { id: 'p5', side: 'sol', borrower: 'Ax9Q…2wFe', collateral: 'bSOL', collateralUsd: 28_750, debt: 'PYUSD', health: 1.00, reward: 1_437, age: '24m' },
];

// Markets — read-only rates table
const MARKETS = [
  { asset: 'USDC', kind: 'Stablecoin', supplyApy: 5.18, borrowApy: 7.62, total: 22_140_000, util: 71, chains: ['evm', 'sol'] },
  { asset: 'USDT', kind: 'Stablecoin', supplyApy: 4.83, borrowApy: 7.10, total: 9_420_000, util: 64, chains: ['evm', 'sol'] },
  { asset: 'wETH', kind: 'Volatile', supplyApy: 2.41, borrowApy: 4.05, total: 7_880_000, util: 48, chains: ['evm'] },
  { asset: 'wBTC', kind: 'Volatile', supplyApy: 1.92, borrowApy: 3.66, total: 5_310_000, util: 39, chains: ['evm'] },
  { asset: 'SOL', kind: 'Volatile', supplyApy: 3.28, borrowApy: 5.74, total: 6_960_000, util: 57, chains: ['sol'] },
  { asset: 'mSOL', kind: 'LST', supplyApy: 3.91, borrowApy: 6.22, total: 3_120_000, util: 52, chains: ['sol'] },
];

const fmtUsd = (n, dp = 0) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const fmtCompact = (n) => {
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n;
};

Object.assign(window, { POOL, ARENA, LIQUIDATIONS, MARKETS, fmtUsd, fmtCompact });
