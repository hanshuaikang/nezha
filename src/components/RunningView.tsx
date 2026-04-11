import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Task, UsageWindow } from "../types";
import { PERM_LABELS } from "../types";
import { StatusIcon } from "./StatusIcon";
import { TerminalView } from "./TerminalView";
import { SessionView } from "./SessionView";
import { shortenPath, getUsageColor } from "../utils";
import { useUsageSnapshot } from "../hooks/useUsageSnapshot";
import s from "../styles";
import { X, RotateCcw, Pencil } from "lucide-react";

interface SessionMetrics {
  input_tokens: number;
  output_tokens: number;
  tool_calls: number;
  duration_secs: number;
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}m ${s}s`;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
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
  onCancel,
  onResume,
  onInput,
  onResize,
  onRegisterTerminal,
  onTerminalReady,
  onSnapshot,
  getRestoreState,
  onRename,
  isDark,
}: {
  task: Task;
  runCount?: number;
  visible?: boolean;
  onCancel: () => void;
  onResume?: () => void;
  onInput: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  onRegisterTerminal: (writeFn: ((data: string, callback?: () => void) => void) | null) => number;
  onTerminalReady: (generation: number) => void;
  onSnapshot?: (snapshot: string) => void;
  getRestoreState?: () => { initialData?: string; initialSnapshot?: string };
  onRename: (name: string) => void;
  isDark: boolean;
}) {
  const isActive =
    task.status === "pending" || task.status === "running" || task.status === "input_required";
  const sessionPath = task.claudeSessionPath ?? task.codexSessionPath;
  const restoreState = getRestoreState?.() ?? {};

  const { snapshot: usageSnapshot } = useUsageSnapshot(visible);

  const [metrics, setMetrics] = useState<SessionMetrics | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [hoverHeader, setHoverHeader] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!sessionPath) return;

    let cancelled = false;

    const load = () => {
      invoke<SessionMetrics>("read_session_metrics", { sessionPath })
        .then((m) => {
          if (!cancelled) setMetrics(m);
        })
        .catch(() => {});
    };

    load();

    // Refresh metrics periodically while task is active
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
  }, [sessionPath, isActive]);

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
                borderBottom: "2px solid var(--accent)",
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
              title="Rename task"
              style={{
                ...s.taskRenameBtn,
                flexShrink: 0,
                opacity: hoverHeader ? 0.8 : 0.35,
                transition: "opacity 0.15s ease",
              }}
              onClick={() => {
                setEditValue(task.name ?? "");
                setEditingTitle(true);
                setTimeout(() => titleInputRef.current?.focus(), 0);
              }}
            >
              <Pencil size={12} strokeWidth={2} />
            </button>
          )}
        </div>
        {isActive && (
          <button style={s.cancelBtn} onClick={onCancel}>
            <X size={12} strokeWidth={2.5} />
            <span>Cancel</span>
          </button>
        )}
        {!isActive && onResume && (task.claudeSessionId || task.codexSessionId) && (
          <button style={s.resumeBtn} onClick={onResume}>
            <RotateCcw size={12} strokeWidth={2.5} />
            <span>Resume</span>
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
            {PERM_LABELS[task.permissionMode]}
          </span>
          {usageSnapshot && (task.agent === "claude"
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
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            Session file: {shortenPath(sessionPath)}
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
            <MetricPill label="Duration" value={formatDuration(metrics.duration_secs)} />
            <MetricPill label="Tool calls" value={String(metrics.tool_calls)} />
            <MetricPill label="Input" value={`${formatTokens(metrics.input_tokens)} tok`} />
            <MetricPill label="Output" value={`${formatTokens(metrics.output_tokens)} tok`} />
          </div>
        )}
      </div>

      {/* Main content: terminal when active, session view when done/failed. */}
      {isActive || !sessionPath ? (
        <div style={s.terminalContainer}>
          <TerminalView
            key={`${task.id}-${runCount}`}
            onInput={onInput}
            onResize={onResize}
            onRegisterTerminal={onRegisterTerminal}
            onReady={onTerminalReady}
            onSnapshot={onSnapshot}
            isDark={isDark}
            isActive={visible}
            initialData={restoreState.initialData}
            initialSnapshot={restoreState.initialSnapshot}
          />
        </div>
      ) : (
        <SessionView sessionPath={sessionPath} />
      )}

      {/* Status bar when task is done and no session path (terminal fallback) */}
      {!isActive && !sessionPath && (
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
              ? "Task completed"
              : task.status === "failed"
                ? (task.failureReason ?? "Task failed")
                : "Task cancelled"}
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
