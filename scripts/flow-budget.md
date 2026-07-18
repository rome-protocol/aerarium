# Solana-native Compound — per-leg CU + Heap budget table

> **Reusable method — Aerarium on Hadrian is the worked example.** The CU/heap
> budgeting *method* below applies to any Rome chain/app; the numbers are this
> app's live measurement. Referenced from [`../docs/INTEGRATION.md`](../docs/INTEGRATION.md)
> (Pattern 5 — CU / heap budgeting).

Measured live on Hadrian comet `0x771D2f`, synthetic `0x857534`, via on-chain tx
(`computeUnitsConsumed` for CU; `Program log: Heap <n>` for heap high-water).

**Ceilings (hard Solana limits):**
- **CU = 1,400,000** per tx (Solana max).
- **Heap = 262,144 B (256 KB)** per tx (Solana max). Harness requests a 250 KB frame (`DOTX_HEAP_BYTES`).

Headroom = ceiling − used. Each leg is its own Solana tx with its own full budget (headroom is **per-leg, not shared**).

---

## SUPPLY — base (wUSDC) · 2–3 sigs · NO cWUSDC leg (proven)

| Leg | type | accts | CU | CU headroom | Heap B | Heap headroom |
|---|---|---|---|---|---|---|
| ① fund (ensureATA + ActivateAta) | native | 11 | 28,498 | 1,371,502 | 2,746 | 259,398 |
| ② approve (synth→comet) | DoTxUnsigned | 19 | 219,521 | 1,180,479 | 34,944 | 227,200 |
| ③ comet.supply | DoTxUnsigned | 27 | **921,327** | 478,673 | **127,928** | 134,216 |

## SUPPLY — collateral (wETH) · no receipt minted

| Leg | accts | CU | CU headroom | Heap B | Heap headroom |
|---|---|---|---|---|---|
| ③ comet.supply | 28 | 788,658 | 611,342 | 117,344 | 144,800 |

## WITHDRAW — base · 2 sigs · NO cWUSDC leg (proven)

| Leg | accts | CU | CU headroom | Heap B | Heap headroom |
|---|---|---|---|---|---|
| ① comet.withdraw — **DRAWDOWN** | 28 | 712,828 | 687,172 | 94,792 | 167,352 |
| ① comet.withdraw — **BORROW** | 34 | **1,027,099** | **372,901** | **129,024** | **133,120** |
| ② transfer_spl return | 15 | 54,534 | 1,345,466 | 8,600 | 253,544 |

## BORROW — base · 2 sigs (withdraw-beyond-supply = opens debt)

| Leg | accts | CU | CU headroom | Heap B | Heap headroom |
|---|---|---|---|---|---|
| ① comet.withdraw (opens debt) | 34 | **1,028,681** | 371,319 | **129,280** | 132,864 | ← ≡ withdraw-BORROW leg; the binding leg (CU + heap), ALT/v0 |
| ② transfer_spl return | 15 | 54,577 | 1,345,423 | 8,600 | 253,544 |

## REPAY = supply(base) — **measured, ≡ SUPPLY base**

| Leg | accts | CU | CU headroom | Heap B | Heap headroom |
|---|---|---|---|---|---|
| ① fund | 11 | 28,498 | 1,371,502 | 2,746 | 259,398 |
| ② approve | 19 | 219,521 | 1,180,479 | 34,944 | 227,200 |
| ③ comet.supply (repays debt) | 27 | 915,187 | 484,813 | 127,928 | 134,216 |

## ABSORB / BUY-COLLATERAL — same-class ESTIMATE (live fixture blocked)

Live measurement blocked: forcing the synthetic underwater needs a Comet-impl redeploy (lower-wsol-cf.ts), and Rome's RPC **rejects the >24KB Comet impl deploy @ 200M gas** (`ProviderError`; comet left untouched on original impl `0x5f3bb68c`, no harm). So recorded as same-class estimates:

| Flow | leg | CU | Heap B | basis |
|---|---|---|---|---|
| **Absorb** | ① comet.absorb (oracle batch + seize + clear, ALT/v0) | ~1.18M (historical) | ~130–150K (est) | same class as borrow/withdraw ① (1.03M/129K) + seize/clear; well under 1.4M / 256K |
| **buyCollateral** | ① fund · ② approve · ③ comet.buyCollateral · ④ transfer_spl | fund 28K / approve 219K / buy ~0.7–0.9M / return 55K | ≤128K | each leg matches an already-measured leg of its class |

**Conclusion:** no flow leg exceeds the ceilings. Binding leg across ALL flows = borrow/withdraw/absorb ① at ~1.0–1.2M CU (≈300–400K CU headroom) and ~129–150K heap (≈110–130K heap headroom). CU is the leading constraint; heap never exceeds ~half the wall.

---

## Findings
- **CU is the tighter axis.** Heaviest leg = borrow-path withdraw: CU 1.027M/1.4M = **73% used** vs heap 129K/262K = **49% used**. Nothing is heap-bound yet; heaviest heap ≈ 129 KB (half the ceiling).
- **Binding leg so far = withdraw BORROW ①** (1.027M CU / 373K headroom; 129K heap). The collateralization oracle batch (34 accts → v0+ALT) drives both.
- **cWUSDC receipt is NOT minted on base supply, NOT required on base withdraw** → no return-leg / front-leg for normal supply+withdraw. (The 1.754 cWUSDC was a one-off artifact; the enumerate-all-ATAs sweep catches such stragglers defensively.)
- transfer_spl (return/sweep) is cheap on both axes (~55K CU, ~9 KB heap) — folding it adds little.
