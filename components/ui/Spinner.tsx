"use client";

interface SpinnerProps {
  size?: number;
  color?: string;
}

export function Spinner({ size = 14, color = "currentColor" }: SpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ animation: "rome-spin 1s linear infinite" }}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke={color}
        strokeWidth="2.5"
        fill="none"
        opacity="0.2"
      />
      <path
        d="M12 3 a9 9 0 0 1 9 9"
        stroke={color}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
