import type React from "react";

export const terminal = {
  runHeader: {
    padding: "16px 20px 8px",
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  cancelBtn: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    padding: "4px 10px",
    background: "none",
    border: "1px solid var(--border-medium)",
    borderRadius: 5,
    fontSize: 12,
    color: "var(--text-muted)",
    cursor: "pointer",
    flexShrink: 0,
  },
  resumeBtn: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    padding: "4px 10px",
    background: "none",
    border: "1px solid var(--control-active-fg)",
    borderRadius: 5,
    fontSize: 12,
    color: "var(--control-active-fg)",
    cursor: "pointer",
    flexShrink: 0,
  },
  terminalContainer: { flex: 1, overflow: "hidden" as const, padding: "14px 16px 16px" },
} satisfies Record<string, React.CSSProperties>;
