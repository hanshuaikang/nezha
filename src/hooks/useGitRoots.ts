import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { GitRoot } from "../types";
import { load, save } from "../utils";

const STORAGE_PREFIX = "nezha.gitRoot.";

interface UseGitRoots {
  roots: GitRoot[];
  selectedRoot: GitRoot | null;
  setSelectedRoot: (path: string) => void;
  refresh: () => Promise<void>;
}

/** 发现 project 下的所有 git 根（单仓库 / 多仓库工作区 / 非 git）。
 *
 *  当前选中的 root 持久化到 localStorage（per projectId）。后端命令的 repoPath 应取
 *  selectedRoot?.path——单仓库时即 project.path，多仓库时为用户选中的 sub-repo。
 */
export function useGitRoots(projectId: string, projectPath: string): UseGitRoots {
  const [roots, setRoots] = useState<GitRoot[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await invoke<GitRoot[]>("discover_git_roots", { projectPath });
      setRoots(result);
      const saved = load<string | null>(STORAGE_PREFIX + projectId, null);
      const validSaved = saved && result.some((r) => r.path === saved) ? saved : null;
      const next = validSaved ?? result[0]?.path ?? null;
      setSelectedPath(next);
      if (next && next !== saved) {
        save(STORAGE_PREFIX + projectId, next);
      }
    } catch {
      setRoots([]);
      setSelectedPath(null);
    }
  }, [projectId, projectPath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
