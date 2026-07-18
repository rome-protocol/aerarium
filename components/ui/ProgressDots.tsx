"use client";

import { Fragment } from "react";

interface ProgressDotsProps {
  step: number;
  total?: number;
}

/// Three-step dot progress: ●─●─○
/// Used by the Solana lane to show phase 1 → user-sign → phase 2.
export function ProgressDots({ step, total = 3 }: ProgressDotsProps) {
  return (
    <div
      style={{ display: "inline-flex", alignItems: "center", gap: 0 }}
    >
      {Array.from({ length: total }).map((_, i) => {
        const filled = i <= step;
        const isLast = i === total - 1;
        return (
          <Fragment key={i}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: filled ? "var(--rome-purple)" : "transparent",
                border: filled
                  ? "none"
                  : "1px solid var(--border-default)",
                transition: "background 200ms",
                flexShrink: 0,
              }}
            />
            {!isLast && (
              <span
                style={{
                  width: 28,
                  height: 1,
                  background:
                    i < step
                      ? "var(--rome-purple)"
                      : "var(--border-default)",
                  transition: "background 200ms",
                }}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
