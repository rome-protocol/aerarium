"use client";

import type { CSSProperties, ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  style?: CSSProperties;
  padding?: number;
}

export function Card({ children, style, padding = 28 }: CardProps) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 12,
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
