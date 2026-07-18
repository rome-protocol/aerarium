"use client";

import { Spinner } from "./Spinner";
import { TxLink } from "./TxLink";

type TxStatus = "pending" | "done" | "idle";

interface TxRowProps {
  label: string;
  hash?: string;
  txUrl?: string;
  status?: TxStatus;
  explorer?: string;
}

/// One labelled row in the Solana lane's per-state "what happened" table.
/// Variants:
///   pending — italic dim text + spinner
///   done    — mono hash + view link
///   idle    — dim em-dash placeholder
export function TxRow({
  label,
  hash,
  txUrl,
  status = "idle",
  explorer = "view →",
}: TxRowProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "140px 1fr auto",
        gap: 16,
        alignItems: "baseline",
        padding: "10px 0",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--fg2)",
        }}
      >
        {label}
      </span>
      {status === "pending" && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--fg2)",
            fontStyle: "italic",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Spinner size={11} />
          pending…
        </span>
      )}
      {status === "idle" && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--fg3)",
          }}
        >
          —
        </span>
      )}
      {status === "done" && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12.5,
            color: "var(--fg1)",
            letterSpacing: "0.02em",
          }}
        >
          {hash}
        </span>
      )}
      {status === "done" && txUrl ? (
        <TxLink href={txUrl}>{explorer}</TxLink>
      ) : (
        <span />
      )}
    </div>
  );
}
