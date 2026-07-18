// Pure helper for token icon color/letter — separated from TokenIcon.tsx so
// it's importable by vitest without JSX-transform configuration.

export interface TokenIconStyle {
  background: string;
  letter: string;
}

/** Canonical brand colors for known mainnet tokens. */
const KNOWN_COLORS: Record<string, string> = {
  USDC: "#2775ca",
  USDT: "#26a17b",
  DAI: "#f5ac37",
  ETH: "#627eea",
  WETH: "#627eea",
  BTC: "#f7931a",
  WBTC: "#f7931a",
  SOL: "#9945ff",
};

/** Rome-purple variants for testnet / Rome-specific tokens. */
const ROME_TESTNET_COLORS: Record<string, string> = {
  PCOL: "#7c3aed",
  MOCK: "#f59e0b",
  GOLD: "#eab308",
};

/** FNV-1a–style deterministic hash → hue.  Stable across runs. */
function symbolToHue(symbol: string): number {
  let h = 2166136261;
  for (let i = 0; i < symbol.length; i++) {
    h ^= symbol.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 360;
}

/** Strip a leading "w" wrapper marker so USDC and wUSDC share branding. */
function canonicalSymbol(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (upper.length > 2 && upper.startsWith("W") && (upper[1] !== "B")) {
    const stripped = upper.slice(1);
    if (KNOWN_COLORS[stripped]) return stripped;
  }
  return upper;
}

export function getTokenIconStyle(symbol: string): TokenIconStyle {
  const canonical = canonicalSymbol(symbol);
  const known = KNOWN_COLORS[canonical] ?? ROME_TESTNET_COLORS[canonical];
  if (known) return { background: known, letter: canonical[0] };

  const hue = symbolToHue(symbol);
  return {
    background: hslToHex(hue, 50, 50),
    letter: symbol[0]?.toUpperCase() ?? "?",
  };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) =>
    Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}
