import type { Task } from "../../types";

export type ProjectStatus = "attention" | "running" | null;

export type ProjectActivity = {
  status: ProjectStatus;
  attentionCount: number;
};

export const EMPTY_PROJECT_ACTIVITY: ProjectActivity = { status: null, attentionCount: 0 };

export function getProjectActivity(
  activityByProjectId: Map<string, ProjectActivity>,
  projectId: string,
): ProjectActivity {
  return activityByProjectId.get(projectId) ?? EMPTY_PROJECT_ACTIVITY;
}

export function buildProjectActivityMap(tasks: Task[]): Map<string, ProjectActivity> {
  const activityByProjectId = new Map<string, ProjectActivity>();
  for (const task of tasks) {
    let activity = activityByProjectId.get(task.projectId);
    if (!activity) {
      activity = { status: null, attentionCount: 0 };
      activityByProjectId.set(task.projectId, activity);
    }

    if (task.status === "input_required") {
      activity.attentionCount += 1;
      activity.status = "attention";
    } else if (task.status === "detached" || task.status === "interrupted") {
      activity.status = "attention";
    } else if ((task.status === "running" || task.status === "pending") && activity.status === null) {
      activity.status = "running";
    }
  }
  return activityByProjectId;
}
