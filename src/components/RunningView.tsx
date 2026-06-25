import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import type {
  Task,
  UsageWindow,
  TerminalFontSize,
  TerminalScrollback,
  FontFamily,
  ThemeVariant,
} from "../types";
import { permissionModeLabel } from "../types";
import { StatusIcon } from "./StatusIcon";
import { TerminalView } from "./TerminalView";
import { SessionView } from "./SessionView";
import { useToast } from "./Toast";
import { writeClipboardText } from "./file-explorer/clipboard";
import { getUsageColor } from "../utils";
import { useUsageSnapshot } from "../hooks/useUsageSnapshot";
import { ENABLE_USAGE_INSIGHTS } from "../platform";
import { useI18n } from "../i18n";
import s from "../styles";
import {
  X,
  RotateCcw,
  Pencil,
  Sparkles,
  GitMerge,
  GitBranch,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Download,
} from "lucide-react";

interface SessionMetrics {
  duration_secs: number;
  session_file_bytes: number;
  total_tokens: number;
  context_tokens: number;
  context_window: number;
}

function formatDuration(secs: number): string {
  const totalSeconds = Math.max(0, Math.round(secs));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 2 : 1)}M`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}K`;
  if (bytes < 1024 * 1024 * 1024) {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(mb < 10 ? 1 : 0)}M`;
  }
  const gb = bytes / 1024 / 1024 / 1024;
  return `${gb.toFixed(gb < 10 ? 1 : 0)}G`;
}

function InlineWindow({ label, window }: { label: string; window: UsageWindow }) {
  return (
    <span style={s.usageInlineWindow}>
      <span style={s.usageInlineWindowLabel}>{label}</span>
      <span style={{ ...s.usageInlineWindowValue, color: getUsageColor(window.remainingPercent) }}>
        {window.remainingPercent}%
      </span>
    </span>
  );
}

export function RunningView({
  task,
  projectPath,
  runCount = 0,
  visible = true,
  projectActive = true,
  onCancel,
  onResume,
  onMergeWorktree,
  onDiscardWorktree,
  onReconnect,
  onMarkDone,
  onInput,
  onResize,
  onRegisterTerminal,
  onTerminalReady,
  onSnapshot,
  getRestoreState,
  onRename,
  onGenerateName,
  themeVariant,
  terminalFontSize,
  terminalScrollback,
  monoFontFamily,
}: {
  task: Task;
  projectPath: string;
  runCount?: number;
  visible?: boolean;
  projectActive?: boolean;
  onCancel: () => void;
  onResume?: () => void;
  onMergeWorktree?: () => Promise<void>;
  onDiscardWorktree?: () => Promise<void>;
  onReconnect: () => void;
  onMarkDone: () => void;
  onInput: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  onRegisterTerminal: (writeFn: ((data: string, callback?: () => void) => void) | null) => number;
  onTerminalReady: (generation: number) => void;
  onSnapshot?: (snapshot: string) => void;
  getRestoreState?: () => { initialData?: string; initialSnapshot?: string };
  onRename: (name: string) => void;
  onGenerateName: () => Promise<void>;
  themeVariant: ThemeVariant;
  terminalFontSize: TerminalFontSize;
  terminalScrollback: TerminalScrollback;
  monoFontFamily: FontFamily;
}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const isActive =
    task.status === "pending" || task.status === "running" || task.status === "input_required";
  const isDetached = task.status === "detached";
  const isInterrupted = task.status === "interrupted";
  const sessionPath = task.claudeSessionPath ?? task.codexSessionPath;
  const resumeSessionId = task.agent === "codex" ? task.codexSessionId : task.claudeSessionId;
  const restoreState = getRestoreState?.() ?? {};

  const { snapshot: usageSnapshot } = useUsageSnapshot(visible && ENABLE_USAGE_INSIGHTS);

  const [metricsState, setMetricsState] = useState<{
    sessionPath: string;
    status: "loading" | "ready" | "failed";
    metrics: SessionMetrics | null;
  } | null>(null);
  const currentMetricsState = metricsState?.sessionPath === sessionPath ? metricsState : null;
  const metrics = currentMetricsState?.status === "ready" ? currentMetricsState.metrics : null;
  const [editingTitle, setEditingTitle] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [hoverHeader, setHoverHeader] = useState(false);
  const [generatingName, setGeneratingName] = useState(false);
  const [worktreeBusy, setWorktreeBusy] = useState<"merge" | "discard" | null>(null);
  const [exporting, setExporting] = useState(false);
  const [bannerCompact, setBannerCompact] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const interruptedBannerRef = useRef<HTMLDivElement>(null);

  const generateTooltip = generatingName
    ? t("task.generatingName")
    : sessionPath
      ? t("task.generateName")
      : t("task.generateNameNoSession");

  const handleGenerateClick = async () => {
    if (generatingName || isActive) return;
    setGeneratingName(true);
    try {
      await onGenerateName();
    } catch {
      // toast already shown by parent handler
    } finally {
      setGeneratingName(false);
    }
  };

  const handleExport = async () => {
    if (exporting || !sessionPath) return;
    setExporting(true);
    try {
      const titleSource = (task.name ?? task.prompt).trim();
      // 仅保留汉字/字母/数字/连字符，其它替换成 _。避免出现非法文件名字符。
      const slug =
        titleSource
          .slice(0, 50)
          .replace(/[^\w\u4e00-\u9fa5-]+/g, "_")
          .replace(/^_+|_+$/g, "") || "session";
      const date = new Date().toISOString().slice(0, 10);
      const defaultName = `nezha-${slug}-${date}.md`;

      const outputPath = await saveDialog({
        title: t("running.exportSaveDialogTitle"),
        defaultPath: defaultName,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (!outputPath) return;

      await invoke<void>("export_session_markdown", {
        sessionPath,
        projectPath,
        isCodex: task.agent === "codex",
        outputPath,
        taskMeta: {
          name: task.name,
          prompt: task.prompt,
          agent: task.agent,
          createdAt: task.createdAt,
          sessionId: task.agent === "codex" ? task.codexSessionId : task.claudeSessionId,
          worktreeBranch: task.worktreeBranch,
          baseBranch: task.baseBranch,
          additions: task.additions,
          deletions: task.deletions,
          failureReason: task.failureReason,
        },
      });
      showToast(t("running.exportSuccess", { path: outputPath }), "success");
    } catch (err) {
      showToast(t("running.exportFailed", { error: String(err) }), "error");
    } finally {
      setExporting(false);
    }
  };

  const handleCopySessionPath = async () => {
    if (!sessionPath) return false;
    try {
      await writeClipboardText(sessionPath);
      return true;
    } catch (err) {
      showToast(t("running.sessionFilePathCopyFailed", { error: String(err) }), "error");
      return false;
    }
  };

  useEffect(() => {
    const el = interruptedBannerRef.current;
    if (!el) return;

    const updateCompact = () => {
      setBannerCompact(el.clientWidth < 820);
    };
    updateCompact();

    const observer = new ResizeObserver(updateCompact);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isDetached, isInterrupted, sessionPath]);

  useEffect(() => {
    if (!sessionPath) {
      setMetricsState(null);
      return;
    }
    const activeSessionPath = sessionPath;
    setMetricsState((prev) =>
      prev?.sessionPath === activeSessionPath ? prev : { sessionPath: activeSessionPath, status: "loading", metrics: null },
    );
    // 只在项目处于前台时才跑 metrics 轮询；切到其他项目时暂停，
    // 项目重新激活时这里会立即补拉一次。注意这里用的是 projectActive
    // 而不是 visible —— 后者在同项目内打开 FileViewer / GitDiff 时也会是 false，
    // 那种场景下不应该中断正在运行任务的 duration 更新。
    if (!projectActive) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const load = () => {
      invoke<SessionMetrics>("read_session_metrics", { sessionPath: activeSessionPath })
        .then((nextMetrics) => {
          if (cancelled) return;
          setMetricsState({
            sessionPath: activeSessionPath,
            status: "ready",
            metrics: nextMetrics,
          });
        })
        .catch(() => {
          if (!cancelled) {
            setMetricsState({
              sessionPath: activeSessionPath,
              status: "failed",
              metrics: null,
            });
          }
        });
    };

    load();
    if (isActive) timer = setInterval(load, 3000);

    return () => {
      cancelled = true;
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, [sessionPath, isActive, projectActive]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        visibility: visible ? "visible" : "hidden",
        pointerEvents: visible ? "auto" : "none",
        zIndex: visible ? 1 : 0,
      }}
    >
      {/* Header */}
      <div
        style={s.runHeader}
        onMouseEnter={() => setHoverHeader(true)}
        onMouseLeave={() => setHoverHeader(false)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <StatusIcon status={task.status} />
          {editingTitle ? (
            <input
              ref={titleInputRef}
              style={{
                maxWidth: 420,
                width: "100%",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-primary)",
                background: "transparent",
                border: "none",
                borderBottom: "2px solid var(--border-strong)",
                borderRadius: 0,
                padding: "0 2px",
                outline: "none",
              }}
              value={editValue}
              placeholder={task.prompt.slice(0, 60)}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onRename(editValue.trim());
                  setEditingTitle(false);
                }
                if (e.key === "Escape") {
                  setEditingTitle(false);
                }
              }}
              onBlur={() => {
                onRename(editValue.trim());
                setEditingTitle(false);
              }}
            />
          ) : (
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {(() => {
                const t = task.name ?? task.prompt;
                return t.slice(0, 70) + (t.length > 70 ? "…" : "");
              })()}
            </span>
          )}
          {sessionPath && !editingTitle && (
            <button
              type="button"
              title={t("task.renameTask")}
              style={{
                ...s.taskRenameBtn,
                flexShrink: 0,
                color: "var(--text-secondary)",
                opacity: hoverHeader ? 1 : 0.65,
                background: hoverHeader ? "var(--bg-input)" : "transparent",
                transition: "opacity 0.15s ease, background 0.15s ease",
              }}
              onClick={() => {
                setEditValue(task.name ?? "");
                setEditingTitle(true);
                setTimeout(() => titleInputRef.current?.focus(), 0);
              }}
            >
              <Pencil size={13} strokeWidth={2.25} />
            </button>
          )}
          {!editingTitle && (
            <button
              type="button"
              title={generateTooltip}
              disabled={generatingName || isActive}
              style={{
                ...s.taskRenameBtn,
                flexShrink: 0,
                color: isActive ? "var(--text-hint)" : "var(--text-secondary)",
                opacity: generatingName ? 1 : isActive ? 0.4 : hoverHeader ? 1 : 0.65,
                background:
                  hoverHeader && !isActive && !generatingName
                    ? "var(--bg-input)"
                    : "transparent",
                cursor: generatingName || isActive ? "not-allowed" : "pointer",
                transition: "opacity 0.15s ease, background 0.15s ease, color 0.15s ease",
              }}
              onClick={handleGenerateClick}
            >
              <Sparkles
                size={13}
                strokeWidth={2.25}
                className={generatingName ? "spin" : ""}
              />
            </button>
          )}
        </div>
        {isActive && (
          <>
            <button style={s.doneBtn} onClick={onMarkDone}>
              <CheckCircle2 size={12} strokeWidth={2.5} />
              <span>{t("running.markDone")}</span>
            </button>
            <button style={s.cancelBtn} onClick={onCancel}>
              <X size={12} strokeWidth={2.5} />
              <span>{t("running.cancel")}</span>
            </button>
          </>
        )}
        {!isActive && sessionPath && (
          <button
            style={exporting ? s.exportBtnBusy : s.exportBtn}
            disabled={exporting}
            title={t("running.exportMarkdown")}
            onClick={handleExport}
          >
            <Download size={12} strokeWidth={2.5} />
            <span>{t("running.exportMarkdown")}</span>
          </button>
        )}
        {!isActive &&
          !isDetached &&
          !isInterrupted &&
          onResume &&
          resumeSessionId &&
          !task.worktreeDiscarded && (
            <button style={s.resumeBtn} onClick={onResume}>
              <RotateCcw size={12} strokeWidth={2.5} />
              <span>{t("running.resume")}</span>
            </button>
          )}
        {!isActive &&
          task.status === "done" &&
          task.worktreePath &&
          task.worktreeBranch &&
          !task.worktreeDiscarded &&
          onMergeWorktree && (
            <button
              style={{
                ...s.resumeBtn,
                opacity: worktreeBusy ? 0.6 : 1,
                cursor: worktreeBusy ? "not-allowed" : "pointer",
              }}
              disabled={!!worktreeBusy}
              onClick={async () => {
                setWorktreeBusy("merge");
                try {
                  await onMergeWorktree();
                } finally {
                  setWorktreeBusy(null);
                }
              }}
            >
              <GitMerge size={12} strokeWidth={2.5} />
              <span>
                {worktreeBusy === "merge"
                  ? t("running.merging")
                  : t("running.mergeTo", { branch: task.baseBranch ?? "" })}
              </span>
            </button>
          )}
        {!isActive &&
          task.worktreePath &&
          task.worktreeBranch &&
          !task.worktreeDiscarded &&
          onDiscardWorktree && (
          <button
            style={{
              ...s.cancelBtn,
              opacity: worktreeBusy ? 0.6 : 1,
              cursor: worktreeBusy ? "not-allowed" : "pointer",
            }}
            disabled={!!worktreeBusy}
            onClick={async () => {
              setWorktreeBusy("discard");
              try {
                await onDiscardWorktree();
              } finally {
                setWorktreeBusy(null);
              }
            }}
          >
            <Trash2 size={12} strokeWidth={2.5} />
            <span>
              {worktreeBusy === "discard" ? t("running.discarding") : t("running.discardWorktree")}
            </span>
          </button>
        )}
      </div>
      <div
        style={{
          padding: "4px 20px 12px",
          borderBottom: "1px solid var(--border-dim)",
          flexShrink: 0,
        }}
      >
        <div style={s.runMetaRow}>
          <span style={s.runMetaFixed}>
            {task.agent === "claude" ? "✦ Claude Code" : "⬡ Codex"} ·{" "}
            {permissionModeLabel(task.permissionMode, task.agent)}
          </span>
          {ENABLE_USAGE_INSIGHTS && usageSnapshot && (task.agent === "claude"
            ? usageSnapshot.claude.status === "available" && (
                <>
                  {usageSnapshot.claude.data.fiveHour && (
                    <><span>·</span><InlineWindow label="5h" window={usageSnapshot.claude.data.fiveHour} /></>
                  )}
                  {usageSnapshot.claude.data.sevenDay && (
                    <><span>·</span><InlineWindow label="7d" window={usageSnapshot.claude.data.sevenDay} /></>
                  )}
                </>
              )
            : usageSnapshot.codex.status === "available" && (
                <>
                  {usageSnapshot.codex.data.primary && (
                    <><span>·</span><InlineWindow label="5h" window={usageSnapshot.codex.data.primary} /></>
                  )}
                  {usageSnapshot.codex.data.secondary && (
                    <><span>·</span><InlineWindow label="7d" window={usageSnapshot.codex.data.secondary} /></>
                  )}
                </>
              )
          )}
          {task.worktreePath && task.worktreeBranch && task.baseBranch && (
            <>
              <span style={s.runMetaFixed}>·</span>
              <span
                title={t("running.worktreeBranchTitle", {
                  branch: task.worktreeBranch,
                  base: task.baseBranch,
                })}
                style={s.runMetaBranchInline}
              >
                <GitBranch size={11} strokeWidth={2.2} />
                <span style={s.runMetaBranchText}>
                  {t("running.worktreeBranchInfo", {
                    branch: task.worktreeBranch,
                    base: task.baseBranch,
                  })}
                </span>
              </span>
            </>
          )}
        </div>
        {(metrics || sessionPath) && (
          <div style={s.runMetricsRow}>
            {metrics && (
              <>
                <MetricPill label={t("running.duration")} value={formatDuration(metrics.duration_secs)} />
                <MetricPill label={t("running.tokens")} value={formatTokens(metrics.total_tokens)} />
                {metrics.context_window > 0 && metrics.context_tokens > 0 && (
                  <MetricPill
                    label={t("running.context")}
                    value={`${formatTokens(metrics.context_tokens)} / ${formatTokens(metrics.context_window)} (${Math.round(
                      (metrics.context_tokens / metrics.context_window) * 100,
                    )}%)`}
                  />
                )}
              </>
            )}
            {sessionPath && (
              <SessionFilePill
                label={t("running.sessionFileLabel")}
                value={
                  currentMetricsState?.status === "ready" && metrics
                    ? formatFileSize(metrics.session_file_bytes)
                    : currentMetricsState?.status === "failed"
                      ? "0B"
                      : "..."
                }
                tone={
                  currentMetricsState?.status === "ready" && metrics
                    ? metrics.session_file_bytes > 0
                      ? "success"
                      : "error"
                    : currentMetricsState?.status === "failed"
                      ? "error"
                      : "warning"
                }
                copiedLabel={t("running.sessionFilePathCopied")}
                onCopy={handleCopySessionPath}
              />
            )}
          </div>
        )}
      </div>

      {/* Main content: terminal when active, session view when done/failed. */}
      {isDetached || isInterrupted ? (
        <div style={s.interruptedSessionWrap}>
          <div ref={interruptedBannerRef} style={s.interruptedBanner}>
            <div style={s.interruptedBannerIcon}>
              <AlertTriangle size={14} strokeWidth={2.1} />
            </div>
            <div style={s.interruptedBannerBody}>
              <div style={s.interruptedBannerTitle}>
                {t(isDetached ? "running.detachedTitle" : "running.interruptedTitle")}
              </div>
            </div>
            <div style={s.interruptedBannerActions}>
              <button
                type="button"
                title={!resumeSessionId ? t("running.resumeUnavailable") : undefined}
                style={{
                  ...s.interruptedPrimaryBtn,
                  opacity: resumeSessionId ? 1 : 0.45,
                  cursor: resumeSessionId ? "pointer" : "not-allowed",
                }}
                disabled={!resumeSessionId}
                onClick={isDetached ? onReconnect : onResume}
              >
                <RotateCcw size={12} strokeWidth={2.1} />
                <span>
                  {isDetached
                    ? bannerCompact
                      ? t("running.reconnect")
                      : t("running.reconnectTask")
                    : bannerCompact
                      ? t("running.resume")
                      : t("running.resumeTask")}
                </span>
              </button>
              {isInterrupted && (
                <button type="button" style={s.interruptedSecondaryBtn} onClick={onMarkDone}>
                  <CheckCircle2 size={12} strokeWidth={2.1} />
                  <span>{bannerCompact ? t("status.done") : t("running.markDone")}</span>
                </button>
              )}
              <button type="button" style={s.interruptedDangerBtn} onClick={onCancel}>
                <X size={12} strokeWidth={2.1} />
                <span>{bannerCompact ? t("running.cancel") : t("running.cancelTask")}</span>
              </button>
            </div>
          </div>
          {sessionPath ? (
            <SessionView sessionPath={sessionPath} />
          ) : (
            <div style={s.interruptedNoSessionPane}>
              {t(isDetached ? "running.detachedNoSession" : "running.interruptedNoSession")}
            </div>
          )}
        </div>
      ) : isActive || !sessionPath ? (
        <div style={s.terminalContainer}>
          <TerminalView
            key={`${task.id}-${runCount}`}
            onInput={onInput}
            onResize={onResize}
            onRegisterTerminal={onRegisterTerminal}
            onReady={onTerminalReady}
            onSnapshot={onSnapshot}
            themeVariant={themeVariant}
            terminalFontSize={terminalFontSize}
            terminalScrollback={terminalScrollback}
            monoFontFamily={monoFontFamily}
            isActive={visible}
            initialData={restoreState.initialData}
            initialSnapshot={restoreState.initialSnapshot}
          />
        </div>
      ) : (
        <SessionView sessionPath={sessionPath} />
      )}

      {/* Status bar when task is done and no session path (terminal fallback) */}
      {!isActive && !isDetached && !isInterrupted && !sessionPath && (
        <div
          style={{
            padding: "10px 20px",
            borderTop: "1px solid var(--border-dim)",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <StatusIcon status={task.status} />
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {task.status === "done"
              ? t("task.completed")
              : task.status === "failed"
                ? (task.failureReason ?? t("task.failed"))
                : t("task.cancelled")}
          </span>
        </div>
      )}
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.runMetricPill}>
      <span style={s.runMetricPillLabel}>{label}</span>
      <span style={s.runMetricPillValue}>{value}</span>
    </div>
  );
}

type SessionFilePillTone = "success" | "warning" | "error";

const sessionFilePillToneColor: Record<SessionFilePillTone, string> = {
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  error: "var(--color-error)",
};

function SessionFilePill({
  label,
  value,
  tone,
  copiedLabel,
  onCopy,
}: {
  label: string;
  value: string;
  tone: SessionFilePillTone;
  copiedLabel: string;
  onCopy: () => Promise<boolean>;
}) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const handleClick = async () => {
    const ok = await onCopy();
    if (!ok) return;
    setCopied(true);
    if (copiedTimerRef.current !== null) {
      clearTimeout(copiedTimerRef.current);
    }
    copiedTimerRef.current = setTimeout(() => {
      setCopied(false);
      copiedTimerRef.current = null;
    }, 1000);
  };

  return (
    <span
      style={s.runSessionFilePillWrap}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        style={{ ...s.runMetricPill, ...s.runMetricPillButton }}
        onClick={handleClick}
      >
        <span
          aria-hidden="true"
          style={{
            ...s.railStatusDot,
            background: sessionFilePillToneColor[tone],
            borderColor: "var(--bg-input)",
            ...s.runSessionStatusDot,
          }}
        />
        <span style={s.runMetricPillLabel}>{label}</span>
        <span style={s.runMetricPillValue}>{value}</span>
      </button>
      {copied && hovered && <span style={s.runSessionCopyTooltip}>{copiedLabel}</span>}
    </span>
  );
}
