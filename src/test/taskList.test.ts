import { describe, expect, it } from "vitest";
import { groupTasksForTaskList } from "../components/task-panel/TaskList";
import type { Task } from "../types";

function task(id: string, createdAt: number, status: Task["status"] = "done"): Task {
  return {
    id,
    projectId: "project-1",
    prompt: id,
    agent: "codex",
    permissionMode: "ask",
    status,
    createdAt,
  };
}

describe("groupTasksForTaskList", () => {
  it("keeps tasks older than three days visible in the older group", () => {
    const todayTs = new Date("2026-05-26T00:00:00Z").getTime();
    const threeDaysAgoTs = todayTs - 3 * 24 * 60 * 60 * 1000;
    const older = task("older", new Date("2026-05-18T09:00:00Z").getTime());

    const groups = groupTasksForTaskList([older], todayTs, threeDaysAgoTs);

    expect(groups.olderTasks).toEqual([older]);
  });
});
