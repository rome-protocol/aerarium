// =====================================================================
// AERARIUM landing — shared tokens + formatters
// Ported from design/aer-data.jsx (fmt helpers) + aer-brand.jsx (CHAIN).
// =====================================================================
import type { Side } from "@/lib/market/MarketSource";

export type { Side };

export interface ChainMeta {
  label: string;
  short: string;
  color: string;
  bright: string;
  wash: string;
  deep: string;
}

// EVM (steel) / SOLANA (violet) — CSS-var driven so it themes with the wrapper.
export const CHAIN: Record<Side, ChainMeta> = {
  evm: { label: "Ethereum", short: "EVM", color: "var(--evm)", bright: "var(--evm-bright)", wash: "var(--evm-wash)", deep: "var(--evm-deep)" },
  sol: { label: "Solana", short: "SOL", color: "var(--sol)", bright: "var(--sol-bright)", wash: "var(--sol-wash)", deep: "var(--sol-deep)" },
};

// Each gate routes to its lane screen (routes 404 until built — expected).
export const GATE_HREF: Record<Side, string> = {
  evm: "/evm",
  sol: "/solana",
};

export const fmtUsd = (n: number, dp = 0): string =>
  "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const fmtCompact = (n: number): string => {
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(2); // round small real values ($6.0975… → $6.10)
};

// Adaptive headline scale for the animated Counter: returns the scaled value +
// unit suffix so a value reads right whether it's preview millions ($48.2M) or
// a real small testnet total ($6.10). Pairs with <Counter value suffix decimals>.
export const scaleUsd = (n: number): { value: number; suffix: string; decimals: number } => {
  if (n >= 1e6) return { value: n / 1e6, suffix: "M", decimals: 2 };
  if (n >= 1e3) return { value: n / 1e3, suffix: "K", decimals: 1 };
  return { value: n, suffix: "", decimals: 2 };
};
