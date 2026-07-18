// LIVE integration smoke for the wired ensureAlt (hits the Rome devnet cluster).
// Off by default — run explicitly:
//   LIVE_ALT_REGISTRY=1 npx vitest run lib/solana/__tests__/altRegistry.live.test.ts
//
// Drives the REAL ensureAlt (not a reimplementation) with the local deployer as
// the authority/signer stand-in for Phantom, against the live program
// 2qQw…. localStorage is undefined under Node, so every call is the
// "fresh device" case — which is exactly what exercises the pointer tier.
import { describe, it, expect } from "vitest";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

import { ensureAlt, type AltDeps } from "../alt";
import { pointerPda, readAltPointer } from "../altRegistry";

const RPC = process.env.LIVE_ALT_REGISTRY_RPC ?? "https://api.devnet.solana.com";

describe.skipIf(!process.env.LIVE_ALT_REGISTRY)("ensureAlt live (Rome devnet)", () => {
  it(
    "create folds set_alt; a fresh-localStorage call resolves the same ALT via the pointer",
    async () => {
      const authority = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(readFileSync(homedir() + "/.config/solana/id.json", "utf8"))),
      );
      const connection = new Connection(RPC, "confirmed");
      const deps: AltDeps = {
        connection,
        payer: authority.publicKey,
        signTransaction: async (tx: Transaction) => {
          tx.sign(authority);
          return tx;
        },
      };

      // Fresh comet (unique per run) so this is a clean create path.
      const comet = "0x" + Buffer.from(Keypair.generate().publicKey.toBytes().subarray(0, 20)).toString("hex");
      const synthetic = "0x" + "11".repeat(20);
      const cacheKey = `${synthetic}-${comet}`;
      const accounts = Array.from({ length: 5 }, () => Keypair.generate().publicKey);
      const log = (s: string) => console.log("   ", s);

      // 1) create — localStorage unavailable in Node, pointer not yet set → create + fold set_alt.
      const alt1 = await ensureAlt(accounts, deps, cacheKey, log);
      const pointed = await readAltPointer(connection, authority.publicKey, comet);
      expect(pointed, "set_alt wrote a pointer").not.toBeNull();
      expect(pointed!.toBase58()).toBe(alt1.key.toBase58());
      const [pointer] = pointerPda(authority.publicKey, comet);
      console.log(`   created ALT ${alt1.key.toBase58()} (${alt1.state.addresses.length} keys); pointer ${pointer.toBase58()} -> it`);

      // 2) fresh-device replay (localStorage still unavailable) → must resolve the SAME
      //    ALT via the on-chain pointer, NOT create a new one.
      const alt2 = await ensureAlt(accounts, deps, cacheKey, log);
      expect(alt2.key.toBase58(), "pointer tier resolved the same ALT").toBe(alt1.key.toBase58());
    },
    180000,
  );
});
