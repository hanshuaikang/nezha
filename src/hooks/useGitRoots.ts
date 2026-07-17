import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { GitRoot } from "../types";
import { load, save } from "../utils";

const STORAGE_PREFIX = "nezha.gitRoot.";
const FS_CHANGED_EVENT = "fs-changed";

interface UseGitRoots {
  roots: GitRoot[];
  selectedRoot: GitRoot | null;
  setSelectedRoot: (path: string) => void;
  refresh: () => Promise<void>;
}

interface GitContextTask {
  worktreePath?: string;
  worktreeRepo?: string;
  worktreeDiscarded?: boolean;
}

export interface ProjectGitContext {
  /** RepoSelector 展示的主仓路径。 */
  displayedRepoPath: string;
  /** Git 命令的实际 cwd；活动 worktree 任务中为 worktreePath。 */
  commandRepoPath: string;
  /** worktree 任务选中时不允许切换到无关 sub-repo。 */
  selectionLocked: boolean;
}

export function resolveProjectGitContext(
  projectPath: string,
  selectedRootPath: string | null,
  task: GitContextTask | null,
): ProjectGitContext {
  const fallbackRepoPath = selectedRootPath ?? projectPath;
  if (!task?.worktreePath) {
    return {
      displayedRepoPath: fallbackRepoPath,
      commandRepoPath: fallbackRepoPath,
      selectionLocked: false,
    };
  }

  const displayedRepoPath = task.worktreeRepo ?? projectPath;
  return {
    displayedRepoPath,
    commandRepoPath: task.worktreeDiscarded ? displayedRepoPath : task.worktreePath,
    selectionLocked: true,
  };
}

/** 发现 project 下的所有 git 根（单仓库 / 多仓库工作区 / 非 git）。
 *
 *  当前选中的 root 持久化到 localStorage（per projectId）。后端命令的 repoPath 应取
 *  selectedRoot?.path——单仓库时即 project.path，多仓库时为用户选中的 sub-repo。
 */
export function useGitRoots(projectId: string, projectPath: string, active = true): UseGitRoots {
  const [roots, setRoots] = useState<GitRoot[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const refreshSequenceRef = useRef(0);

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequenceRef.current;
    try {
      const result = await invoke<GitRoot[]>("discover_git_roots", { projectPath });
      if (refreshSequenceRef.current !== sequence) return;
      setRoots(result);
      const saved = load<string | null>(STORAGE_PREFIX + projectId, null);
      const validSaved = saved && result.some((r) => r.path === saved) ? saved : null;
      const next = validSaved ?? result[0]?.path ?? null;
      setSelectedPath(next);
      if (next && next !== saved) {
        save(STORAGE_PREFIX + projectId, next);
      }
    } catch {
      if (refreshSequenceRef.current !== sequence) return;
      setRoots([]);
      setSelectedPath(null);
    }
  }, [projectId, projectPath]);

  useEffect(() => {
    if (!active) return;
    void refresh();
  }, [active, refresh]);

  useEffect(() => {
    if (!active) return;

    const handleVisibilityRefresh = () => {
      if (document.visibilityState !== "visible") return;
      void refresh();
    };

    window.addEventListener("focus", handleVisibilityRefresh);
    document.addEventListener("visibilitychange", handleVisibilityRefresh);
    return () => {
      window.removeEventListener("focus", handleVisibilityRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityRefresh);
    };
  }, [active, refresh]);

  useEffect(() => {
    if (!active) return;

    const watchPromise = invoke<boolean>("watch_dir", {
      path: projectPath,
      projectPath,
    }).catch(() => false);
    const unlistenPromise = listen<{ dir: string }>(FS_CHANGED_EVENT, (event) => {
      if (event.payload.dir !== projectPath) return;
      void refresh();
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
      void watchPromise
        .then((watching) => {
          if (watching) return invoke("unwatch_dir", { path: projectPath });
        })
        .catch(() => {});
    };
  }, [active, projectPath, refresh]);

  const setSelectedRoot = useCallback(
    (path: string) => {
      setSelectedPath(path);
      save(STORAGE_PREFIX + projectId, path);
    },
    [projectId],
  );

  const selectedRoot = roots.find((r) => r.path === selectedPath) ?? null;

  return { roots, selectedRoot, setSelectedRoot, refresh };
}
