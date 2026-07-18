"use client";
// =====================================================================
// AERARIUM landing — RECENT ACTIVITY (cross-lane action feed)
// Reads ActivityRow[] from MarketSource. The only source that sees BOTH
// lanes is the indexer (Solana-origin DoTxUnsigned actions never emit
// eth_getLogs), so this feed is genuinely cross-chain.
// =====================================================================
import type { ActivityRow } from "@/lib/market/MarketSource";
import { Section, SectionHead, ChainBadge, PreviewBadge } from "./primitives";
import { CHAIN } from "./tokens";

const ACTION_LABEL: Record<ActivityRow["action"], string> = {
  supply: "Supplied",
  withdraw: "Withdrew",
  liquidate: "Liquidated",
  other: "Acted",
};

const fmtAmount = (n: number): string => {
  if (n === 0) return "0";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
};

const Row = ({ a, last }: { a: ActivityRow; last: boolean }) => {
  const c = CHAIN[a.lane];
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "110px 1fr auto", gap: 16, alignItems: "center",
      padding: "16px 22px", borderBottom: last ? "none" : "1px solid var(--stone-line)",
      borderLeft: `2px solid ${c.color}`,
    }}>
      <ChainBadge chain={a.lane} size="sm" />
      <span style={{ fontSize: 14.5, color: "var(--marble)" }}>
        <span style={{ color: "var(--marble-2)" }}>{ACTION_LABEL[a.action]}</span>
        {" "}
        <span className="aer-num" style={{ fontWeight: 600 }}>{fmtAmount(a.amount)}</span>
        {" "}
        <span style={{ color: c.bright, fontWeight: 600 }}>{a.asset}</span>
      </span>
      <span className="aer-num" style={{ fontSize: 12.5, color: "var(--marble-3)", whiteSpace: "nowrap" }}>{a.age ? `${a.age} ago` : ""}</span>
    </div>
  );
};

export const RecentActivity = ({ activity }: { activity: ActivityRow[] }) => {
  const illustrative = activity.some((a) => a.illustrative);
  return (
    <Section id="activity" style={{ paddingTop: 96, paddingBottom: 96 }}>
      <SectionHead
        eyebrow="Recent activity"
        title="Every move, both chains, one feed."
        intro="Supplies, withdrawals and liquidations as they land — from the Ethereum gate and the Solana gate alike. Reconstructed from the indexer, the only view that sees both lanes."
        titleSize={40}
        preview={illustrative}
      />
      <div style={{
        marginTop: 32, border: "1px solid var(--stone-line-2)", borderRadius: "var(--r-lg)", overflow: "hidden",
        background: "linear-gradient(180deg, var(--basalt), var(--obsidian))",
      }}>
        {activity.length === 0 ? (
          <div style={{ padding: "40px 22px", textAlign: "center", color: "var(--marble-3)", fontFamily: "var(--font-mono)", fontSize: 13 }}>
            No recent activity yet.
          </div>
        ) : (
          activity.map((a, i) => <Row key={a.txHash} a={a} last={i === activity.length - 1} />)
        )}
      </div>
    </Section>
  );
};
