"use client";

import type { CSSProperties } from "react";

interface RNProps {
  n: string | number;
  size?: number;
  color?: string;
}

/// Roman numeral typeset in the editorial serif italic — used as a
/// section marker (e.g. "I.", "II.") throughout the design.
export function RN({ n, size = 14, color = "var(--rome-purple)" }: RNProps) {
  const style: CSSProperties = {
    fontFamily: "var(--font-serif)",
    fontStyle: "italic",
    fontSize: size,
    lineHeight: 1,
    color,
    fontVariantNumeric: "oldstyle-nums",
    letterSpacing: "0.02em",
  };
  return <span style={style}>{n}.</span>;
}
