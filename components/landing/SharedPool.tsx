"use client";
// =====================================================================
// AERARIUM landing — ONE SHARED POOL (the liquidity-split section)
// Ported from design/aer-sections.jsx. Reads PoolSplit from MarketSource.
// =====================================================================
import type { ReactNode } from "react";
import type { PoolSplit } from "@/lib/market/MarketSource";
import { Section, SectionHead, Counter, SplitBar, ChainBadge } from "./primitives";
import { CHAIN, fmtCompact, scaleUsd, type Side } from "./tokens";

const BigStat = ({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: boolean }) => (
  <div>
    <div className="aer-eyebrow" style={{ color: "var(--marble-3)", marginBottom: 12 }}>{label}</div>
    <div className="aer-num" style={{ fontSize: "clamp(30px, 4vw, 44px)", fontWeight: 600, lineHeight: 1, color: accent ? "var(--gold)" : "var(--marble)" }}>{value}</div>
    {sub && <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--marble-3)" }}>{sub}</div>}
  </div>
);

const OriginCard = ({ chain, supplied, borrowed }: { chain: Side; supplied: number; borrowed: number }) => {
  const c = CHAIN[chain];
  return (
    <div style={{ border: `1px solid ${c.color}`, borderRadius: "var(--r-md)", background: c.wash, padding: "20px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <ChainBadge chain={chain} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--marble-3)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
          {chain === "evm" ? "The Ethereum Gate" : "The Solana Gate"}
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--marble-3)", marginBottom: 6 }}>Supplied</div>
          <div className="aer-num" style={{ fontSize: 24, fontWeight: 600, color: c.bright }}>{fmtCompact(supplied)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--marble-3)", marginBottom: 6 }}>Borrowed</div>
          <div className="aer-num" style={{ fontSize: 24, fontWeight: 600, color: "var(--marble-2)" }}>{fmtCompact(borrowed)}</div>
        </div>
      </div>
    </div>
  );
};

export const SharedPool = ({ pool }: { pool: PoolSplit }) => (
  <Section id="pool" style={{ paddingTop: 96, paddingBottom: 96 }}>
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 40 }}>
      <SectionHead
        eyebrow="One shared pool"
        title="Two chains. One book of liquidity."
        intro="Every deposit — from Ethereum or Solana — lands in the same market. Borrowers draw from the same reserves. This is not two pools bridged together; it is one pool with two front doors."
        titleSize={42}
        preview={pool.illustrative}
      />

      <div style={{
        border: "1px solid var(--stone-line-2)", borderRadius: "var(--r-lg)",
        background: "linear-gradient(180deg, var(--basalt), var(--obsidian))",
        padding: 36, position: "relative", overflow: "hidden",
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 24, marginBottom: 34 }}>
          <BigStat label="USDC supplied" value={(() => { const s = scaleUsd(pool.totalSupplied); return <Counter value={s.value} prefix="$" suffix={s.suffix} decimals={s.decimals} />; })()} sub={`${pool.suppliers.toLocaleString()} suppliers`} />
          <BigStat label="USDC borrowed" value={(() => { const s = scaleUsd(pool.totalBorrowed); return <Counter value={s.value} prefix="$" suffix={s.suffix} decimals={s.decimals} />; })()} sub={`${pool.utilization.toFixed(1)}% utilization`} />
          <BigStat label="Total collateral" value={(() => { const s = scaleUsd(pool.totalCollateral); return <Counter value={s.value} prefix="$" suffix={s.suffix} decimals={s.decimals} />; })()} sub="backing the borrows" />
          <BigStat label="Net APR" value={<Counter value={pool.netApr} suffix="%" decimals={2} />} sub={`${pool.supplyApr.toFixed(2)}% supply · ${pool.borrowApr.toFixed(2)}% borrow`} accent />
        </div>

        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="aer-eyebrow" style={{ color: "var(--marble-3)" }}>Where the liquidity comes from</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--gold)" }}>◆ One pool ◆</span>
        </div>
        <SplitBar evm={pool.suppliedEvm} sol={pool.suppliedSol} height={20} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 32 }}>
          <OriginCard chain="evm" supplied={pool.suppliedEvm} borrowed={pool.borrowedEvm} />
          <OriginCard chain="sol" supplied={pool.suppliedSol} borrowed={pool.borrowedSol} />
        </div>
      </div>
    </div>
  </Section>
);
