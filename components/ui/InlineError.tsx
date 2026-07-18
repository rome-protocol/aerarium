"use client";

interface InlineErrorProps {
  message: string;
  onRetry?: () => void;
}

export function InlineError({ message, onRetry }: InlineErrorProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginTop: 14,
        padding: "12px 14px",
        borderRadius: 8,
        background: "rgba(94,10,96,0.04)",
        border: "1px solid rgba(94,10,96,0.18)",
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "var(--rome-purple)",
          color: "var(--fg-inverse)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        !
      </span>
      <span style={{ flex: 1, fontSize: 14, color: "var(--rome-ink)" }}>
        {message}
      </span>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--rome-purple)",
            fontFamily: "var(--font-sans)",
            fontSize: 13,
            textDecoration: "underline",
            textUnderlineOffset: 3,
            padding: 0,
          }}
        >
          Try again
        </button>
      )}
    </div>
  );
}
