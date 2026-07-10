import { useState, memo } from "react";
import { Trash2, Star, Play, GitBranch } from "lucide-react";
import type { Task } from "../../types";
import { agentLabel } from "../../types";
import { StatusIcon } from "../StatusIcon";
import { useI18n } from "../../i18n";
import s from "../../styles";
import claudeLogo from "../../assets/claude.svg";
import chatgptLogo from "../../assets/chatgpt.svg";

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
    case "awaiting_review":
      return "status.awaitingReview";
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

function AgentBadge({ task, hidden }: { task: Task; hidden: boolean }) {
  const badgeStyle =
    task.agent === "claude"
      ? hidden
        ? s.taskAgentBadgeClaudeHidden
        : s.taskAgentBadgeClaude
      : task.agent === "codex"
        ? hidden
          ? s.taskAgentBadgeCodexHidden
          : s.taskAgentBadgeCodex
        : hidden
          ? s.taskAgentBadgePiHidden
          : s.taskAgentBadgePi;

  if (task.agent === "pi") {
    return (
      <span title={agentLabel(task.agent)} style={badgeStyle}>
        π
      </span>
    );
  }
  return (
    <img
      src={task.agent === "claude" ? claudeLogo : chatgptLogo}
      title={agentLabel(task.agent)}
      style={badgeStyle}
    />
  );
}

export const TaskListItem = memo(
  function TaskListItem({
    task,
    selected,
    onClick,
    onDelete,
    onToggleStar,
    onRunTodo,
  }: {
    task: Task;
    selected: boolean;
    onClick: () => void;
    onDelete: () => void;
    onToggleStar: () => void;
    onRunTodo?: () => void;
  }) {
    const { t } = useI18n();
    const [hov, setHov] = useState(false);
    const displayTitle = task.name ?? task.prompt;
    const cardStyle = selected ? s.taskCardSelected : hov ? s.taskCardHover : s.taskCardDefault;
    const starStyle = task.starred
      ? s.taskStarBtnStarred
      : hov
        ? s.taskStarBtnHover
        : s.taskStarBtnHidden;
    return (
      <div
        style={cardStyle}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        onClick={onClick}
      >
        <div style={s.taskStatusWrap}>
          <StatusIcon status={task.status} />
        </div>
        <div style={s.taskMainContent}>
          <div style={s.taskCardTitle}>
            {displayTitle.slice(0, 70)}
            {displayTitle.length > 70 ? "…" : ""}
          </div>
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
        <AgentBadge task={task} hidden={hov} />
        {task.worktreePath && task.worktreeBranch && (
          <span
            title={t("task.worktreeBadge", { branch: task.worktreeBranch })}
            style={hov ? s.worktreeBadgeHidden : s.worktreeBadgeVisible}
          >
            <GitBranch size={11} strokeWidth={2.2} />
          </span>
        )}
        <button
          type="button"
          aria-label={task.starred ? t("task.unstar") : t("task.star")}
          title={task.starred ? t("task.unstar") : t("task.star")}
          style={starStyle}
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
            style={hov ? s.taskPlayBtnVisible : s.taskPlayBtnDim}
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
          style={hov ? s.taskDeleteBtnVisible : s.taskDeleteBtnHidden}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 size={12} strokeWidth={2.2} />
        </button>
      </div>
    );
  },
  (prev, next) =>
    prev.task === next.task &&
    prev.selected === next.selected &&
    (prev.onRunTodo !== undefined) === (next.onRunTodo !== undefined),
);
