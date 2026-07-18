"use client";

import type { CSSProperties } from "react";
import { getTokenIconStyle } from "./tokenColors";

export { getTokenIconStyle } from "./tokenColors";

interface TokenIconProps {
  symbol: string;
  size?: number;
  style?: CSSProperties;
}

/// Deterministic token icon — colored circle + first letter.  See
/// tokenColors.ts for the canonical-color / fallback-hue logic.
export function TokenIcon({ symbol, size = 28, style }: TokenIconProps) {
  const s = getTokenIconStyle(symbol);
  return (
    <span
      aria-label={`${symbol} icon`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        background: s.background,
        color: "#fff",
        fontFamily: "var(--font-sans)",
        fontWeight: 600,
        fontSize: size * 0.42,
        lineHeight: 1,
        flexShrink: 0,
        ...style,
      }}
    >
      {s.letter}
    </span>
  );
}
