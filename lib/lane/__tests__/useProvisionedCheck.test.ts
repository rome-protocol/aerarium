// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { PublicKey } from "@solana/web3.js";
import type { Hex } from "viem";

// jsdom's crypto makes the real findProgramAddressSync (PDA derivation) unreliable;
// the PDA math is proven elsewhere (and by the live flows). Stub externalAuthPda to a
// deterministic, jsdom-safe derivation (the program's own key bytes) so this test
// exercises the hook's re-run / gating LOGIC, not the curve search. The stub still
// returns a DIFFERENT key per program — which is the property the bug hinges on.
vi.mock("@/lib/solana/submit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/solana/submit")>();
  const { PublicKey: PK } = await import("@solana/web3.js");
  return { ...actual, externalAuthPda: (programId: PublicKey) => new PK(programId.toBytes()) };
});

import { externalAuthPda } from "@/lib/solana/submit";
import { useProvisionedCheck } from "../useProvisionedCheck";

// A connected Solana user whose synthetic IS activated: the external_auth PDA
// exists, but ONLY when derived against the real chain's rome-evm program.
const SYNTH = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" as Hex;
// Aurelius program — what resolveDefaultChainId() picks at build time before
// /api/env resolves the deploy chain (the wrong-program window).
const PROG_DEFAULT = "RPTAqWeyJk1RFV3E4eDe1eMK9thPVoav7NBcFmmh2JP";
// Hadrian program — the runtime-resolved chain the user actually activated on.
const PROG_REAL = "RPTWwELXAY4KC9ZPHhaxp7Sq1hHtU3HNEgLbSegCcWf";

function activatedConnection() {
  const realPda = externalAuthPda(new PublicKey(PROG_REAL), SYNTH).toBase58();
  return {
    getAccountInfo: vi.fn(async (pubkey: PublicKey) =>
      pubkey.toBase58() === realPda ? ({ lamports: 1 } as unknown) : null,
    ),
  };
}

describe("useProvisionedCheck", () => {
  it("does not query or conclude until the chain config resolves", () => {
    const connection = activatedConnection();
    const { result } = renderHook(() =>
      useProvisionedCheck({
        status: "connected",
        synthetic: SYNTH,
        programId: PROG_DEFAULT,
        chainResolved: false,
        connection,
      }),
    );
    // Unresolved chain → never flash Activate, never probe the wrong program.
    expect(result.current.provisioned).toBe(true);
    expect(connection.getAccountInfo).not.toHaveBeenCalled();
  });

  it("re-checks when programId resolves to the real chain after connect (refresh→Activate bug)", async () => {
    const connection = activatedConnection();
    const { result, rerender } = renderHook(
      (props: {
        status: "connected";
        synthetic: Hex;
        programId: string;
        chainResolved: boolean;
        connection: ReturnType<typeof activatedConnection>;
      }) => useProvisionedCheck(props),
      {
        initialProps: {
          status: "connected" as const,
          synthetic: SYNTH,
          programId: PROG_DEFAULT,
          chainResolved: true,
          connection,
        },
      },
    );

    // First check ran against the WRONG (default-chain) program → no PDA → the
    // user (wrongly, for this program) reads as not-provisioned.
    await waitFor(() => expect(result.current.checked).toBe(true));
    expect(result.current.provisioned).toBe(false);

    // /api/env resolves → cfg.programId flips to the real chain program. The
    // check MUST re-run (it depends on programId) and find the activated PDA.
    rerender({
      status: "connected",
      synthetic: SYNTH,
      programId: PROG_REAL,
      chainResolved: true,
      connection,
    });
    await waitFor(() => expect(result.current.provisioned).toBe(true));
  });

  it("treats a transient RPC error as provisioned (no false Activate)", async () => {
    const connection = {
      getAccountInfo: vi.fn(async () => {
        throw new Error("429 rate limited");
      }),
    };
    const { result } = renderHook(() =>
      useProvisionedCheck({
        status: "connected",
        synthetic: SYNTH,
        programId: PROG_REAL,
        chainResolved: true,
        connection,
      }),
    );
    await waitFor(() => expect(result.current.checked).toBe(true));
    expect(result.current.provisioned).toBe(true);
  });

  it("markProvisioned() forces a provisioned verdict (post-activate)", () => {
    const connection = activatedConnection();
    const { result } = renderHook(() =>
      useProvisionedCheck({
        status: "connected",
        synthetic: SYNTH,
        programId: PROG_REAL,
        chainResolved: true,
        connection,
      }),
    );
    act(() => result.current.markProvisioned());
    expect(result.current.provisioned).toBe(true);
    expect(result.current.checked).toBe(true);
  });

  it("resets to provisioned (no Activate) when the wallet disconnects", async () => {
    const connection = activatedConnection();
    const { result, rerender } = renderHook(
      (props: {
        status: "connected" | "disconnected";
        synthetic: Hex | null;
        programId: string;
        chainResolved: boolean;
        connection: ReturnType<typeof activatedConnection>;
      }) => useProvisionedCheck(props),
      {
        initialProps: {
          status: "connected" as "connected" | "disconnected",
          synthetic: SYNTH as Hex | null,
          programId: PROG_DEFAULT,
          chainResolved: true,
          connection,
        },
      },
    );
    await waitFor(() => expect(result.current.checked).toBe(true));
    expect(result.current.provisioned).toBe(false);

    rerender({
      status: "disconnected",
      synthetic: null,
      programId: PROG_DEFAULT,
      chainResolved: true,
      connection,
    });
    expect(result.current.provisioned).toBe(true);
    expect(result.current.checked).toBe(false);
  });
});
