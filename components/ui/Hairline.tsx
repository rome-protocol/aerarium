"use client";

import type { CSSProperties } from "react";

interface HairlineProps {
  color?: string;
  style?: CSSProperties;
}

export function Hairline({
  color = "var(--border-subtle)",
  style,
}: HairlineProps) {
  return (
    <div
      style={{ height: 1, background: color, width: "100%", ...style }}
    />
  );
}
