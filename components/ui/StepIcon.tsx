"use client";

import { Spinner } from "./Spinner";

type StepStatus = "done" | "active" | "pending";

interface StepIconProps {
  status: StepStatus;
}

export function StepIcon({ status }: StepIconProps) {
  if (status === "done") {
    return (
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "var(--rome-purple)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path
            d="M2.5 6.2 L4.8 8.5 L9.5 3.5"
            stroke="#FBF8F4"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  if (status === "active") {
    return (
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          border: "1.5px solid var(--rome-purple)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          color: "var(--rome-purple)",
        }}
      >
        <Spinner size={11} />
      </span>
    );
  }
  return (
    <span
      style={{
        width: 22,
        height: 22,
        borderRadius: "50%",
        border: "1.5px solid var(--border-default)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        color: "var(--fg3)",
        fontFamily: "var(--font-serif)",
        fontSize: 11,
      }}
    >
      ·
    </span>
  );
}
