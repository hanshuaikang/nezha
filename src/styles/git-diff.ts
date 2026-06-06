import type React from "react";

export const GIT_FILE_BROWSER_ROW_HEIGHT = 24;
export const GIT_FILE_BROWSER_MAX_HEIGHT = 420;

const gitFileViewToggleBtnBase = {
  width: 24,
  height: 22,
  border: "none",
  borderRadius: 5,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "background 0.1s, color 0.1s",
} satisfies React.CSSProperties;

export const gitDiff = {
  diffViewer: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
    background: "var(--bg-panel)",
  },
  diffHeader: {
    minHeight: 50,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0 14px",
    borderBottom: "1px solid var(--border-dim)",
    flexShrink: 0,
    background: "var(--bg-panel)",
  },
  diffHeaderTitleWrap: { flex: 1, minWidth: 0 },
  diffHeaderTitle: {
    fontSize: 13.5,
    fontWeight: 700,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  diffHeaderMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
    fontSize: 12,
    color: "var(--text-hint)",
  },
  diffAddCount: { color: "var(--diff-add-fg)", fontWeight: 650 },
  diffDeleteCount: { color: "var(--diff-delete-fg)", fontWeight: 650 },
  diffViewToggle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    padding: 2,
    border: "1px solid var(--border-dim)",
    borderRadius: 8,
    background: "var(--bg-card)",
  },
  diffToggleBtn: {
    width: 28,
    height: 28,
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    outline: "none",
  },
  diffCloseBtn: {
    width: 28,
    height: 28,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    borderRadius: 6,
    color: "var(--text-hint)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  diffContent: { flex: 1, overflow: "auto" as const, padding: 14 },
  diffStateMessage: {
    padding: 24,
    color: "var(--text-hint)",
    fontSize: 13,
    textAlign: "center" as const,
  },
  diffStateError: {
    padding: 24,
    color: "var(--danger)",
    fontSize: 13,
  },
  diffFileList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 12,
    minWidth: "100%",
  },
  diffFileBlock: {
    border: "1px solid var(--border-dim)",
    borderRadius: 9,
    overflow: "hidden",
    background: "var(--bg-panel)",
    boxShadow: "var(--shadow-xs)",
  },
  diffFileHeader: {
    height: 38,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 12px",
    background: "var(--bg-card)",
    borderBottom: "1px solid var(--border-dim)",
    cursor: "pointer",
    userSelect: "none" as const,
    border: "none",
    width: "100%",
    textAlign: "left" as const,
    outline: "none",
  },
  diffFileName: { fontSize: 13, fontWeight: 650, color: "var(--text-primary)" },
  diffFileDir: { fontSize: 12, color: "var(--text-hint)" },
  diffFileBody: { overflowX: "auto" as const },
  diffFileEmpty: {
    padding: "12px 14px",
    color: "var(--text-hint)",
    fontSize: 12.5,
    fontFamily: "var(--font-mono)",
  },
  diffStatusBadge: {
    padding: "2px 8px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.2,
  },
  diffHunkHeader: {
    minHeight: 24,
    lineHeight: "24px",
    background: "var(--diff-hunk-bg)",
    color: "var(--diff-hunk-fg)",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    borderTop: "1px solid var(--border-dim)",
    borderBottom: "1px solid var(--border-dim)",
  },
  diffHunkHeaderText: { padding: "0 12px" },
  diffLineNumber: {
    color: "var(--text-hint)",
    textAlign: "right" as const,
    padding: "0 10px",
    background: "var(--diff-gutter-bg)",
    userSelect: "none" as const,
    fontVariantNumeric: "tabular-nums" as const,
  },
  diffLineMarker: {
    textAlign: "center" as const,
    userSelect: "none" as const,
  },
  diffLineContent: {
    whiteSpace: "pre" as const,
    padding: "0 14px 0 8px",
  },
  diffMetaRow: {
    minHeight: 22,
    lineHeight: "22px",
    padding: "0 12px",
    color: "var(--diff-meta-fg)",
    fontFamily: "var(--font-mono)",
    fontSize: 12.5,
  },
  diffSplitEmpty: {
    minHeight: 22,
    background: "var(--diff-empty-bg)",
  },
  diffLazyPlaceholder: {
    padding: "12px 14px",
    color: "var(--text-hint)",
    fontSize: 12,
    fontFamily: "var(--font-mono)",
  },

  // ── GitChanges discard controls ───────────────────────────────────────────
  gitChangesHeaderIconBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 4,
    borderRadius: 4,
    color: "var(--text-hint)",
    display: "flex",
    alignItems: "center",
  },
  gitChangesHeaderIconBtnDisabled: {
    cursor: "default",
    opacity: 0.4,
  },
  gitChangesRowDiscardBtn: {
    flexShrink: 0,
    background: "var(--bg-card)",
    border: "1px solid var(--border-dim)",
    borderRadius: 4,
    padding: "2px 5px",
    color: "var(--text-muted)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
  },

  // ── Git file browser (tree / list) ────────────────────────────────────────
  gitFileViewToggle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    padding: 2,
    border: "1px solid var(--border-dim)",
    borderRadius: 7,
    background: "var(--bg-card)",
  },
  gitFileViewToggleBtnActive: {
    ...gitFileViewToggleBtnBase,
    background: "var(--control-selected-bg)",
    color: "var(--control-selected-fg)",
  },
  gitFileViewToggleBtnInactive: {
    ...gitFileViewToggleBtnBase,
    background: "transparent",
    color: "var(--text-hint)",
  },
  gitFileVirtualList: {
    position: "relative" as const,
    overflowY: "auto" as const,
    overflowX: "hidden" as const,
    minHeight: 0,
  },
  gitFileVirtualContent: {
    position: "relative" as const,
    width: "100%",
  },
  gitFileVirtualRow: {
    position: "absolute" as const,
    left: 0,
    right: 0,
    height: GIT_FILE_BROWSER_ROW_HEIGHT,
  },
  gitFileDirectoryRow: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    width: "100%",
    paddingRight: 10,
    height: GIT_FILE_BROWSER_ROW_HEIGHT,
    border: "none",
    cursor: "pointer",
    fontFamily: "var(--font-ui)",
    textAlign: "left" as const,
    userSelect: "none" as const,
    transition: "background 0.1s",
    boxSizing: "border-box" as const,
  },
  gitFileDirectoryToggleBtn: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    display: "flex",
    alignItems: "center",
    gap: 5,
    padding: 0,
    border: "none",
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
    fontFamily: "var(--font-ui)",
    textAlign: "left" as const,
  },
  gitFileChevron: {
    display: "flex",
    alignItems: "center",
    color: "var(--text-hint)",
    flexShrink: 0,
  },
  gitFileFolderIcon: {
    display: "flex",
    alignItems: "center",
    color: "var(--text-muted)",
    flexShrink: 0,
  },
  gitFileIcon: {
    flexShrink: 0,
  },
  gitFileName: {
    fontSize: 12.5,
    fontWeight: 500,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  gitFileDirectoryName: {
    fontSize: 12.5,
    fontWeight: 500,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    flex: 1,
    minWidth: 0,
  },
  gitFileNameHover: {
    fontSize: 12.5,
    fontWeight: 500,
    color: "var(--accent)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  gitFileStats: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 10.5,
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums" as const,
  },
  gitFileCountBadge: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-hint)",
    background: "var(--bg-card)",
    border: "1px solid var(--border-dim)",
    borderRadius: 10,
    padding: "0 6px",
    minWidth: 18,
    textAlign: "center" as const,
    flexShrink: 0,
    marginLeft: 4,
  },
  gitFileRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    paddingRight: 10,
    height: GIT_FILE_BROWSER_ROW_HEIGHT,
    transition: "background 0.1s",
    boxSizing: "border-box" as const,
  },
  gitFileStatusDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    flexShrink: 0,
  },
  gitFileStatusLabel: {
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
    width: 12,
    textAlign: "center" as const,
  },
  gitFileNameWrap: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    whiteSpace: "nowrap" as const,
    textOverflow: "ellipsis",
  },
  gitFileDir: {
    fontSize: 11,
    color: "var(--text-hint)",
    marginLeft: 5,
  },
  gitFileActions: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
    transition: "opacity 0.1s",
    opacity: 0,
    pointerEvents: "none" as const,
  },
  gitFileStageBtn: {
    flexShrink: 0,
    background: "var(--bg-card)",
    border: "1px solid var(--border-dim)",
    borderRadius: 4,
    fontSize: 12,
    lineHeight: 1,
    padding: "1px 6px",
    color: "var(--text-muted)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
  },
} satisfies Record<string, React.CSSProperties>;

export function gitFileVirtualListStyle(height: number, scrollable = true): React.CSSProperties {
  return {
    ...gitDiff.gitFileVirtualList,
    height,
    overflowY: scrollable ? "auto" : "hidden",
  };
}

export function gitFileVirtualContentStyle(height: number): React.CSSProperties {
  return {
    ...gitDiff.gitFileVirtualContent,
    height,
  };
}

export function gitFileVirtualRowStyle(rowIndex: number): React.CSSProperties {
  return {
    ...gitDiff.gitFileVirtualRow,
    top: rowIndex * GIT_FILE_BROWSER_ROW_HEIGHT,
  };
}

export function gitDirectoryRowStyle(depth: number, hovered: boolean): React.CSSProperties {
  return {
    ...gitDiff.gitFileDirectoryRow,
    paddingLeft: 8 + depth * 14,
    background: hovered ? "var(--bg-hover)" : "transparent",
  };
}

export function gitFileRowStyle(
  depth: number,
  mode: "tree" | "list",
  clickable: boolean,
  hovered: boolean,
): React.CSSProperties {
  return {
    ...gitDiff.gitFileRow,
    paddingLeft: mode === "tree" ? 28 + depth * 14 : 14,
    cursor: clickable ? "pointer" : "default",
    background: hovered ? "var(--bg-hover)" : "transparent",
  };
}

export function gitFileStatusDotStyle(color: string): React.CSSProperties {
  return {
    ...gitDiff.gitFileStatusDot,
    background: color,
  };
}

export function gitFileStatusLabelStyle(color: string): React.CSSProperties {
  return {
    ...gitDiff.gitFileStatusLabel,
    color,
  };
}

export function gitFileActionsStyle(visible: boolean): React.CSSProperties {
  return {
    ...gitDiff.gitFileActions,
    opacity: visible ? 1 : 0,
    visibility: visible ? "visible" : "hidden",
    pointerEvents: visible ? "auto" : "none",
  };
}
