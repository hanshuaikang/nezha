import type React from "react";

export const common = {
  errorBoundaryWrap: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 32px",
    gap: 12,
    color: "var(--text-muted)",
    fontSize: 13,
    textAlign: "center" as const,
  },
  errorBoundaryIcon: { fontSize: 28, lineHeight: 1 },
  errorBoundaryTitle: { fontWeight: 600, color: "var(--text-secondary)" },
  errorBoundaryMessage: {
    maxWidth: 320,
    fontSize: 12,
    color: "var(--text-hint)",
    wordBreak: "break-word" as const,
    lineHeight: 1.5,
  },
  errorBoundaryActions: { display: "flex", gap: 8 },
  errorBoundaryBtn: {
    padding: "5px 16px",
    background: "var(--bg-hover)",
    border: "1px solid var(--border-dim)",
    borderRadius: 6,
    color: "var(--text-secondary)",
    fontSize: 12,
    cursor: "pointer",
    marginTop: 4,
  },
  usagePopoverContent: {
    width: 204,
    padding: "10px 12px",
    borderRadius: 9,
    border: "1px solid var(--border-medium)",
    background: "var(--bg-card)",
    boxShadow: "var(--shadow-md)",
    zIndex: 9999,
  },
  usagePopoverHeader: {
    padding: "0 0 7px",
    borderBottom: "1px solid var(--border-dim)",
    marginBottom: 8,
  },
  usagePopoverTitle: {
    fontSize: 11.5,
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  usageSourceList: {
    display: "flex",
    flexDirection: "column",
    gap: 9,
  },
  usageSourceSection: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  usageSourceHead: {
    marginBottom: 3,
  },
  usageSourceTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--text-secondary)",
  },
  usageSourceSubtitle: {
    fontSize: 9.5,
    color: "var(--text-hint)",
    lineHeight: 1.35,
    wordBreak: "break-word" as const,
    marginTop: 1,
  },
  usageMetricList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  usageMetricRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  usageMetricLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: 500,
    color: "var(--text-secondary)",
  },
  usageMetricValue: {
    fontSize: 11,
    fontWeight: 700,
  },
  usageMetricMeta: {
    fontSize: 10,
    color: "var(--text-hint)",
    flexShrink: 0,
  },
  usageUnavailableText: {
    fontSize: 10.5,
    color: "var(--text-muted)",
    lineHeight: 1.5,
  },
  usageStatusText: {
    fontSize: 11,
    color: "var(--text-muted)",
    lineHeight: 1.5,
    padding: "2px 0",
  },
  usageInlineWindow: {
    display: "flex",
    gap: 3,
    alignItems: "center",
  },
  usageInlineWindowLabel: {
    fontSize: 10,
    color: "var(--text-hint)",
  },
  usageInlineWindowValue: {
    fontSize: 10.5,
    fontWeight: 700,
  },
} satisfies Record<string, React.CSSProperties>;
