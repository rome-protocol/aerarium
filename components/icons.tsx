// Token logos + UI chrome icons — ported from a companion Aave demo for visual
// parity. Compound's tokens are wrapped (wUSDC, wETH, ...) but we render the
// canonical underlying logo by stripping the leading "w" in `tokenIconFor`.

import type { FC, ReactNode } from "react";

interface IconSize {
  size?: number;
}

// ────────────── Token logos ──────────────

export const USDCIcon: FC<IconSize> = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="16" fill="#2775CA" />
    <path
      d="M20.5 18.2c0-2.4-1.4-3.2-4.3-3.55-2.05-.27-2.46-.82-2.46-1.78 0-.96.69-1.57 2.05-1.57 1.23 0 1.92.41 2.26 1.44.07.21.27.34.48.34h1.1c.27 0 .48-.2.48-.48v-.07c-.27-1.5-1.5-2.66-3.07-2.8V8.13c0-.27-.2-.48-.55-.55h-1.03c-.27 0-.48.2-.55.55v1.51c-2.05.27-3.34 1.64-3.34 3.34 0 2.26 1.37 3.14 4.27 3.48 1.92.34 2.53.75 2.53 1.85 0 1.1-.96 1.85-2.26 1.85-1.78 0-2.4-.75-2.6-1.78-.07-.27-.27-.41-.48-.41h-1.17c-.27 0-.48.2-.48.48v.07c.27 1.71 1.37 2.94 3.62 3.27v1.57c0 .27.2.48.55.55h1.03c.27 0 .48-.2.55-.55v-1.57c2.05-.34 3.48-1.78 3.48-3.62z"
      fill="#fff"
    />
    <path
      d="M12.65 24.34c-3.34-1.2-5.05-4.93-3.76-8.2.68-1.91 2.19-3.34 4.1-4.02.27-.14.41-.34.41-.69v-.96c0-.27-.14-.48-.41-.55-.07 0-.21 0-.27.07-4.1 1.3-6.36 5.67-5.05 9.77.82 2.6 2.74 4.52 5.05 5.33.27.14.55 0 .62-.27.07-.07.07-.14.07-.27v-.96c0-.21-.21-.34-.41-.48-.07-.07-.21-.07-.34 0zm6.84-14.4c-.27-.14-.55 0-.62.27-.07.07-.07.14-.07.27v.96c0 .21.2.41.41.55 3.34 1.23 5.05 4.93 3.76 8.2-.68 1.91-2.19 3.34-4.1 4.02-.27.14-.41.34-.41.69v.96c0 .27.14.48.41.55.07 0 .21 0 .27-.07 4.1-1.3 6.36-5.67 5.05-9.77-.82-2.66-2.81-4.58-5.05-5.39-.07 0-.21 0-.27.07-.07.07-.07.07-.07.14z"
      fill="#fff"
    />
  </svg>
);

export const ETHIcon: FC<IconSize> = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="16" fill="#627EEA" />
    <g fill="#fff" fillRule="nonzero">
      <path fillOpacity=".602" d="M16.498 4v8.87l7.497 3.35z" />
      <path d="M16.498 4 9 16.22l7.498-3.35z" />
      <path fillOpacity=".602" d="M16.498 21.968v6.027L24 17.616z" />
      <path d="M16.498 27.995v-6.028L9 17.616z" />
      <path fillOpacity=".2" d="m16.498 20.573 7.497-4.353-7.497-3.348z" />
      <path fillOpacity=".602" d="m9 16.22 7.498 4.353v-7.701z" />
    </g>
  </svg>
);

interface LetterMarkProps extends IconSize {
  letter: string;
  bg: string;
  fg?: string;
}

const LetterMark: FC<LetterMarkProps> = ({ letter, bg, fg = "#fff", size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="16" fill={bg} />
    <text
      x="16"
      y="20"
      textAnchor="middle"
      fontFamily="'Untitled Sans', sans-serif"
      fontWeight="600"
      fontSize="11"
      letterSpacing="0.04em"
      fill={fg}
    >
      {letter}
    </text>
  </svg>
);

export const HEATIcon: FC<IconSize> = (p) => <LetterMark letter="HEAT" bg="#D9532A" {...p} />;
export const SALTIcon: FC<IconSize> = (p) => <LetterMark letter="SALT" bg="#7B8794" {...p} />;
export const MILKIcon: FC<IconSize> = (p) => <LetterMark letter="MILK" bg="#E8DCC4" fg="#3B2F1F" {...p} />;
export const OILIcon: FC<IconSize> = (p) => <LetterMark letter="OIL" bg="#2A3441" {...p} />;
export const WBTCIcon: FC<IconSize> = (p) => <LetterMark letter="BTC" bg="#F7931A" {...p} />;
export const GOLDIcon: FC<IconSize> = (p) => <LetterMark letter="GOLD" bg="#D4A017" fg="#3B2D0F" {...p} />;

export const SOLIcon: FC<IconSize> = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="16" fill="#1a1a1a" />
    <defs>
      <linearGradient id="solg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stopColor="#9945FF" />
        <stop offset="100%" stopColor="#14F195" />
      </linearGradient>
    </defs>
    <path
      d="M9 21.5l2.2-2.2h12.5l-2.2 2.2H9zm0-5.5l2.2-2.2h12.5L21.5 16H9zm0-5.5l2.2-2.2h12.5L21.5 10.5H9z"
      fill="url(#solg)"
    />
  </svg>
);

export const TOKEN_ICONS: Record<string, FC<IconSize>> = {
  USDC: USDCIcon,
  ETH: ETHIcon,
  WBTC: WBTCIcon,
  BTC: WBTCIcon,
  HEAT: HEATIcon,
  SALT: SALTIcon,
  MILK: MILKIcon,
  OIL: OILIcon,
  SOL: SOLIcon,
  GOLD: GOLDIcon,
};

export const FallbackTokenIcon: FC<IconSize & { symbol: string }> = ({ symbol, size = 24 }) => (
  <LetterMark letter={symbol.slice(0, 4).toUpperCase()} bg="#3F2A45" size={size} />
);

/**
 * Render the canonical token logo for any wrapper symbol. Strips the leading
 * "w" (Compound uses wUSDC / wETH / ... wrappers around the underlying mint)
 * so consumers don't have to. Falls back to a colored letter-mark if the
 * symbol isn't in the registry.
 */
export const TokenIcon: FC<{ symbol: string; size?: number }> = ({ symbol, size = 24 }) => {
  const bare = symbol.replace(/^w/i, "").toUpperCase();
  const Icon = TOKEN_ICONS[bare];
  if (Icon) return <Icon size={size} />;
  return <FallbackTokenIcon symbol={bare} size={size} />;
};

// ────────────── UI chrome icons (Lucide-derived) ──────────────

interface ChromeIconCoreProps {
  size?: number;
  sw?: number;
  fill?: string;
}
interface IconProps extends ChromeIconCoreProps {
  d: ReactNode;
}
const SvgIcon: FC<IconProps> = ({ d, size = 16, sw = 1.5, fill = "none" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {d}
  </svg>
);

type ChromeIconProps = ChromeIconCoreProps;

export const IconChevronRight: FC<ChromeIconProps> = (p) => (
  <SvgIcon {...p} d={<polyline points="9 6 15 12 9 18" />} />
);
export const IconExternal: FC<ChromeIconProps> = (p) => (
  <SvgIcon
    {...p}
    d={
      <>
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </>
    }
  />
);
