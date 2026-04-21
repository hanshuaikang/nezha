import { useState, memo } from "react";
import { Trash2, Star, Play } from "lucide-react";
import type { Task } from "../../types";
import { STATUS_LABEL } from "../../types";
import { StatusIcon } from "../StatusIcon";
import s from "../../styles";

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
    const [hov, setHov] = useState(false);
    const displayTitle = task.name ?? task.prompt;
    return (
      <div
        style={{
          ...s.taskCard,
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
          <div style={s.taskCardSub}>{STATUS_LABEL[task.status]}</div>
        </div>
        <button
          type="button"
          aria-label={task.starred ? "Unstar task" : "Star task"}
          title={task.starred ? "Unstar task" : "Star task"}
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
            aria-label="Run Now"
            title="Run Now"
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
          aria-label="Delete task"
          title="Delete task"
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
