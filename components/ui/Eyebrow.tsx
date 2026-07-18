"use client";

import type { CSSProperties, ReactNode } from "react";

interface EyebrowProps {
  children: ReactNode;
  color?: string;
  style?: CSSProperties;
}

export function Eyebrow({
  children,
  color = "var(--fg2)",
  style,
}: EyebrowProps) {
  const baseStyle: CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color,
    fontWeight: 400,
    ...style,
  };
  return <span style={baseStyle}>{children}</span>;
}
