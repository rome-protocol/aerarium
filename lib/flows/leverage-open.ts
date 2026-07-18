// Leverage-open flow: supply collateral + borrow base in ONE Bulker.invoke
// tx.  Uses vanilla Compound's existing BaseBulker contract — NO Comet
// modifications, NO new contracts.  Fits 1.4M atomic on Hadrian
// (measured 1.30M for [SUPPLY_PCOL, WITHDRAW_wUSDC] in the 2026-05-17
// bench; 100K margin under the ceiling).
//
// Surface depends on the registry-declared chain capabilities:
//   - `ux.singleTxFlows` must include 'supplyCollatBorrowBase'
//   - The chain must have a collat-aware Comet variant (label other than 'supply-only')
//   - The collat symbol must be in the chain's collateralAssets[]

import { encodeAbiParameters, encodeFunctionData, stringToHex, pad } from "viem";
import type { CompoundChainConfig } from "../registry/types";

const SINGLE_TX_FLOW_KEY = "supplyCollatBorrowBase";

export interface LeverageOpenInput {
  /** EVM address of the user opening the leveraged position. */
  user: `0x${string}`;
  /** Symbol of the collateral asset (must match a key in cfg.collateralAssets). */
  collatSymbol: string;
  /** Collateral amount in the asset's smallest unit (e.g. wei for 18-decimal). */
  collatAmount: bigint;
  /** Base amount to borrow in the base asset's smallest unit (typically 6-decimal for wUSDC). */
  baseAmount: bigint;
}

export interface LeverageOpenCalldata {
  /** Target contract for the user's tx — always the chain's BaseBulker. */
  target: `0x${string}`;
  /** ABI-encoded calldata for Bulker.invoke([SUPPLY_ASSET, WITHDRAW_ASSET]). */
  calldata: `0x${string}`;
  /** Native value to send (always 0 for ERC-20 collateral flows). */
  value: bigint;
  /** Diagnostic info for UI display + bench reproducibility. */
  callbackInfo: {
    actionCount: number;
    actions: string[];
    /** Which Comet variant was selected for this flow. */
    cometUsed: `0x${string}`;
    cometLabel: string;
    collatAsset: `0x${string}`;
    baseAsset: `0x${string}`;
  };
}

/**
 * True when the chain's registry entry declares supplyCollatBorrowBase support
 * AND has a collat-aware Comet variant.
 */
export function isLeverageOpenSupported(cfg: CompoundChainConfig): boolean {
  if (!cfg.ux.singleTxFlows.includes(SINGLE_TX_FLOW_KEY)) return false;
  return !!pickCollatComet(cfg);
}

/**
 * Build the calldata for a Bulker.invoke([SUPPLY_ASSET, WITHDRAW_ASSET]) tx.
 *
 * Throws if the chain doesn't support the flow, or the collat symbol isn't
 * registered.
 */
export function buildLeverageOpenCalldata(
  cfg: CompoundChainConfig,
  input: LeverageOpenInput,
): LeverageOpenCalldata {
  if (!cfg.ux.singleTxFlows.includes(SINGLE_TX_FLOW_KEY)) {
    throw new Error(
      `Chain ${cfg.chainId}-${cfg.chainSlug} does not declare 'supplyCollatBorrowBase' in ux.singleTxFlows`,
    );
  }
  const collat = cfg.collateralAssets[input.collatSymbol];
  if (!collat) {
    throw new Error(
      `Collateral symbol '${input.collatSymbol}' is not registered on ${cfg.chainId}-${cfg.chainSlug}`,
    );
  }
  const comet = pickCollatComet(cfg);
  if (!comet) {
    throw new Error(
      `Chain ${cfg.chainId}-${cfg.chainSlug} has no collat-aware Comet variant`,
    );
  }

  // Encode the two action data blobs.  Bulker.invoke decodes each as
  // (address comet, address to, address asset, uint256 amount).
  const supplyData = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "address" }, { type: "uint256" }],
    [comet.address, input.user, collat.address, input.collatAmount],
  );
  const withdrawData = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "address" }, { type: "uint256" }],
    [comet.address, input.user, cfg.baseAsset.address, input.baseAmount],
  );

  // Bulker action keys are bytes32-padded ASCII strings (e.g.
  // "ACTION_SUPPLY_ASSET" → 0x4143…).  Compound encodes these as
  // bytes32 public constant ACTION_SUPPLY_ASSET = "ACTION_SUPPLY_ASSET";
  // — which Solidity right-pads with zeros.
  const actionSupply = pad(stringToHex("ACTION_SUPPLY_ASSET"), { dir: "right", size: 32 });
  const actionWithdraw = pad(stringToHex("ACTION_WITHDRAW_ASSET"), { dir: "right", size: 32 });

  const calldata = encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "invoke",
        stateMutability: "payable",
        inputs: [
          { name: "actions", type: "bytes32[]" },
          { name: "data", type: "bytes[]" },
        ],
        outputs: [],
      },
    ],
    functionName: "invoke",
    args: [[actionSupply, actionWithdraw], [supplyData, withdrawData]],
  });

  return {
    target: cfg.bulker,
    calldata,
    value: BigInt(0),
    callbackInfo: {
      actionCount: 2,
      actions: ["SUPPLY_ASSET", "WITHDRAW_ASSET"],
      cometUsed: comet.address,
      cometLabel: comet.label,
      collatAsset: collat.address,
      baseAsset: cfg.baseAsset.address,
    },
  };
}

/**
 * Pick the right collat-aware Comet for the leverage-open flow.
 * Preference order:
 *   1. multicollat (supports both PCOL + MOCK)
 *   2. collat-pcol (single-collat)
 *   3. anything else with collateralAssets.length > 0
 */
function pickCollatComet(cfg: CompoundChainConfig) {
  if (cfg.comets["multicollat"] && cfg.comets["multicollat"].collateralAssets.length > 0) {
    return cfg.comets["multicollat"];
  }
  if (cfg.comets["collat-pcol"]) return cfg.comets["collat-pcol"];
  for (const c of Object.values(cfg.comets)) {
    if (c.collateralAssets.length > 0) return c;
  }
  return undefined;
}
