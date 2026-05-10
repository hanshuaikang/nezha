import { useCallback, useLayoutEffect, useMemo, useRef, useState, type UIEvent } from "react";
import type { Task, TaskDisplayWindow } from "../../types";
import { TaskListItem } from "./TaskListItem";
import { useI18n } from "../../i18n";
import s from "../../styles";

const GROUP_ROW_HEIGHT = 27;
const TASK_ROW_HEIGHT = 47;
const OVERSCAN_ROWS = 8;

type VirtualRow =
  | { type: "group"; key: string; label: string; height: number }
  | { type: "task"; key: string; task: Task; showRunTodo: boolean; height: number };

function findRowIndex(offsets: number[], value: number) {
  if (offsets.length <= 1) return 0;

  let low = 0;
  let high = offsets.length - 2;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (offsets[mid + 1] < value) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

export function TaskList({
  tasks,
  taskDisplayWindow,
  query,
  selectedId,
  isNewTask,
  onSelectTask,
  onDeleteTask,
  onToggleTaskStar,
  onRunTodo,
}: {
  tasks: Task[];
  taskDisplayWindow: TaskDisplayWindow;
  query: string;
  selectedId: string | null;
  isNewTask: boolean;
  onSelectTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onToggleTaskStar: (id: string) => void;
  onRunTodo: (task: Task) => void;
}) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const updateViewportHeight = () => setViewportHeight(el.clientHeight);
    updateViewportHeight();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateViewportHeight);
      return () => window.removeEventListener("resize", updateViewportHeight);
    }

    const resizeObserver = new ResizeObserver(updateViewportHeight);
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, []);

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return tasks;
    const q = query.toLowerCase();
    return tasks.filter((t) => t.prompt.toLowerCase().includes(q));
  }, [tasks, query]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aNeedsAttention =
        a.status === "input_required" || a.status === "detached" || a.status === "interrupted";
      const bNeedsAttention =
        b.status === "input_required" || b.status === "detached" || b.status === "interrupted";
      if (aNeedsAttention && !bNeedsAttention) return -1;
      if (!aNeedsAttention && bNeedsAttention) return 1;
      if (aNeedsAttention && bNeedsAttention) {
        return (b.attentionRequestedAt ?? b.createdAt) - (a.attentionRequestedAt ?? a.createdAt);
      }
      return b.createdAt - a.createdAt;
    });
  }, [filtered]);

  const { todayTs, cutoffTs } = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const todayTs = d.getTime();
    const cutoffTs =
      taskDisplayWindow === "all"
        ? Number.NEGATIVE_INFINITY
        : todayTs - taskDisplayWindow * 24 * 60 * 60 * 1000;
    return { todayTs, cutoffTs };
  }, [taskDisplayWindow]);

  const rows = useMemo<VirtualRow[]>(() => {
    const attentionTasks: Task[] = [];
    const starredTasks: Task[] = [];
    const todoTasks: Task[] = [];
    const todayTasks: Task[] = [];
    const earlierTasks: Task[] = [];

    for (const task of sorted) {
      if (
        task.status === "input_required" ||
        task.status === "detached" ||
        task.status === "interrupted"
      ) {
        attentionTasks.push(task);
      } else if (task.starred) {
        starredTasks.push(task);
      } else if (task.status === "todo") {
        todoTasks.push(task);
      } else if (task.createdAt >= todayTs) {
        todayTasks.push(task);
      } else if (task.createdAt >= cutoffTs) {
        earlierTasks.push(task);
      }
    }

    const nextRows: VirtualRow[] = [];
    const appendGroup = (key: string, label: string, groupTasks: Task[], showRunTodo = false) => {
      if (groupTasks.length === 0) return;
      nextRows.push({ type: "group", key, label, height: GROUP_ROW_HEIGHT });
      groupTasks.forEach((task) => {
        nextRows.push({
          type: "task",
          key: task.id,
          task,
          showRunTodo: showRunTodo || task.status === "todo",
          height: TASK_ROW_HEIGHT,
        });
      });
    };

    appendGroup("attention", t("task.needsAttention"), attentionTasks);
    appendGroup("starred", t("task.starred"), starredTasks);
    appendGroup("todo", t("status.todo"), todoTasks, true);
    appendGroup("today", t("task.today"), todayTasks);
    appendGroup("earlier", t("task.earlier"), earlierTasks);

    return nextRows;
  }, [cutoffTs, sorted, t, todayTs]);

  const offsets = useMemo(() => {
    const nextOffsets = [0];
    for (const row of rows) {
      nextOffsets.push(nextOffsets[nextOffsets.length - 1] + row.height);
    }
    return nextOffsets;
  }, [rows]);

  const totalHeight = offsets[offsets.length - 1] ?? 0;
  const startIndex = Math.max(0, findRowIndex(offsets, scrollTop) - OVERSCAN_ROWS);
  const endIndex = Math.min(
    rows.length,
    findRowIndex(offsets, scrollTop + viewportHeight) + OVERSCAN_ROWS + 1,
  );
  const visibleRows = rows.slice(startIndex, endIndex);

  return (
    <div ref={scrollRef} style={s.taskListScroll} onScroll={handleScroll}>
      {tasks.length === 0 && <div style={s.taskListEmpty}>{t("task.noTasksYet")}</div>}
      <div style={{ height: totalHeight, position: "relative" }}>
        {visibleRows.map((row, visibleIndex) => {
          const rowIndex = startIndex + visibleIndex;
          const top = offsets[rowIndex] ?? 0;

          return (
            <div
              key={row.key}
              style={{
                position: "absolute",
                top,
                left: 0,
                right: 0,
                height: row.height,
                overflow: "hidden",
              }}
            >
              {row.type === "group" ? (
                <div style={s.groupLabel}>{row.label}</div>
              ) : (
                <TaskListItem
                  task={row.task}
                  selected={selectedId === row.task.id && !isNewTask}
                  onClick={() => onSelectTask(row.task.id)}
                  onDelete={() => onDeleteTask(row.task.id)}
                  onToggleStar={() => onToggleTaskStar(row.task.id)}
                  onRunTodo={row.showRunTodo ? () => onRunTodo(row.task) : undefined}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
