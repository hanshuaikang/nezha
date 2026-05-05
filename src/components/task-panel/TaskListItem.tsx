import { useState, memo } from "react";
import { Trash2, Star, Play } from "lucide-react";
import type { Task } from "../../types";
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
    return (
      <div
        style={{
          ...s.taskCard,
          position: "relative",
          background: selected ? "var(--bg-selected)" : hov ? "var(--bg-hover)" : "transparent",
        }}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        onClick={onClick}
      >
        <div style={{ flexShrink: 0, marginTop: 1 }}>
          <StatusIcon status={task.status} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={s.taskCardTitle}>
            {displayTitle.slice(0, 70)}
            {displayTitle.length > 70 ? "…" : ""}
          </div>
          <div style={s.taskCardSub}>{t(statusLabelKey(task.status))}</div>
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
    );
  },
  (prev, next) =>
    prev.task === next.task &&
    prev.selected === next.selected &&
    (prev.onRunTodo !== undefined) === (next.onRunTodo !== undefined),
);
