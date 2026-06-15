import { useCallback, useLayoutEffect, useMemo, useRef, useState, type UIEvent } from "react";
import type { Task, TaskDisplayWindow } from "../../types";
import { TaskListItem } from "./TaskListItem";
import { getTaskListGroups } from "./taskListModel";
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

  const labels = useMemo(
    () => ({
      attention: t("task.needsAttention"),
      pendingMerge: t("task.pendingMerge"),
      starred: t("task.starred"),
      todo: t("status.todo"),
      today: t("task.today"),
      earlier: t("task.earlier"),
    }),
    [t],
  );

  const rows = useMemo<VirtualRow[]>(() => {
    const nextRows: VirtualRow[] = [];
    const groups = getTaskListGroups({ tasks, taskDisplayWindow, query, labels });
    groups.forEach((group) => {
      nextRows.push({
        type: "group",
        key: group.key,
        label: group.label,
        height: GROUP_ROW_HEIGHT,
      });
      group.tasks.forEach((task) => {
        nextRows.push({
          type: "task",
          key: task.id,
          task,
          showRunTodo: group.showRunTodo || task.status === "todo",
          height: TASK_ROW_HEIGHT,
        });
      });
    });

    return nextRows;
  }, [labels, query, taskDisplayWindow, tasks]);

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
