import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import {
  RefreshCw,
  Filter,
  GitCommit,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Undo2,
} from "lucide-react";
import { useCancellableInvoke } from "../hooks/useCancellableInvoke";
import s from "../styles";
import { useI18n } from "../i18n";
import {
  GitFileBrowser,
  GitFileViewToggle,
  type GitFileBrowserScrollContext,
  type GitDirectoryActionTarget,
  useGitFileViewMode,
} from "./git-view/GitFileBrowser";

interface GitFileChange {
  path: string;
  status: string;
  staged: boolean;
}

interface Props {
  projectPath: string;
  currentTaskCreatedAt: number | null;
  onFileSelect: (filePath: string, staged: boolean, label: string) => void;
  width?: number;
}

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

export function GitChanges({
  projectPath,
  currentTaskCreatedAt,
  onFileSelect,
  width = 280,
}: Props) {
  const { t } = useI18n();
  const [changes, setChanges] = useState<GitFileChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"task" | "all">("all");
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [generatingMsg, setGeneratingMsg] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commitMsgError, setCommitMsgError] = useState(false);
  const [textareaFocused, setTextareaFocused] = useState(false);
  const [trackedCollapsed, setTrackedCollapsed] = useState(false);
  const [untrackedCollapsed, setUntrackedCollapsed] = useState(false);
  const [fileViewMode, setFileViewMode] = useGitFileViewMode();
  const fileListScrollRef = useRef<HTMLDivElement>(null);
  const [fileListScrollTop, setFileListScrollTop] = useState(0);
  const [fileListViewportHeight, setFileListViewportHeight] = useState(0);

  const { safeInvoke, isCancelled } = useCancellableInvoke();

  useEffect(() => {
    const el = fileListScrollRef.current;
    if (!el) return;

    const updateViewport = () => {
      setFileListScrollTop(el.scrollTop);
      setFileListViewportHeight(el.clientHeight);
    };

    updateViewport();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(updateViewport);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const refresh = useCallback(
    async (options?: { clearError?: boolean }) => {
      setLoading(true);
      if (options?.clearError !== false) setError(null);
      try {
        const result = await safeInvoke<GitFileChange[]>("git_status", { projectPath });
        if (result === null) return; // Component unmounted
        setChanges(result);
      } catch (e) {
        if (!isCancelled()) setError(String(e));
      } finally {
        if (!isCancelled()) setLoading(false);
      }
    },
    [projectPath, safeInvoke, isCancelled],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  // "Current Task" tab: files modified after task start
  const taskChanges = useMemo(
    () => (currentTaskCreatedAt ? changes.filter((c) => c.staged) : []),
    [changes, currentTaskCreatedAt],
  );
  const allChanges = changes;
  const displayed = useMemo(
    () => (tab === "task" ? taskChanges : allChanges),
    [allChanges, tab, taskChanges],
  );

  const trackedFiles = useMemo(() => displayed.filter((c) => c.status !== "?"), [displayed]);
  const untrackedFiles = useMemo(() => displayed.filter((c) => c.status === "?"), [displayed]);
  const stagedFiles = useMemo(() => trackedFiles.filter((c) => c.staged), [trackedFiles]);
  const unstagedFiles = useMemo(() => trackedFiles.filter((c) => !c.staged), [trackedFiles]);

  const handleFileListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setFileListScrollTop(e.currentTarget.scrollTop);
  }, []);

  const fileListScrollContext = useMemo<GitFileBrowserScrollContext>(
    () => ({
      containerRef: fileListScrollRef,
      scrollTop: fileListScrollTop,
      viewportHeight: fileListViewportHeight,
      layoutKey: [
        fileViewMode,
        trackedCollapsed,
        untrackedCollapsed,
        stagedFiles.length,
        unstagedFiles.length,
        untrackedFiles.length,
      ].join(":"),
    }),
    [
      fileListScrollTop,
      fileListViewportHeight,
      fileViewMode,
      trackedCollapsed,
      untrackedCollapsed,
      stagedFiles.length,
      unstagedFiles.length,
      untrackedFiles.length,
    ],
  );

  const handleStageToggle = async (c: GitFileChange, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (c.staged) {
        await invoke("git_unstage", { projectPath, filePath: c.path });
      } else {
        await invoke("git_stage", { projectPath, filePath: c.path });
      }
      refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleDirectoryStageToggle = async (
    directory: GitDirectoryActionTarget,
    e: React.MouseEvent,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      setError(null);
      if (directory.staged) {
        await invoke("git_unstage_files", { projectPath, filePaths: directory.filePaths });
      } else {
        await invoke("git_stage_files", { projectPath, filePaths: directory.filePaths });
      }
      refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleStageAll = async () => {
    try {
      setError(null);
      await invoke("git_stage_all", { projectPath });
      refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleUnstageAll = async () => {
    try {
      setError(null);
      await invoke("git_unstage_all", { projectPath });
      refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleDiscardFile = async (c: GitFileChange, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const untracked = c.status === "?";
    const name = fileName(c.path);
    const ok = await confirm(
      t(untracked ? "git.confirmDiscardUntracked" : "git.confirmDiscardTracked", { name }),
      {
        title: t("git.confirmDiscardTitle", { name }),
        kind: "warning",
        okLabel: t("git.discard"),
      },
    );
    if (!ok) return;
    try {
      setError(null);
      await invoke("git_discard_file", {
        projectPath,
        filePath: c.path,
        untracked,
      });
    } catch (err) {
      setError(t("git.discardFailed", { error: String(err) }));
    } finally {
      await refresh({ clearError: false });
    }
  };

  const handleDiscardDirectory = async (
    directory: GitDirectoryActionTarget,
    e: React.MouseEvent,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await confirm(
      t(directory.untracked ? "git.confirmDiscardUntracked" : "git.confirmDiscardTracked", {
        name: directory.name,
      }),
      {
        title: t("git.confirmDiscardTitle", { name: directory.name }),
        kind: "warning",
        okLabel: t("git.discard"),
      },
    );
    if (!ok) return;
    try {
      setError(null);
      await invoke("git_discard_files", {
        projectPath,
        filePaths: directory.filePaths,
        untracked: directory.untracked,
      });
    } catch (err) {
      setError(t("git.discardFailed", { error: String(err) }));
    } finally {
      await refresh({ clearError: false });
    }
  };

  const handleDiscardAll = async () => {
    const ok = await confirm(t("git.confirmDiscardAll"), {
      title: t("git.confirmDiscardAllTitle"),
      kind: "warning",
      okLabel: t("git.discardAll"),
    });
    if (!ok) return;
    try {
      setError(null);
      await invoke("git_discard_all", { projectPath });
    } catch (err) {
      setError(t("git.discardFailed", { error: String(err) }));
    } finally {
      await refresh({ clearError: false });
    }
  };

  const handleGenerateMsg = async () => {
    setGeneratingMsg(true);
    setError(null);
    try {
      const msg = await safeInvoke<string>("generate_commit_message", { projectPath });
      if (msg === null) return; // Component unmounted
      setCommitMsg(msg);
      if (commitMsgError) setCommitMsgError(false);
    } catch (err) {
      if (!isCancelled()) setError(String(err));
    } finally {
      if (!isCancelled()) setGeneratingMsg(false);
    }
  };

  const handleCommit = async () => {
    if (!commitMsg.trim()) {
      setCommitMsgError(true);
      return;
    }
    setCommitMsgError(false);
    setCommitting(true);
    setError(null);
    try {
      await invoke("git_commit", { projectPath, message: commitMsg.trim() });
      setCommitMsg("");
      refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setCommitting(false);
    }
  };

  const taskCount = taskChanges.length;
  const allCount = allChanges.length;

  return (
    <div
      style={{
        width,
        flexShrink: 0,
        background: "var(--bg-sidebar)",
        borderLeft: "1px solid var(--border-dim)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 48,
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          borderBottom: "1px solid var(--border-dim)",
          flexShrink: 0,
          gap: 6,
        }}
      >
        <span style={{ flex: 1, fontSize: 13, fontWeight: 650, color: "var(--text-primary)" }}>
          {t("git.changes")}
        </span>
        <button
          onClick={() => refresh()}
          title={t("common.refresh")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 4,
            borderRadius: 4,
            color: "var(--text-hint)",
            display: "flex",
            alignItems: "center",
          }}
        >
          <RefreshCw size={13} className={loading ? "spin" : ""} />
        </button>
        <button
          onClick={handleDiscardAll}
          disabled={allChanges.length === 0}
          title={t("git.discardAll")}
          style={
            allChanges.length === 0
              ? { ...s.gitChangesHeaderIconBtn, ...s.gitChangesHeaderIconBtnDisabled }
              : s.gitChangesHeaderIconBtn
          }
        >
          <Undo2 size={13} />
        </button>
        <button
          title={t("git.filter")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 4,
            borderRadius: 4,
            color: "var(--text-hint)",
            display: "flex",
            alignItems: "center",
          }}
        >
          <Filter size={13} />
        </button>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px 4px",
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => setTab("task")}
          style={{
            padding: "3px 10px",
            borderRadius: 5,
            fontSize: 12,
            fontWeight: tab === "task" ? 600 : 500,
            border: "none",
            cursor: "pointer",
            background: tab === "task" ? "var(--control-selected-bg)" : "none",
            color: tab === "task" ? "var(--control-selected-fg)" : "var(--text-muted)",
          }}
        >
          {t("git.currentTask")} {taskCount}
        </button>
        <button
          onClick={() => setTab("all")}
          style={{
            padding: "3px 10px",
            borderRadius: 5,
            fontSize: 12,
            fontWeight: tab === "all" ? 600 : 500,
            border: "none",
            cursor: "pointer",
            background: tab === "all" ? "var(--control-selected-bg)" : "none",
            color: tab === "all" ? "var(--control-selected-fg)" : "var(--text-muted)",
          }}
        >
          {t("git.all")} {allCount}
        </button>
        <div style={{ marginLeft: "auto" }}>
          <GitFileViewToggle mode={fileViewMode} onChange={setFileViewMode} />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            margin: "0 12px 4px",
            padding: "6px 10px",
            background: "var(--danger-surface)",
            border: "1px solid var(--danger-border)",
            borderRadius: 6,
            fontSize: 11.5,
            color: "var(--danger-fg)",
          }}
        >
          {error}
        </div>
      )}

      {/* File list */}
      <div
        ref={fileListScrollRef}
        onScroll={handleFileListScroll}
        style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}
      >
        {displayed.length === 0 && !loading && (
          <div
            style={{
              padding: "24px 16px",
              fontSize: 12,
              color: "var(--text-hint)",
              textAlign: "center",
            }}
          >
            {t("git.noChanges")}
          </div>
        )}

        {/* ── Tracked changes section ── */}
        {trackedFiles.length > 0 && (
          <>
            <TopSectionHeader
              label={t("git.changes")}
              count={trackedFiles.length}
              collapsed={trackedCollapsed}
              onToggleCollapse={() => setTrackedCollapsed((v) => !v)}
            />
            {!trackedCollapsed && (
              <>
                {stagedFiles.length > 0 && (
                  <>
                    <SectionHeader
                      label={t("git.staged")}
                      count={stagedFiles.length}
                      actionIcon="−"
                      actionTitle={t("git.unstageAll")}
                      onAction={handleUnstageAll}
                    />
                    <GitFileBrowser
                      entries={stagedFiles}
                      mode={fileViewMode}
                      scrollContext={fileListScrollContext}
                      onFileClick={(c) =>
                        onFileSelect(c.path, true, `${fileName(c.path)} (staged)`)
                      }
                      onStageToggle={handleStageToggle}
                      onDirectoryStageToggle={handleDirectoryStageToggle}
                      autoCollapseLargeDirectories
                    />
                  </>
                )}
                {unstagedFiles.length > 0 && (
                  <>
                    <SectionHeader
                      label={t("git.modified")}
                      count={unstagedFiles.length}
                      actionIcon="+"
                      actionTitle={t("git.stageAll")}
                      onAction={handleStageAll}
                    />
                    <GitFileBrowser
                      entries={unstagedFiles}
                      mode={fileViewMode}
                      scrollContext={fileListScrollContext}
                      onFileClick={(c) =>
                        onFileSelect(c.path, false, `${fileName(c.path)} (unstaged)`)
                      }
                      onStageToggle={handleStageToggle}
                      onDirectoryStageToggle={handleDirectoryStageToggle}
                      onDiscard={handleDiscardFile}
                      onDirectoryDiscard={handleDiscardDirectory}
                      autoCollapseLargeDirectories
                    />
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ── Untracked files section ── */}
        {untrackedFiles.length > 0 && (
          <>
            <TopSectionHeader
              label={t("git.untrackedFiles")}
              count={untrackedFiles.length}
              collapsed={untrackedCollapsed}
              onToggleCollapse={() => setUntrackedCollapsed((v) => !v)}
            />
            {!untrackedCollapsed && (
              <GitFileBrowser
                entries={untrackedFiles}
                mode={fileViewMode}
                scrollContext={fileListScrollContext}
                onFileClick={(c) => onFileSelect(c.path, false, `${fileName(c.path)} (untracked)`)}
                onStageToggle={handleStageToggle}
                onDirectoryStageToggle={handleDirectoryStageToggle}
                onDiscard={handleDiscardFile}
                onDirectoryDiscard={handleDiscardDirectory}
                autoCollapseLargeDirectories
              />
            )}
          </>
        )}
      </div>

      {/* Commit area */}
      <div style={{ padding: "8px 10px", borderTop: "1px solid var(--border-dim)", flexShrink: 0 }}>
        <div style={{ position: "relative" }}>
          <textarea
            value={commitMsg}
            onChange={(e) => {
              setCommitMsg(e.target.value);
              if (commitMsgError) setCommitMsgError(false);
            }}
            onFocus={() => setTextareaFocused(true)}
            onBlur={() => setTextareaFocused(false)}
            placeholder={t("git.commitMessage")}
            rows={3}
            style={{
              width: "100%",
              padding: "8px 10px",
              paddingRight: 36,
              background: "var(--bg-card)",
              border: `1px solid ${commitMsgError ? "var(--danger-fg)" : textareaFocused ? "var(--control-active-fg)" : "var(--border-medium)"}`,
              borderRadius: 6,
              color: "var(--text-primary)",
              fontSize: 12.5,
              resize: "none",
              outline: "none",
              fontFamily: "var(--font-ui)",
              boxSizing: "border-box",
              transition: "border-color 0.15s",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleCommit();
            }}
          />
          <button
            onClick={handleGenerateMsg}
            disabled={generatingMsg}
            title={t("git.generateCommitMessage")}
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              background: "none",
              border: "none",
              cursor: generatingMsg ? "default" : "pointer",
              padding: 3,
              borderRadius: 4,
              color: generatingMsg ? "var(--accent)" : "var(--text-hint)",
              display: "flex",
              alignItems: "center",
              transition: "color 0.15s",
            }}
          >
            <Sparkles size={14} className={generatingMsg ? "spin" : ""} />
          </button>
        </div>
        {commitMsgError && (
          <div style={{ fontSize: 11.5, color: "var(--danger-fg)", marginTop: 3, paddingLeft: 2 }}>
            {t("git.enterCommitMessage")}
          </div>
        )}
        <div style={{ marginTop: 3, display: "flex" }}>
          <button
            onClick={handleCommit}
            disabled={committing || generatingMsg}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 12px",
              background: "var(--primary-action-bg)",
              color: "var(--primary-action-fg)",
              border: "none",
              borderRadius: 6,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: committing || generatingMsg ? "default" : "pointer",
              opacity: committing || generatingMsg ? 0.7 : 1,
            }}
          >
            <GitCommit size={13} />
            {committing ? t("git.committing") : t("git.commit")}
          </button>
        </div>
      </div>
    </div>
  );
}

function TopSectionHeader({
  label,
  count,
  collapsed,
  onToggleCollapse,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onToggleCollapse}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "8px 10px 6px 8px",
        cursor: "pointer",
        background: hovered ? "var(--bg-hover)" : "transparent",
        transition: "background 0.1s",
        userSelect: "none",
      }}
    >
      <span
        style={{ color: "var(--text-hint)", display: "flex", alignItems: "center", marginRight: 4 }}
      >
        {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
      </span>
      <span
        style={{
          flex: 1,
          fontSize: 12,
          fontWeight: 650,
          color: "var(--text-primary)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-hint)",
          background: "var(--bg-card)",
          border: "1px solid var(--border-dim)",
          borderRadius: 10,
          padding: "0 6px",
          minWidth: 18,
          textAlign: "center",
        }}
      >
        {count}
      </span>
    </div>
  );
}

function SectionHeader({
  label,
  count,
  actionIcon,
  actionTitle,
  onAction,
}: {
  label: string;
  count: number;
  actionIcon?: string;
  actionTitle?: string;
  onAction?: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "6px 8px 2px 12px",
        fontSize: 11,
        fontWeight: 700,
        color: "var(--text-hint)",
        letterSpacing: 0.4,
        textTransform: "uppercase",
      }}
    >
      <span style={{ flex: 1 }}>{label}</span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-hint)",
          marginRight: onAction ? 4 : 0,
        }}
      >
        {count}
      </span>
      {onAction && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAction();
          }}
          title={actionTitle}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "2px 5px",
            borderRadius: 4,
            fontSize: 14,
            lineHeight: 1,
            color: hovered ? "var(--text-primary)" : "transparent",
            transition: "color 0.1s",
            fontWeight: 600,
          }}
        >
          {actionIcon}
        </button>
      )}
    </div>
  );
}
