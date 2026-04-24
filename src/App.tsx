import { useState, useEffect, useMemo, useCallback } from "react";
import { open as openDialog, confirm } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Project, Task, TaskStatus, AgentType, PermissionMode, ThemeMode } from "./types";
import { isActiveTaskStatus } from "./types";
import { WelcomePage } from "./components/WelcomePage";
import { ProjectPage } from "./components/ProjectPage";
import { useToast } from "./components/Toast";
import { useTerminalManager } from "./hooks/useTerminalManager";
import s from "./styles";
import "./App.css";

function deriveProjectName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  if (!trimmed) return path;

  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function persistProjects(projects: Project[], onError: (msg: string) => void) {
  invoke("save_projects", { projects }).catch((e: unknown) => {
    console.error(e);
    onError(`保存项目列表失败：${String(e)}`);
  });
}

function persistProjectTasks(projectId: string, allTasks: Task[], onError: (msg: string) => void) {
  invoke("save_project_tasks", {
    projectId,
    tasks: allTasks.filter((t) => t.projectId === projectId),
  }).catch((e: unknown) => {
    console.error(e);
    onError(`保存任务失败（项目 ${projectId}）：${String(e)}`);
  });
}

interface ProjectViewState {
  selectedTaskId: string | null;
  isNewTask: boolean;
}

function createDefaultProjectViewState(): ProjectViewState {
  return { selectedTaskId: null, isNewTask: true };
}

function reconcileRecoveredTasks(loadedTasks: Task[]): Task[] {
  return loadedTasks.map((task) => {
    if (!isActiveTaskStatus(task.status)) {
      return task;
    }

    return {
      ...task,
      status: "cancelled",
      attentionRequestedAt: undefined,
    };
  });
}

function applyRecoveredSessionPaths(tasks: Task[], resolvedPaths: Record<string, string>): Task[] {
  let changed = false;
  const next = tasks.map((task) => {
    const resolvedPath = resolvedPaths[task.id];
    if (!resolvedPath) {
      return task;
    }
    if (task.agent === "codex") {
      if (task.codexSessionPath === resolvedPath) {
        return task;
      }
      changed = true;
      return { ...task, codexSessionPath: resolvedPath };
    }
    if (task.claudeSessionPath === resolvedPath) {
      return task;
    }
    changed = true;
    return { ...task, claudeSessionPath: resolvedPath };
  });
  return changed ? next : tasks;
}

interface RecoveredCodexSession {
  taskId: string;
  sessionId: string;
  sessionPath: string;
  startedAt: number;
  deltaMs: number;
}

interface AppSettingsLite {
  enable_session_backfill?: boolean;
}

function applyRecoveredCodexSessions(
  tasks: Task[],
  recovered: Record<string, { sessionId: string; sessionPath: string }>,
): Task[] {
  let changed = false;
  const next = tasks.map((task) => {
    if (task.agent !== "codex") {
      return task;
    }
    const recoveredSession = recovered[task.id];
    if (!recoveredSession) {
      return task;
    }
    if (
      task.codexSessionId === recoveredSession.sessionId &&
      task.codexSessionPath === recoveredSession.sessionPath
    ) {
      return task;
    }
    changed = true;
    return {
      ...task,
      codexSessionId: recoveredSession.sessionId,
      codexSessionPath: recoveredSession.sessionPath,
    };
  });
  return changed ? next : tasks;
}

function getSystemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getInitialThemeMode(): ThemeMode {
  const stored = localStorage.getItem("nezha:theme");
  return stored === "dark" || stored === "light" || stored === "system" ? stored : "system";
}

function App() {
  const { showToast } = useToast();

  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialThemeMode);
  const [systemPrefersDark, setSystemPrefersDark] = useState(getSystemPrefersDark);
  const isDark = themeMode === "system" ? systemPrefersDark : themeMode === "dark";
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [projectViews, setProjectViews] = useState<Record<string, ProjectViewState>>({});
  const [mountedProjectIds, setMountedProjectIds] = useState<string[]>([]);
  const [taskRunCounts, setTaskRunCounts] = useState<Record<string, number>>({});

  const tm = useTerminalManager();

  const mountProject = useCallback((projectId: string) => {
    setMountedProjectIds((prev) => (prev.includes(projectId) ? prev : [...prev, projectId]));
  }, []);

  const updateProjectView = useCallback((projectId: string, patch: Partial<ProjectViewState>) => {
    setProjectViews((prev) => ({
      ...prev,
      [projectId]: {
        ...createDefaultProjectViewState(),
        ...prev[projectId],
        ...patch,
      },
    }));
  }, []);

  const clearProjectView = useCallback((projectId: string) => {
    setProjectViews((prev) => {
      if (!(projectId in prev)) return prev;
      const next = { ...prev };
      delete next[projectId];
      return next;
    });
  }, []);

  function getProjectView(projectId: string): ProjectViewState {
    return projectViews[projectId] ?? createDefaultProjectViewState();
  }

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);

    setSystemPrefersDark(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("nezha:theme", themeMode);
  }, [isDark, themeMode]);

  useEffect(() => {
    getCurrentWindow()
      .setTheme(themeMode === "system" ? null : themeMode)
      .catch(console.error);
  }, [themeMode]);

  const handleToggleTheme = useCallback(() => {
    setThemeMode((currentMode) => {
      const currentlyDark =
        currentMode === "system" ? systemPrefersDark : currentMode === "dark";
      return currentlyDark ? "light" : "dark";
    });
  }, [systemPrefersDark]);

  useEffect(() => {
    async function init() {
      const appSettings = await invoke<AppSettingsLite>("load_app_settings").catch(
        () => ({ enable_session_backfill: false }),
      );
      const enableSessionBackfill = appSettings.enable_session_backfill === true;

      // Load projects from ~/.nezha/projects.json
      const loadedProjects = await invoke<Project[]>("load_projects");
      setProjects(loadedProjects);

      // Load tasks for all known projects
      const chunks = await Promise.all(
        loadedProjects.map((p) => invoke<Task[]>("load_project_tasks", { projectId: p.id })),
      );
      const loadedTasks = chunks.flat();
      const reconciledTasks = reconcileRecoveredTasks(loadedTasks);
      let hydratedTasks = reconciledTasks;

      const dirtyProjectIds = new Set<string>();
      for (let i = 0; i < loadedTasks.length; i++) {
        if (loadedTasks[i].status !== reconciledTasks[i].status) {
          dirtyProjectIds.add(loadedTasks[i].projectId);
        }
      }

      const sessionLookupTasks = reconciledTasks.filter((task) => {
        const sessionId = task.agent === "codex" ? task.codexSessionId : task.claudeSessionId;
        const sessionPath = task.agent === "codex" ? task.codexSessionPath : task.claudeSessionPath;
        return Boolean(sessionId && !sessionPath);
      });
      if (sessionLookupTasks.length > 0) {
        const resolvedEntries = await Promise.all(
          sessionLookupTasks.map(async (task) => {
            const sessionId =
              task.agent === "codex" ? task.codexSessionId ?? "" : task.claudeSessionId ?? "";
            const projectPath =
              loadedProjects.find((project) => project.id === task.projectId)?.path ?? "";
            const sessionPath = await invoke<string | null>("resolve_session_path", {
              projectPath,
              agent: task.agent,
              sessionId,
            }).catch(() => null);
            return [task.id, sessionPath ?? ""] as const;
          }),
        );
        const resolvedPaths = Object.fromEntries(
          resolvedEntries.filter(([, sessionPath]) => Boolean(sessionPath)),
        );
        hydratedTasks = applyRecoveredSessionPaths(reconciledTasks, resolvedPaths);
        for (let i = 0; i < reconciledTasks.length; i++) {
          const prevPath =
            reconciledTasks[i].agent === "codex"
              ? reconciledTasks[i].codexSessionPath
              : reconciledTasks[i].claudeSessionPath;
          const nextPath =
            hydratedTasks[i].agent === "codex"
              ? hydratedTasks[i].codexSessionPath
              : hydratedTasks[i].claudeSessionPath;
          if (prevPath !== nextPath) {
            dirtyProjectIds.add(reconciledTasks[i].projectId);
          }
        }
      }

      if (enableSessionBackfill) {
        const codexSessionBackfillByProject = new Map<string, Task[]>();
        for (const task of hydratedTasks) {
          if (
            task.agent !== "codex" ||
            task.status === "todo" ||
            isActiveTaskStatus(task.status) ||
            task.codexSessionId ||
            task.codexSessionPath
          ) {
            continue;
          }
          const group = codexSessionBackfillByProject.get(task.projectId) ?? [];
          group.push(task);
          codexSessionBackfillByProject.set(task.projectId, group);
        }
        if (codexSessionBackfillByProject.size > 0) {
          const recoveredSessions: Record<string, { sessionId: string; sessionPath: string }> = {};
          const recoveredGroups = await Promise.all(
            Array.from(codexSessionBackfillByProject.entries()).map(
              async ([projectId, projectTasks]) => {
                const projectPath =
                  loadedProjects.find((project) => project.id === projectId)?.path ?? "";
                const recovered = await invoke<RecoveredCodexSession[]>(
                  "recover_codex_sessions_for_tasks",
                  {
                    projectPath,
                    tasks: projectTasks.map((task) => ({
                      taskId: task.id,
                      createdAt: task.createdAt,
                    })),
                  },
                ).catch(() => []);
                return recovered;
              },
            ),
          );
          for (const recovered of recoveredGroups) {
            for (const item of recovered) {
              recoveredSessions[item.taskId] = {
                sessionId: item.sessionId,
                sessionPath: item.sessionPath,
              };
            }
          }

          const previousTasks = hydratedTasks;
          hydratedTasks = applyRecoveredCodexSessions(hydratedTasks, recoveredSessions);
          for (let i = 0; i < previousTasks.length; i++) {
            if (
              previousTasks[i].codexSessionId !== hydratedTasks[i].codexSessionId ||
              previousTasks[i].codexSessionPath !== hydratedTasks[i].codexSessionPath
            ) {
              dirtyProjectIds.add(previousTasks[i].projectId);
            }
          }
        }
      }

      setTasks(hydratedTasks);

      for (const projectId of dirtyProjectIds) {
        persistProjectTasks(projectId, hydratedTasks, showToast);
      }
    }

    init().catch(console.error);
  }, [showToast]);

  // Tauri event listeners (agent-output is handled inside useTerminalManager)
  useEffect(() => {
    const p1 = listen<{ task_id: string; status: TaskStatus; failure_reason?: string }>(
      "task-status",
      (e) => {
        const { task_id, status, failure_reason } = e.payload;
        updateTaskStatus(task_id, status, undefined, failure_reason);
        if (!isActiveTaskStatus(status)) {
          tm.removeTaskBuffers([task_id]);
        }
      },
    );
    const p2 = listen<{ task_id: string; session_id: string; session_path: string }>(
      "task-session",
      (e) => {
        const { task_id, session_id, session_path } = e.payload;
        updateTaskSession(task_id, session_id, session_path);
      },
    );
    return () => {
      p1.then((fn) => fn());
      p2.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleOpen() {
    const selected = await openDialog({ directory: true, multiple: false });
    if (!selected) return;
    const path = selected as string;
    const name = deriveProjectName(path);
    const project: Project = { id: `${Date.now()}`, name, path, lastOpenedAt: Date.now() };
    setProjects((prev) => {
      const next = [project, ...prev.filter((p) => p.path !== path)];
      persistProjects(next, showToast);
      return next;
    });
    setActiveProject(project);
    mountProject(project.id);
    updateProjectView(project.id, createDefaultProjectViewState());
    invoke("init_project_config", { projectPath: path }).catch((e: unknown) => {
      showToast(`Failed to initialize project config: ${String(e)}`, "warning");
    });
  }

  function handleProjectClick(project: Project) {
    const updated = { ...project, lastOpenedAt: Date.now() };
    setProjects((prev) => {
      const next = prev.map((p) => (p.id === project.id ? updated : p));
      persistProjects(next, showToast);
      return next;
    });
    setActiveProject(updated);
    mountProject(updated.id);
    invoke("init_project_config", { projectPath: project.path }).catch((e: unknown) => {
      showToast(`Failed to initialize project config: ${String(e)}`, "warning");
    });
  }

  function handleBack() {
    setActiveProject(null);
  }

  function invokeRunTask(task: Task, projectPath: string, images: string[]) {
    invoke("run_task", {
      taskId: task.id,
      projectPath,
      prompt: task.prompt,
      agent: task.agent,
      permissionMode: task.permissionMode,
      images,
      cols: tm.terminalSizeRef.current.cols,
      rows: tm.terminalSizeRef.current.rows,
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      tm.writeErrorToTerminal(task.id, `\r\nError: ${msg}\r\n`);
      updateTaskStatus(task.id, "failed", undefined, msg);
    });
  }

  function handleSubmitTask(
    project: Project,
    {
      prompt,
      agent,
      permissionMode,
      images,
      immediate,
    }: {
      prompt: string;
      agent: AgentType;
      permissionMode: PermissionMode;
      images: string[];
      immediate: boolean;
    },
  ) {
    const task: Task = {
      id: `${Date.now()}`,
      projectId: project.id,
      prompt,
      agent,
      permissionMode,
      status: immediate ? "pending" : "todo",
      createdAt: Date.now(),
    };
    setTasks((prev) => {
      const next = [task, ...prev];
      persistProjectTasks(task.projectId, next, showToast);
      return next;
    });
    setActiveProject(project);
    mountProject(project.id);
    updateProjectView(project.id, { selectedTaskId: task.id, isNewTask: false });

    if (!immediate) return;

    tm.resetTaskTerminal(task.id);
    invokeRunTask(task, project.path, images);
  }

  function handleRunTodoTask(task: Task) {
    const project = projects.find((p) => p.id === task.projectId);
    if (!project) return;

    setTasks((prev) => {
      const next = prev.map((t) =>
        t.id === task.id
          ? { ...t, status: "pending" as TaskStatus, attentionRequestedAt: undefined }
          : t,
      );
      persistProjectTasks(task.projectId, next, showToast);
      return next;
    });
    tm.resetTaskTerminal(task.id);
    updateProjectView(task.projectId, { selectedTaskId: task.id, isNewTask: false });
    invokeRunTask(task, project.path, []);
  }

  function handleCancelTask(taskId: string) {
    const task = tasks.find((t) => t.id === taskId);
    const project = projects.find((p) => p.id === task?.projectId);
    invoke("cancel_task", { taskId, projectPath: project?.path ?? "" }).catch((e: unknown) => {
      showToast(`Failed to cancel task: ${String(e)}`);
    });
  }

  function handleResumeTask(taskId: string) {
    const task = tasks.find((t) => t.id === taskId);
    const sessionId = task?.agent === "codex" ? task.codexSessionId : task?.claudeSessionId;
    if (!task || !sessionId) return;
    const project = projects.find((p) => p.id === task.projectId);
    if (!project) return;

    // Reset task status, clear buffer, and bump run counter to remount the terminal
    setTasks((prev) => {
      const next = prev.map((t) =>
        t.id === taskId
          ? { ...t, status: "pending" as TaskStatus, attentionRequestedAt: undefined }
          : t,
      );
      persistProjectTasks(task.projectId, next, showToast);
      return next;
    });
    tm.resetTaskTerminal(taskId);
    setTaskRunCounts((prev) => ({ ...prev, [taskId]: (prev[taskId] ?? 0) + 1 }));

    invoke("resume_task", {
      taskId,
      projectPath: project.path,
      agent: task.agent,
      sessionId,
      prompt: task.prompt,
      permissionMode: task.permissionMode,
      cols: tm.terminalSizeRef.current.cols,
      rows: tm.terminalSizeRef.current.rows,
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      tm.writeErrorToTerminal(taskId, `\r\nError: ${msg}\r\n`);
      updateTaskStatus(taskId, "failed", undefined, msg);
    });
  }

  function deleteTasks(taskIds: string[]) {
    if (taskIds.length === 0) return;

    setTasks((prev) => {
      const toDelete = new Set(taskIds);
      const deletingTasks = prev.filter((task) => toDelete.has(task.id));

      if (deletingTasks.length === 0) return prev;

      deletingTasks
        .filter((task) => isActiveTaskStatus(task.status))
        .forEach((task) => {
          const proj = projects.find((p) => p.id === task.projectId);
          invoke("cancel_task", { taskId: task.id, projectPath: proj?.path ?? "" }).catch(
            (e: unknown) => {
              showToast(`Failed to cancel task: ${String(e)}`);
            },
          );
        });

      const next = prev.filter((task) => !toDelete.has(task.id));
      const affectedProjectIds = new Set(deletingTasks.map((t) => t.projectId));
      affectedProjectIds.forEach((pid) => persistProjectTasks(pid, next, showToast));
      return next;
    });

    tm.removeTaskBuffers(taskIds);
    setProjectViews((prev) => {
      const toDelete = new Set(taskIds);
      let changed = false;
      const next = { ...prev };

      for (const [projectId, view] of Object.entries(prev)) {
        if (view.selectedTaskId && toDelete.has(view.selectedTaskId)) {
          next[projectId] = { ...view, selectedTaskId: null, isNewTask: true };
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }

  async function handleDeleteTask(taskId: string) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    const ok = await confirm(`Delete task "${task.prompt}"?`, {
      title: "Delete Task",
      kind: "warning",
    });
    if (!ok) return;
    deleteTasks([taskId]);
  }

  async function handleDeleteAllTasks(project: Project) {
    const projectTaskIds = tasks
      .filter((task) => task.projectId === project.id)
      .map((task) => task.id);
    if (projectTaskIds.length === 0) return;
    const ok = await confirm(`Delete all ${projectTaskIds.length} tasks in ${project.name}?`, {
      title: "Clear Tasks",
      kind: "warning",
    });
    if (!ok) return;
    deleteTasks(projectTaskIds);
  }

  function handleToggleTaskStar(taskId: string) {
    setTasks((prev) => {
      const task = prev.find((t) => t.id === taskId);
      if (!task) return prev;
      const next = prev.map((t) => (t.id === taskId ? { ...t, starred: !t.starred } : t));
      persistProjectTasks(task.projectId, next, showToast);
      return next;
    });
  }

  function handleRenameTask(taskId: string, name: string) {
    setTasks((prev) => {
      const task = prev.find((t) => t.id === taskId);
      if (!task) return prev;
      const next = prev.map((t) => (t.id === taskId ? { ...t, name: name || undefined } : t));
      persistProjectTasks(task.projectId, next, showToast);
      return next;
    });
  }

  function handleUpdateTodo(
    taskId: string,
    updates: { prompt: string; agent: AgentType; permissionMode: PermissionMode },
  ) {
    setTasks((prev) => {
      const task = prev.find((t) => t.id === taskId);
      if (!task || task.status !== "todo") return prev;
      const next = prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t));
      persistProjectTasks(task.projectId, next, showToast);
      return next;
    });
  }

  async function handleDeleteProject(projectId: string) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const ok = await confirm(`Delete project "${project.name}" and all its task records?`, {
      title: "Delete Project",
      kind: "warning",
    });
    if (!ok) return;
    const projectTaskIds = tasks.filter((t) => t.projectId === projectId).map((t) => t.id);
    deleteTasks(projectTaskIds);
    setProjects((prev) => {
      const next = prev.filter((p) => p.id !== projectId);
      persistProjects(next, showToast);
      return next;
    });
    setMountedProjectIds((prev) => prev.filter((id) => id !== projectId));
    clearProjectView(projectId);
    setActiveProject((prev) => (prev?.id === projectId ? null : prev));
  }

  function updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    extra?: Pick<Task, "attentionRequestedAt">,
    failureReason?: string,
  ) {
    setTasks((prev) => {
      let changed = false;
      const next = prev.map((task) => {
        if (task.id !== taskId) return task;

        const attentionRequestedAt =
          status === "input_required" ? (extra?.attentionRequestedAt ?? Date.now()) : undefined;

        if (task.status === status && task.attentionRequestedAt === attentionRequestedAt) {
          return task;
        }

        changed = true;
        const updated: Task = { ...task, status, attentionRequestedAt };
        if (status === "failed" && failureReason) updated.failureReason = failureReason;
        return updated;
      });

      if (changed) {
        const task = next.find((t) => t.id === taskId);
        if (task) persistProjectTasks(task.projectId, next, showToast);
      }
      return changed ? next : prev;
    });
  }

  function updateTaskSession(taskId: string, sessionId: string, sessionPath: string) {
    setTasks((prev) => {
      let changed = false;
      const next = prev.map((task) => {
        if (task.id !== taskId) return task;
        if (task.agent === "claude") {
          const nextPath = sessionPath || task.claudeSessionPath || "";
          if (task.claudeSessionId === sessionId && (task.claudeSessionPath || "") === nextPath)
            return task;
          changed = true;
          return { ...task, claudeSessionId: sessionId, claudeSessionPath: nextPath || undefined };
        } else {
          const nextPath = sessionPath || task.codexSessionPath || "";
          if (task.codexSessionId === sessionId && (task.codexSessionPath || "") === nextPath)
            return task;
          changed = true;
          return { ...task, codexSessionId: sessionId, codexSessionPath: nextPath || undefined };
        }
      });

      if (changed) {
        const task = next.find((t) => t.id === taskId);
        if (task) persistProjectTasks(task.projectId, next, showToast);
      }
      return changed ? next : prev;
    });
  }

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt),
    [projects],
  );
  const railProjects = useMemo(
    () => [...projects].sort((a, b) => Number(a.id) - Number(b.id)),
    [projects],
  );
  const mountedProjects = useMemo(
    () =>
      mountedProjectIds
        .map((id) => projects.find((project) => project.id === id))
        .filter((project): project is Project => !!project),
    [mountedProjectIds, projects],
  );

  return (
    <div style={{ ...s.root, position: "relative" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
        }}
      >
        {mountedProjects.map((project) => {
          const view = getProjectView(project.id);
          return (
            <ProjectPage
              key={project.id}
              project={project}
              visible={activeProject?.id === project.id}
              allProjects={railProjects}
              otherProjects={sortedProjects.filter((p) => p.id !== project.id)}
              tasks={tasks}
              getTaskRestoreState={tm.getTaskRestoreState}
              taskRunCounts={taskRunCounts}
              selectedTaskId={view.selectedTaskId}
              isNewTask={view.isNewTask}
              onNewTask={() =>
                updateProjectView(project.id, { selectedTaskId: null, isNewTask: true })
              }
              onSelectTask={(id) =>
                updateProjectView(project.id, { selectedTaskId: id, isNewTask: false })
              }
              onDeleteTask={handleDeleteTask}
              onDeleteAllTasks={() => handleDeleteAllTasks(project)}
              onToggleTaskStar={handleToggleTaskStar}
              onRenameTask={handleRenameTask}
              onSubmitTask={(taskInput) => handleSubmitTask(project, taskInput)}
              onRunTodoTask={handleRunTodoTask}
              onUpdateTodo={handleUpdateTodo}
              onCancelTask={handleCancelTask}
              onResumeTask={handleResumeTask}
              onInput={tm.handleInput}
              onResize={tm.handleResize}
              onRegisterTerminal={tm.handleRegisterTerminal}
              onTerminalReady={tm.handleTerminalReady}
              onSnapshot={tm.handleSnapshot}
              onBack={handleBack}
              onSwitchProject={handleProjectClick}
              onOpen={handleOpen}
              isDark={isDark}
              themeMode={themeMode}
              systemPrefersDark={systemPrefersDark}
              onThemeModeChange={setThemeMode}
              onToggleTheme={handleToggleTheme}
            />
          );
        })}
      </div>
      {!activeProject && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 5,
          }}
        >
          <WelcomePage
            projects={sortedProjects}
            onOpen={handleOpen}
            onProjectClick={handleProjectClick}
            onDeleteProject={handleDeleteProject}
            isDark={isDark}
            themeMode={themeMode}
            systemPrefersDark={systemPrefersDark}
            onThemeModeChange={setThemeMode}
            onToggleTheme={handleToggleTheme}
          />
        </div>
      )}
    </div>
  );
}

export default App;
