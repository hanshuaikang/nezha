import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef } from "react";
import type { Project, Task } from "../types";

interface Args {
  projects: Project[];
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  persistTasks: (projectId: string, allTasks: Task[]) => void;
}

/**
 * worktree 任务转为 `done` 时拉取相对 base 的 +/− 行数并写回 Task。
 * 仅对未丢弃且未算过的 worktree 任务触发，并用 pendingRef 去重，避免事件重发或 StrictMode 重复调用。
 */
export function useWorktreeDiffStats({ projects, tasks, setTasks, persistTasks }: Args) {
  // task-status 事件监听器在 mount 时一次性挂载，闭包会捕获到首次渲染的 projects/tasks。
  // 用 ref 让事件路径能拿到最新值（diff-stats 需要 projectPath 反查、需要 task 当前 worktree 字段）。
  const projectsRef = useRef(projects);
  const tasksRef = useRef(tasks);
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const pendingRef = useRef<Set<string>>(new Set());

  const scheduleForDoneTask = useCallback(
    (taskId: string) => {
      const task = tasksRef.current.find((t) => t.id === taskId);
      if (!task) return;
      if (!task.worktreePath || !task.baseBranch) return;
      if (task.worktreeDiscarded) return;
      // 两者都已写入才算"算过"，避免历史半残数据（只有 additions 或只有 deletions）永远显示 0
      if (task.additions !== undefined && task.deletions !== undefined) return;
      if (pendingRef.current.has(task.id)) return;
      const project = projectsRef.current.find((p) => p.id === task.projectId);
      if (!project) return;

      pendingRef.current.add(task.id);
      invoke<{ additions: number; deletions: number }>("worktree_diff_stats", {
        projectPath: project.path,
        repoPath: task.worktreeRepo ?? project.path,
        worktreePath: task.worktreePath,
        baseBranch: task.baseBranch,
      })
        .then(({ additions, deletions }) => {
          setTasks((prev) => {
            let changed = false;
            const next = prev.map((t) => {
              if (t.id !== task.id) return t;
              if (t.additions === additions && t.deletions === deletions) return t;
              changed = true;
              return { ...t, additions, deletions };
            });
            if (changed) persistTasks(task.projectId, next);
            return changed ? next : prev;
          });
        })
        .catch((e: unknown) => {
          // 状态已 done，不打扰用户；但记录日志便于排查 merge-base / 路径 / git 错误
          console.warn(`[worktree-diff-stats] task ${task.id} failed:`, e);
        })
        .finally(() => {
          pendingRef.current.delete(task.id);
        });
    },
    [setTasks, persistTasks],
  );

  return { scheduleForDoneTask };
}
