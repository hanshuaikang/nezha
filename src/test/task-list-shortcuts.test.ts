import { describe, expect, test } from "vitest";
import type { Task } from "../types";
import {
  buildTaskListRows,
  getTaskListShortcutIds,
  type TaskListLabels,
} from "../components/task-panel/TaskList";

const labels: TaskListLabels = {
  needsAttention: "Needs Attention",
  pendingMerge: "Pending Merge",
  starred: "Starred",
  todo: "Todo",
  today: "Today",
  earlier: "Earlier",
};

function task(id: string, patch: Partial<Task>): Task {
  return {
    id,
    projectId: "p1",
    prompt: id,
    agent: "claude",
    permissionMode: "ask",
    status: "done",
    createdAt: Date.UTC(2026, 5, 7, 12),
    ...patch,
  };
}

describe("task list shortcut slots", () => {
  test("uses the same grouped order as the rendered task list", () => {
    const now = Date.UTC(2026, 5, 7, 18);
    const rows = buildTaskListRows({
      tasks: [
        task("today", { createdAt: Date.UTC(2026, 5, 7, 9) }),
        task("attention-old", {
          status: "input_required",
          attentionRequestedAt: Date.UTC(2026, 5, 7, 8),
        }),
        task("starred", { starred: true }),
        task("todo", { status: "todo" }),
        task("pending-merge", { worktreePath: "/tmp/wt", worktreeDiscarded: false }),
        task("earlier", { createdAt: Date.UTC(2026, 5, 3, 10) }),
        task("attention-new", {
          status: "detached",
          attentionRequestedAt: Date.UTC(2026, 5, 7, 10),
        }),
      ],
      taskDisplayWindow: "all",
      query: "",
      labels,
      now,
    });

    expect(getTaskListShortcutIds(rows)).toEqual([
      "attention-new",
      "attention-old",
      "pending-merge",
      "starred",
      "todo",
      "today",
      "earlier",
    ]);
  });

  test("follows the active task search filter and caps slots at nine", () => {
    const rows = buildTaskListRows({
      tasks: Array.from({ length: 12 }, (_, index) =>
        task(`match-${index + 1}`, {
          prompt: index < 10 ? `needle ${index + 1}` : `other ${index + 1}`,
          createdAt: Date.UTC(2026, 5, 7, index),
        }),
      ),
      taskDisplayWindow: "all",
      query: "needle",
      labels,
      now: Date.UTC(2026, 5, 7, 18),
    });

    expect(getTaskListShortcutIds(rows)).toEqual([
      "match-10",
      "match-9",
      "match-8",
      "match-7",
      "match-6",
      "match-5",
      "match-4",
      "match-3",
      "match-2",
    ]);
  });
});
