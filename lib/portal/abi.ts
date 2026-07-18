// Comet view-method ABI used by the portal hooks.
//
// Only the methods needed for portal display.  Keeping a single shared ABI
// here so hooks can share the type narrowing — wagmi's readContracts
// infers return types from the abi const.

export const COMET_PORTAL_ABI = [
  { inputs: [], name: "baseToken", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "baseTokenPriceFeed", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "numAssets", outputs: [{ type: "uint8" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "totalSupply", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "totalBorrow", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "getUtilization", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ type: "uint256", name: "utilization" }], name: "getSupplyRate", outputs: [{ type: "uint64" }], stateMutability: "view", type: "function" },
  { inputs: [{ type: "uint256", name: "utilization" }], name: "getBorrowRate", outputs: [{ type: "uint64" }], stateMutability: "view", type: "function" },
  { inputs: [{ type: "address", name: "priceFeed" }], name: "getPrice", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  {
    inputs: [{ type: "uint8", name: "i" }],
    name: "getAssetInfo",
    outputs: [
      {
        type: "tuple",
        components: [
          { type: "uint8", name: "offset" },
          { type: "address", name: "asset" },
          { type: "address", name: "priceFeed" },
          { type: "uint64", name: "scale" },
          { type: "uint64", name: "borrowCollateralFactor" },
          { type: "uint64", name: "liquidateCollateralFactor" },
          { type: "uint64", name: "liquidationFactor" },
          { type: "uint128", name: "supplyCap" },
        ],
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ type: "address", name: "account" }],
    name: "balanceOf",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ type: "address", name: "account" }],
    name: "borrowBalanceOf",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { type: "address", name: "account" },
      { type: "address", name: "asset" },
    ],
    name: "userCollateral",
    outputs: [
      { type: "uint128", name: "balance" },
      { type: "uint128", name: "_reserved" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ type: "address" }],
    name: "isBorrowCollateralized",
    outputs: [{ type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
