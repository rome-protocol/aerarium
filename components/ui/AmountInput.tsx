"use client";

import { useRef } from "react";
import type { ChangeEvent, FocusEvent } from "react";

interface AmountInputProps {
  value: string;
  onChange: (value: string) => void;
  max?: number | string;
  maxLabel?: string;
  suffix?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

export function AmountInput({
  value,
  onChange,
  max,
  maxLabel,
  suffix = "USDC",
  autoFocus,
  disabled,
}: AmountInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        border: "1px solid var(--border-default)",
        borderRadius: 10,
        background: "var(--bg-surface)",
        padding: "14px 16px",
        gap: 12,
        transition: "border-color 160ms",
        opacity: disabled ? 0.6 : 1,
      }}
      onFocus={(e: FocusEvent<HTMLDivElement>) => {
        e.currentTarget.style.borderColor = "var(--rome-purple)";
      }}
      onBlur={(e: FocusEvent<HTMLDivElement>) => {
        e.currentTarget.style.borderColor = "var(--border-default)";
      }}
    >
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          const v = e.target.value.replace(/[^0-9.]/g, "");
          onChange(v);
        }}
        placeholder="0.00"
        style={{
          flex: 1,
          border: "none",
          outline: "none",
          background: "transparent",
          fontFamily: "var(--font-serif)",
          fontSize: 28,
          fontWeight: 400,
          color: "var(--fg1)",
          letterSpacing: "-0.01em",
          minWidth: 0,
        }}
      />
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--fg2)",
        }}
      >
        {suffix}
      </span>
      {max !== undefined && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(String(max))}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            border: "1px solid var(--border-default)",
            background: "transparent",
            padding: "6px 10px",
            borderRadius: 999,
            cursor: disabled ? "not-allowed" : "pointer",
            color: "var(--rome-ink)",
          }}
        >
          {maxLabel || "Max"}
        </button>
      )}
    </div>
  );
}
