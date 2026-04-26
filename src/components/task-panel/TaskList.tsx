import { useMemo } from "react";
import type { Task } from "../../types";
import { TaskListItem } from "./TaskListItem";
import { useI18n } from "../../i18n";
import s from "../../styles";

export function TaskList({
  tasks,
  query,
  selectedId,
  isNewTask,
  onSelectTask,
  onDeleteTask,
  onToggleTaskStar,
  onRunTodo,
}: {
  tasks: Task[];
  query: string;
  selectedId: string | null;
  isNewTask: boolean;
  onSelectTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onToggleTaskStar: (id: string) => void;
  onRunTodo: (task: Task) => void;
}) {
  const { t } = useI18n();
  const filtered = useMemo(() => {
    if (!query.trim()) return tasks;
    const q = query.toLowerCase();
    return tasks.filter((t) => t.prompt.toLowerCase().includes(q));
  }, [tasks, query]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.status === "input_required" && b.status !== "input_required") return -1;
      if (a.status !== "input_required" && b.status === "input_required") return 1;
      if (a.status === "input_required" && b.status === "input_required") {
        return (b.attentionRequestedAt ?? b.createdAt) - (a.attentionRequestedAt ?? a.createdAt);
      }
      return b.createdAt - a.createdAt;
    });
  }, [filtered]);

  const { todayTs, threeDaysAgoTs } = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const todayTs = d.getTime();
    return { todayTs, threeDaysAgoTs: todayTs - 3 * 24 * 60 * 60 * 1000 };
  }, []);
  const attentionTasks = sorted.filter((t) => t.status === "input_required");
  const starredTasks = sorted.filter((t) => t.starred && t.status !== "input_required");
  const todoTasks = sorted.filter((t) => t.status === "todo" && !t.starred);
  const regularTasks = sorted.filter(
    (t) => t.status !== "input_required" && t.status !== "todo" && !t.starred,
  );
  const todayTasks = regularTasks.filter((t) => t.createdAt >= todayTs);
  const earlierTasks = regularTasks.filter(
    (t) => t.createdAt >= threeDaysAgoTs && t.createdAt < todayTs,
  );

  function renderGroup(label: string, groupTasks: Task[], showRunTodo?: boolean) {
    if (groupTasks.length === 0) return null;
    return (
      <>
        <div style={s.groupLabel}>{label}</div>
        {groupTasks.map((t) => (
          <TaskListItem
            key={t.id}
            task={t}
            selected={selectedId === t.id && !isNewTask}
            onClick={() => onSelectTask(t.id)}
            onDelete={() => onDeleteTask(t.id)}
            onToggleStar={() => onToggleTaskStar(t.id)}
            onRunTodo={showRunTodo || t.status === "todo" ? () => onRunTodo(t) : undefined}
          />
        ))}
      </>
    );
  }

  return (
    <div style={s.taskListScroll}>
      {tasks.length === 0 && <div style={s.taskListEmpty}>{t("task.noTasksYet")}</div>}
      {renderGroup(t("task.needsAttention"), attentionTasks)}
      {renderGroup(t("task.starred"), starredTasks)}
      {renderGroup(t("status.todo"), todoTasks, true)}
      {renderGroup(t("task.today"), todayTasks)}
      {renderGroup(t("task.earlier"), earlierTasks)}
    </div>
  );
}
