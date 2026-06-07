import { useState, useMemo, memo, useRef, useEffect } from "react";
import { Trash2, Star, Play, GitBranch } from "lucide-react";
import type { Task } from "../../types";
import { StatusIcon } from "../StatusIcon";
import { useI18n } from "../../i18n";
import s from "../../styles";
import claudeLogo from "../../assets/claude.svg";
import chatgptLogo from "../../assets/chatgpt.svg";
import { ContextMenu, type MenuItem } from "../ContextMenu";

function statusLabelKey(status: Task["status"]): string {
  switch (status) {
    case "todo":
      return "status.todo";
    case "pending":
      return "status.pending";
    case "running":
      return "status.running";
    case "input_required":
      return "status.inputRequired";
    case "detached":
      return "status.detached";
    case "interrupted":
      return "status.interrupted";
    case "done":
      return "status.done";
    case "failed":
      return "status.failed";
    case "cancelled":
      return "status.cancelled";
  }
}

export const TaskListItem = memo(
  function TaskListItem({
    task,
    selected,
    onClick,
    onDelete,
    onToggleStar,
    onRunTodo,
    onResume,
    onCancel,
    onMarkDone,
    onRename,
    onMergeWorktree,
    onDiscardWorktree,
    onReconnect,
  }: {
    task: Task;
    selected: boolean;
    onClick: () => void;
    onDelete: () => void;
    onToggleStar: () => void;
    onRunTodo?: () => void;
    onResume: () => void;
    onCancel: () => void;
    onMarkDone: () => void;
    onRename: (name: string) => void;
    onMergeWorktree: () => Promise<void>;
    onDiscardWorktree: () => Promise<void>;
    onReconnect: () => void;
  }) {
    const { t } = useI18n();
    const [hov, setHov] = useState(false);
    const [editing, setEditing] = useState(false);
    const [editValue, setEditValue] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const cancelRef = useRef(false);

    const displayTitle = task.name ?? task.prompt;

    useEffect(() => {
      if (editing && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, [editing]);

    const isDetachedOrInterrupted =
      task.status === "detached" || task.status === "interrupted";
    const isInterrupted = task.status === "interrupted";
    const resumeSessionId =
      task.agent === "codex" ? task.codexSessionId : task.claudeSessionId;

    const ctxItems = useMemo<MenuItem[]>(
      () => [
        {
          label: task.starred ? t("task.unstar") : t("task.favorite"),
          onSelect: onToggleStar,
        },
        {
          label: t("task.rename"),
          onSelect: () => {
            setEditValue(task.name ?? "");
            setEditing(true);
          },
        },
        ...(isDetachedOrInterrupted
          ? ([
              { separator: true } as MenuItem,
              {
                label: t("running.resumeTask"),
                onSelect: onResume,
                disabled: !resumeSessionId,
              },
              ...(isInterrupted
                ? [
                    {
                      label: t("running.markDone"),
                      onSelect: onMarkDone,
                      variant: "success" as const,
                    },
                  ]
                : []),
              {
                label: t("running.cancelTask"),
                onSelect: onCancel,
                variant: "destructive" as const,
              },
            ] as MenuItem[])
          : []),
        ...(task.status === "detached"
          ? ([
              { separator: true } as MenuItem,
              {
                label: t("running.reconnect"),
                onSelect: onReconnect,
                disabled: !resumeSessionId,
              },
            ] as MenuItem[])
          : []),
        ...(task.status === "done" && task.worktreePath && !task.worktreeDiscarded
          ? ([
              { separator: true } as MenuItem,
              {
                label: t("running.mergeWorktree"),
                onSelect: onMergeWorktree,
              },
              {
                label: t("running.discardWorktree"),
                onSelect: onDiscardWorktree,
                variant: "destructive" as const,
              },
            ] as MenuItem[])
          : []),
        { separator: true },
        { label: t("task.deleteTask"), onSelect: onDelete, variant: "destructive" },
      ],
      [
        task.starred,
        task.name,
        task.status,
        task.worktreePath,
        task.worktreeDiscarded,
        isDetachedOrInterrupted,
        isInterrupted,
        resumeSessionId,
        onToggleStar,
        onResume,
        onMarkDone,
        onCancel,
        onReconnect,
        onMergeWorktree,
        onDiscardWorktree,
        onDelete,
        t,
      ],
    );

    return (
      <ContextMenu items={ctxItems}>
        <div
          style={{
            ...s.taskCard,
            position: "relative",
            background: selected
              ? "var(--bg-selected)"
              : hov
                ? "var(--bg-hover)"
                : "transparent",
          }}
          onMouseEnter={() => setHov(true)}
          onMouseLeave={() => setHov(false)}
          onClick={onClick}
        >
          <div style={{ flexShrink: 0, marginTop: 1 }}>
            <StatusIcon status={task.status} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              <input
                ref={inputRef}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "100%",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1.5px solid var(--accent)",
                  borderRadius: 0,
                  padding: "0 2px",
                  outline: "none",
                  height: 20,
                  lineHeight: "20px",
                }}
                value={editValue}
                placeholder={displayTitle.slice(0, 50)}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const v = editValue.trim();
                    if (v) onRename(v);
                    setEditing(false);
                  }
                  if (e.key === "Escape") {
                    cancelRef.current = true;
                    setEditing(false);
                  }
                }}
                onBlur={() => {
                  if (cancelRef.current) {
                    cancelRef.current = false;
                    return;
                  }
                  const v = editValue.trim();
                  if (v) onRename(v);
                  setEditing(false);
                }}
              />
            ) : (
              <div style={s.taskCardTitle}>
                {displayTitle.slice(0, 70)}
                {displayTitle.length > 70 ? "…" : ""}
              </div>
            )}
            <div style={s.taskCardSub}>
              {t(statusLabelKey(task.status))}
              {task.status === "done" &&
                task.worktreePath &&
                task.baseBranch &&
                task.additions !== undefined &&
                task.deletions !== undefined && (
                  <span style={s.taskDiffStats}>
                    <span style={s.taskDiffAdditions}>+{task.additions}</span>
                    <span style={s.taskDiffDeletions}>−{task.deletions}</span>
                  </span>
                )}
            </div>
          </div>
          <img
            src={task.agent === "claude" ? claudeLogo : chatgptLogo}
            title={task.agent === "claude" ? "Claude Code" : "Codex"}
            style={{
              ...s.agentBadge,
              position: "absolute",
              right: 16,
              top: 11,
              opacity: hov ? 0 : 1,
              filter: task.agent === "codex" ? "var(--agent-badge-filter)" : "none",
              pointerEvents: "none",
              transition: "opacity 0.12s ease",
              zIndex: 1,
            }}
          />
          {task.worktreePath && task.worktreeBranch && (
            <span
              title={t("task.worktreeBadge", { branch: task.worktreeBranch })}
              style={{ ...s.worktreeBadge, opacity: hov ? 0 : 1 }}
            >
              <GitBranch size={11} strokeWidth={2.2} />
            </span>
          )}
          <button
            type="button"
            aria-label={task.starred ? t("task.unstar") : t("task.star")}
            title={task.starred ? t("task.unstar") : t("task.star")}
            style={{
              ...s.taskStarBtn,
              opacity: task.starred ? 1 : hov ? 0.7 : 0,
              pointerEvents: task.starred || hov ? "auto" : "none",
              color: task.starred ? "var(--star-fg)" : "var(--text-hint)",
            }}
            onClick={(e) => {
              e.stopPropagation();
              onToggleStar();
            }}
          >
            <Star size={12} strokeWidth={2.2} fill={task.starred ? "currentColor" : "none"} />
          </button>
          {onRunTodo && (
            <button
              type="button"
              aria-label={t("task.runNow")}
              title={t("task.runNow")}
              style={{ ...s.taskPlayBtn, opacity: hov ? 1 : 0.5 }}
              onClick={(e) => {
                e.stopPropagation();
                onRunTodo();
              }}
            >
              <Play size={11} strokeWidth={2} fill="currentColor" />
            </button>
          )}
          <button
            type="button"
            aria-label={t("task.deleteTask")}
            title={t("task.deleteTask")}
            style={{
              ...s.taskDeleteBtn,
              opacity: hov ? 1 : 0,
              pointerEvents: hov ? "auto" : "none",
            }}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 size={12} strokeWidth={2.2} />
          </button>
        </div>
      </ContextMenu>
    );
  },
);
