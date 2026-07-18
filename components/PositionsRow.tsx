"use client";

import type { ReactNode } from "react";

interface PositionsRowProps {
  suppliesSlot: ReactNode;
  borrowsSlot: ReactNode;
}

// Two-column grid placing Your Supplies next to Your Borrows. minmax(0, 1fr)
// — without the 0 minimum, table content inside a child can blow the column
// out and break the grid layout at narrow widths. Drops to a single column
// below 768px.
export function PositionsRow({ suppliesSlot, borrowsSlot }: PositionsRowProps) {
  return (
    <div
      data-testid="positions-row"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 16,
      }}
    >
      <div>{suppliesSlot}</div>
      <div>{borrowsSlot}</div>
      <style>{`
        @media (max-width: 768px) {
          [data-testid="positions-row"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
