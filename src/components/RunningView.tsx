import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Task, UsageWindow, TerminalFontSize, FontFamily } from "../types";
import { permissionModeLabel } from "../types";
import { StatusIcon } from "./StatusIcon";
import { TerminalView } from "./TerminalView";
import { SessionView } from "./SessionView";
import { shortenPath, getUsageColor } from "../utils";
import { useUsageSnapshot } from "../hooks/useUsageSnapshot";
import { ENABLE_USAGE_INSIGHTS } from "../platform";
import { useI18n } from "../i18n";
import s from "../styles";
import { X, RotateCcw, Pencil, Sparkles, AlertTriangle, CheckCircle2 } from "lucide-react";

interface SessionMetrics {
  duration_secs: number;
  total_tokens: number;
  context_tokens: number;
  context_window: number;
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}m ${s}s`;
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 2 : 1)}M`;
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
  runCount = 0,
  visible = true,
  projectActive = true,
  onCancel,
  onResume,
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
  isDark,
  terminalFontSize,
  monoFontFamily,
}: {
  task: Task;
  runCount?: number;
  visible?: boolean;
  projectActive?: boolean;
  onCancel: () => void;
  onResume?: () => void;
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
  isDark: boolean;
  terminalFontSize: TerminalFontSize;
  monoFontFamily: FontFamily;
}) {
  const { t } = useI18n();
  const isActive =
    task.status === "pending" || task.status === "running" || task.status === "input_required";
  const isDetached = task.status === "detached";
  const isInterrupted = task.status === "interrupted";
  const sessionPath = task.claudeSessionPath ?? task.codexSessionPath;
  const resumeSessionId = task.agent === "codex" ? task.codexSessionId : task.claudeSessionId;
  const restoreState = getRestoreState?.() ?? {};

  const { snapshot: usageSnapshot } = useUsageSnapshot(visible && ENABLE_USAGE_INSIGHTS);

  const [metrics, setMetrics] = useState<SessionMetrics | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [hoverHeader, setHoverHeader] = useState(false);
  const [generatingName, setGeneratingName] = useState(false);
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
      setMetrics(null);
      return;
    }
    // 只在项目处于前台时才跑 metrics 轮询；切到其他项目时暂停，
    // 项目重新激活时这里会立即补拉一次。注意这里用的是 projectActive
    // 而不是 visible —— 后者在同项目内打开 FileViewer / GitDiff 时也会是 false，
    // 那种场景下不应该中断正在运行任务的 duration 更新。
    if (!projectActive) return;

    let cancelled = false;

    const load = () => {
      invoke<SessionMetrics>("read_session_metrics", { sessionPath })
        .then((nextMetrics) => {
          if (!cancelled) {
            setMetrics(nextMetrics);
          }
        })
        .catch(() => {});
    };

    load();

    if (isActive) {
      const timer = setInterval(load, 3000);
      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    }

    return () => {
      cancelled = true;
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
          <button style={s.cancelBtn} onClick={onCancel}>
            <X size={12} strokeWidth={2.5} />
            <span>{t("running.cancel")}</span>
          </button>
        )}
        {!isActive &&
          !isDetached &&
          !isInterrupted &&
          onResume &&
          (task.claudeSessionId || task.codexSessionId) && (
            <button style={s.resumeBtn} onClick={onResume}>
              <RotateCcw size={12} strokeWidth={2.5} />
              <span>{t("running.resume")}</span>
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
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-muted)" }}>
          <span>
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
        </div>
        {sessionPath && (
          <div
            title={sessionPath}
            style={{
              marginTop: 4,
              fontSize: 11,
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {t("running.sessionFile", { path: shortenPath(sessionPath) })}
          </div>
        )}
        {metrics && (
          <div
            style={{
              marginTop: 8,
              display: "flex",
              gap: 12,
              flexWrap: "wrap" as const,
            }}
          >
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
            isDark={isDark}
            terminalFontSize={terminalFontSize}
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
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        borderRadius: 6,
        background: "var(--bg-input)",
        border: "1px solid var(--border-dim)",
      }}
    >
      <span
        style={{
          fontSize: 10,
          color: "var(--text-hint)",
          fontWeight: 600,
          textTransform: "uppercase" as const,
          letterSpacing: 0.4,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 11, color: "var(--text-primary)", fontWeight: 600 }}>{value}</span>
    </div>
  );
}
