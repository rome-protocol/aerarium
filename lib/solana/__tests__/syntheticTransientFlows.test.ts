import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { decodeFunctionData } from "viem";
import {
  parseSplTokenAmount,
  buildFundLeg,
  buildSweepLeg,
  HELPER_PROGRAM,
  HELPER_TRANSFER_SPL_ABI,
} from "../syntheticTransientFlows";
import { associatedTokenAddress, externalAuthPda } from "../submit";
import { syntheticAddress } from "../identity";

const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const programId = new PublicKey("RPTWwELXAY4KC9ZPHhaxp7Sq1hHtU3HNEgLbSegCcWf");
const mint = new PublicKey(new Uint8Array(32).fill(5));
const wallet = new PublicKey(new Uint8Array(32).fill(7));
const synthetic = syntheticAddress(wallet);
const synthPda = externalAuthPda(programId, synthetic);
const walletAta = associatedTokenAddress(mint, wallet, TOKEN_PROGRAM);
const synthAta = associatedTokenAddress(mint, synthPda, TOKEN_PROGRAM);

describe("parseSplTokenAmount", () => {
  it("reads the u64-LE amount at SPL account offset 64", () => {
    const data = new Uint8Array(165); // SPL token account size
    // amount = 123_456_789 at offset 64, little-endian
    const view = new DataView(data.buffer);
    view.setBigUint64(64, 123_456_789n, true);
    expect(parseSplTokenAmount(data)).toBe(123_456_789n);
  });

  it("returns 0 for a missing / too-short account (no ATA yet)", () => {
    expect(parseSplTokenAmount(new Uint8Array(0))).toBe(0n);
    expect(parseSplTokenAmount(new Uint8Array(40))).toBe(0n);
    expect(parseSplTokenAmount(null)).toBe(0n);
  });
});

describe("buildFundLeg (wallet → synthetic)", () => {
  const amount = 1_000_000n;
  const ixs = buildFundLeg({ programId, chainId: 200010, mint, amount, wallet, synthetic, tokenProgram: TOKEN_PROGRAM });

  it("returns two ixs: ensure synth ATA, then ActivateAta", () => {
    expect(ixs).toHaveLength(2);
  });

  it("ensures the SYNTHETIC's ATA (owner = synth external-auth PDA), payer = wallet", () => {
    const ensure = ixs[0];
    // create_ata_idempotent keys: [payer(s,w), ata(w), owner, mint, system, token]
    expect(ensure.keys[0]).toMatchObject({ pubkey: wallet, isSigner: true, isWritable: true });
    expect(ensure.keys[1].pubkey.equals(synthAta)).toBe(true);
    expect(ensure.keys[2].pubkey.equals(synthPda)).toBe(true);
    expect(ensure.keys[3].pubkey.equals(mint)).toBe(true);
  });

  it("ActivateAta moves wallet ATA → synthetic ATA for `amount`, wallet signs", () => {
    const activate = ixs[1];
    expect(activate.programId.equals(programId)).toBe(true);
    // buildActivateAtaInstruction layout: [signer(s,w), ownerInfo, mint, fromAta(w), toAta(w), tokenProgram]
    expect(activate.keys[0]).toMatchObject({ pubkey: wallet, isSigner: true, isWritable: true });
    expect(activate.keys[2].pubkey.equals(mint)).toBe(true);
    expect(activate.keys[3].pubkey.equals(walletAta)).toBe(true); // from = wallet
    expect(activate.keys[4].pubkey.equals(synthAta)).toBe(true);  // to = synthetic
  });
});

describe("buildSweepLeg (synthetic → wallet)", () => {
  const amount = 500_000n;
  const leg = buildSweepLeg({ programId, mint, amount, wallet, synthetic, tokenProgram: TOKEN_PROGRAM });

  it("targets HelperProgram with transfer_spl(walletAta, amount, mint)", () => {
    expect(leg.helperTo.toLowerCase()).toBe(HELPER_PROGRAM.toLowerCase());
    const decoded = decodeFunctionData({ abi: HELPER_TRANSFER_SPL_ABI, data: leg.calldata });
    expect(decoded.functionName).toBe("transfer_spl");
    // args: [toAta bytes32, tokens, mint bytes32]
    expect((decoded.args[1] as bigint)).toBe(amount);
  });

  it("ensures the WALLET's ATA (owner = wallet), payer = wallet", () => {
    expect(leg.ensureWalletAtaIx.keys[0]).toMatchObject({ pubkey: wallet, isSigner: true, isWritable: true });
    expect(leg.ensureWalletAtaIx.keys[1].pubkey.equals(walletAta)).toBe(true);
    expect(leg.ensureWalletAtaIx.keys[2].pubkey.equals(wallet)).toBe(true); // owner = wallet
  });

  it("supplies the truncated source(synthAta)+dest(walletAta) extra accounts, both writable", () => {
    const keys = leg.extraAccounts.map((a) => a.pubkey.toBase58());
    expect(keys).toContain(walletAta.toBase58());
    expect(keys).toContain(synthAta.toBase58());
    expect(leg.extraAccounts.every((a) => a.isWritable)).toBe(true);
  });
});
