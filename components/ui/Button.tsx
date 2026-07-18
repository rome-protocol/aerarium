"use client";

import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "link";
type Size = "sm" | "md" | "lg";

interface ButtonProps {
  variant?: Variant;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  size?: Size;
  style?: CSSProperties;
  type?: "button" | "submit" | "reset";
}

export function Button({
  variant = "primary",
  children,
  onClick,
  disabled,
  fullWidth,
  size = "md",
  style,
  type = "button",
}: ButtonProps) {
  const [hover, setHover] = useState(false);
  const sizes: Record<Size, CSSProperties> = {
    sm: { padding: "8px 16px", fontSize: 13 },
    md: { padding: "13px 22px", fontSize: 14 },
    lg: { padding: "16px 28px", fontSize: 15 },
  };
  const variants: Record<Variant, CSSProperties> = {
    primary: {
      background: disabled
        ? "var(--bg-surface-2)"
        : hover
          ? "var(--rome-purple-hover)"
          : "var(--rome-purple)",
      color: disabled ? "var(--fg3)" : "var(--fg-inverse)",
      borderColor: "transparent",
    },
    secondary: {
      background: hover && !disabled ? "var(--bg-surface-2)" : "transparent",
      color: disabled ? "var(--fg3)" : "var(--fg1)",
      borderColor: "var(--border-strong)",
    },
    ghost: {
      background: hover && !disabled ? "var(--bg-surface-2)" : "transparent",
      color: disabled ? "var(--fg3)" : "var(--fg1)",
      borderColor: "var(--border-default)",
    },
    link: {
      background: "transparent",
      color: hover ? "var(--rome-purple-hover)" : "var(--rome-purple)",
      borderColor: "transparent",
      padding: 0,
      textDecoration: hover ? "underline" : "none",
      textUnderlineOffset: 3,
    },
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        fontFamily: "var(--font-sans)",
        fontWeight: 500,
        borderRadius: 999,
        border: "1px solid",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        transition: "all 180ms cubic-bezier(.2,.8,.2,1)",
        width: fullWidth ? "100%" : "auto",
        letterSpacing: "0.005em",
        ...sizes[size],
        ...variants[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}
