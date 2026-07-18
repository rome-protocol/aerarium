import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import type { Hex } from "viem";
import { externalAuthPda } from "@/lib/solana/submit";
import type { LaneConnectionStatus } from "@/components/aerarium/lane/types";

/** The slice of a web3.js Connection the provisioning check needs. */
interface AccountReader {
  getAccountInfo(pubkey: PublicKey): Promise<unknown | null>;
}

export interface ProvisionedCheckParams {
  status: LaneConnectionStatus;
  /** Synthetic EVM address (keccak(pubkey)[12:]); null when no wallet is connected. */
  synthetic: Hex | null;
  /** rome-evm program id for the RESOLVED chain ("" until the registry config is known). */
  programId: string;
  /**
   * True once the runtime chain is settled — a build-time NEXT_PUBLIC_ROME_CHAIN_ID
   * pin OR a resolved /api/env defaultChainId. Until then `programId` is the
   * build-time default chain's program, which is a DIFFERENT rome-evm program; probing
   * the synthetic's external_auth PDA against it derives the wrong PDA and reads
   * "not provisioned", stranding an already-activated user on the Activate screen
   * after a refresh. Gate the check on this.
   */
  chainResolved: boolean;
  connection: AccountReader;
}

export interface ProvisionedCheck {
  /** Activate-gate value: true (no Activate) until the on-chain check concludes. */
  provisioned: boolean;
  /** Whether the check has concluded for the current inputs. */
  checked: boolean;
  /** Force a provisioned verdict after a successful runActivate (the PDA now exists). */
  markProvisioned: () => void;
}

/**
 * Decide whether a Solana-native user's synthetic account is provisioned (its
 * external_auth PDA exists) — the gate for the one-time Activate step.
 *
 * The check re-runs whenever its inputs change (synthetic / programId / connection),
 * not only on connect. So when /api/env resolves the deploy chain AFTER the wallet
 * auto-connects on a refresh, the verdict is recomputed against the correct program
 * instead of sticking on a stale wrong-program "not provisioned" result.
 */
export function useProvisionedCheck({
  status,
  synthetic,
  programId,
  chainResolved,
  connection,
}: ProvisionedCheckParams): ProvisionedCheck {
  const [provisioned, setProvisioned] = useState(true);
  const [checked, setChecked] = useState(false);

  const check = useCallback(async () => {
    if (!synthetic || !programId) return;
    try {
      const extAuth = externalAuthPda(new PublicKey(programId), synthetic);
      const info = await connection.getAccountInfo(extAuth);
      setProvisioned(!!info);
    } catch {
      // Reachable-but-failing RPC (rate limit / transient): assume provisioned so
      // we never flash a false Activate; Activate is idempotent if it's truly needed.
      setProvisioned(true);
    } finally {
      setChecked(true);
    }
  }, [synthetic, programId, connection]);

  useEffect(() => {
    if (status !== "connected" || !synthetic || !chainResolved) {
      setChecked(false);
      setProvisioned(true);
      return;
    }
    void check();
  }, [status, synthetic, chainResolved, check]);

  const markProvisioned = useCallback(() => {
    setProvisioned(true);
    setChecked(true);
  }, []);

  // Never expose a not-provisioned verdict before the check concludes — keeps the
  // worst case "brief loading flash" rather than a false Activate.
  return { provisioned: checked ? provisioned : true, checked, markProvisioned };
}
