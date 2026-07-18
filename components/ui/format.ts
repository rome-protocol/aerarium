// Formatters ported from /tmp/rome-compound-design/lib.jsx

export const fmtUSD = (n: number): string =>
  "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

export const fmtUSDC = (n: number, dp: number = 2): string =>
  Number(n).toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });

export const fmtPct = (n: number): string => n.toFixed(2) + "%";

export const fmtUSDNullable = (n: number | null): string =>
  n === null ? "—" : "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

// Compact USD — switches to "K" notation above $1000, "M" above $1_000_000.
// Sub-$1000 keeps cents so small testnet figures stay readable ("$12.40").
// Null/undefined returns the em-dash placeholder.
export const fmtUSDCompact = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (abs >= 1_000) return "$" + (n / 1_000).toFixed(2) + "K";
  return "$" + n.toFixed(2);
};

export const fmtPctNullable = (n: number | null): string =>
  n === null ? "—" : n.toFixed(2) + "%";

export const shortAddr = (a: string): string =>
  a.length > 12 ? a.slice(0, 4) + "…" + a.slice(-4) : a;

export const relTime = (ts: number): string => {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return Math.floor(s) + " sec ago";
  if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " hr ago";
  return Math.floor(s / 86400) + " days ago";
};

// Truncated tx hash (first 6, last 4)
export const shortHash = (h: string): string =>
  h.length > 12 ? h.slice(0, 6) + "…" + h.slice(-4) : h;

// Mock pool stats — only used as the POC fallback when on-chain reads
// are not yet wired through.
export const POOL_STATS = {
  tvl: 4_287_531,
  supplyApy: 5.20,
  borrowApy: 7.84,
  utilization: 62,
};
