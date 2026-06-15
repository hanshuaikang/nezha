import type { Task, TaskDisplayWindow } from "../../types";

export type TaskListGroupKey =
  | "attention"
  | "pending_merge"
  | "starred"
  | "todo"
  | "today"
  | "earlier";

export interface TaskListGroup {
  key: TaskListGroupKey;
  label: string;
  tasks: Task[];
  showRunTodo: boolean;
}

interface TaskListGroupData {
  key: TaskListGroupKey;
  tasks: Task[];
  showRunTodo: boolean;
}

export interface TaskListLabels {
  attention: string;
  pendingMerge: string;
  starred: string;
  todo: string;
  today: string;
  earlier: string;
}

function needsAttention(task: Task) {
  return (
    task.status === "input_required" || task.status === "detached" || task.status === "interrupted"
  );
}

function pendingMerge(task: Task) {
  return task.status === "done" && !!task.worktreePath && !task.worktreeDiscarded;
}

interface TaskListGroupInput {
  tasks: Task[];
  taskDisplayWindow: TaskDisplayWindow;
  query: string;
  now?: number;
}

const TASK_LIST_LABEL_KEYS: Record<TaskListGroupKey, keyof TaskListLabels> = {
  attention: "attention",
  pending_merge: "pendingMerge",
  starred: "starred",
  todo: "todo",
  today: "today",
  earlier: "earlier",
};

function getTaskListGroupData({
  tasks,
  taskDisplayWindow,
  query,
  now = Date.now(),
}: TaskListGroupInput): TaskListGroupData[] {
  const trimmedQuery = query.trim().toLowerCase();
  const filtered = trimmedQuery
    ? tasks.filter((task) => task.prompt.toLowerCase().includes(trimmedQuery))
    : tasks;

  const sorted = [...filtered].sort((a, b) => {
    const aNeedsAttention = needsAttention(a);
    const bNeedsAttention = needsAttention(b);
    if (aNeedsAttention && !bNeedsAttention) return -1;
    if (!aNeedsAttention && bNeedsAttention) return 1;
    if (aNeedsAttention && bNeedsAttention) {
      return (b.attentionRequestedAt ?? b.createdAt) - (a.attentionRequestedAt ?? a.createdAt);
    }
    return b.createdAt - a.createdAt;
  });

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const todayTs = dayStart.getTime();
  const cutoffTs =
    taskDisplayWindow === "all"
      ? Number.NEGATIVE_INFINITY
      : todayTs - taskDisplayWindow * 24 * 60 * 60 * 1000;

  const attentionTasks: Task[] = [];
  const pendingMergeTasks: Task[] = [];
  const starredTasks: Task[] = [];
  const todoTasks: Task[] = [];
  const todayTasks: Task[] = [];
  const earlierTasks: Task[] = [];

  for (const task of sorted) {
    if (needsAttention(task)) {
      attentionTasks.push(task);
    } else if (pendingMerge(task)) {
      pendingMergeTasks.push(task);
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

  const groups: TaskListGroupData[] = [];
  const appendGroup = (key: TaskListGroupKey, groupTasks: Task[], showRunTodo = false) => {
    if (groupTasks.length === 0) return;
    groups.push({ key, tasks: groupTasks, showRunTodo });
  };

  appendGroup("attention", attentionTasks);
  appendGroup("pending_merge", pendingMergeTasks);
  appendGroup("starred", starredTasks);
  appendGroup("todo", todoTasks, true);
  appendGroup("today", todayTasks);
  appendGroup("earlier", earlierTasks);

  return groups;
}

export function getTaskListGroups({
  labels,
  ...input
}: TaskListGroupInput & { labels: TaskListLabels }): TaskListGroup[] {
  return getTaskListGroupData(input).map((group) => ({
    ...group,
    label: labels[TASK_LIST_LABEL_KEYS[group.key]],
  }));
}

export function getTaskListShortcutTasks(input: TaskListGroupInput): Task[] {
  return getTaskListGroupData(input).flatMap((group) => group.tasks);
}
