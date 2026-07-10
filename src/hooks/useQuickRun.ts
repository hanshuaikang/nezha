import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Task } from "../types";

export interface QuickRunState {
  visible: boolean;
  runId: number;
  cwd: string;
  script: string;
}

export function useQuickRun(projectPath: string) {
  const [script, setScript] = useState("");
  const [state, setState] = useState<QuickRunState>({
    visible: false,
    runId: 0,
    cwd: projectPath,
    script: "",
  });

  const loadScript = useCallback(() => {
    invoke<{ quick_run?: { script?: string } }>("read_project_config", { projectPath })
      .then((cfg) => {
        const nextScript = cfg.quick_run?.script ?? "";
        setScript(nextScript.trim() ? nextScript : "");
      })
      .catch(() => setScript(""));
  }, [projectPath]);

  useEffect(() => {
    loadScript();
  }, [loadScript]);

  const run = useCallback(
    (task: Task) => {
      if (!script.trim()) return;

      setState((prev) => ({
        visible: true,
        runId: prev.runId + 1,
        cwd: task.worktreePath && !task.worktreeDiscarded ? task.worktreePath : projectPath,
        script,
      }));
    },
    [projectPath, script],
  );

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, visible: false }));
  }, []);

  return { script, state, loadScript, run, close };
}
