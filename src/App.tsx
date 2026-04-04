import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { open as openDialog, confirm } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Project, Task, TaskStatus, AgentType, PermissionMode } from "./types";
import { isActiveTaskStatus } from "./types";
import { WelcomePage } from "./components/WelcomePage";
import { ProjectPage } from "./components/ProjectPage";
import { useToast } from "./components/Toast";
import s from "./styles";
import "./App.css";

const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB per task (in-memory limit)
const MAX_WRITE_CHARS_PER_BATCH = 64 * 1024;

// Chunk-based buffer: avoids O(n) string copies on every agent-output event.
// totalLen = chars currently stored; droppedLen = chars evicted from the front.
// Absolute position = totalLen + droppedLen (used for snapshot offset tracking).
interface TaskBuffer {
  chunks: string[];
  totalLen: number;
  droppedLen: number;
}

type TerminalWriteFn = (data: string, callback?: () => void) => void;

interface TerminalWriteState {
  pending: string[];
  writing: boolean;
  scheduled: boolean;
  ready: boolean;
  generation: number;
}

function createTaskBuffer(): TaskBuffer {
  return { chunks: [], totalLen: 0, droppedLen: 0 };
}

function createTerminalWriteState(generation = 0): TerminalWriteState {
  return { pending: [], writing: false, scheduled: false, ready: false, generation };
}

function shiftTerminalWriteChunk(pending: string[]): string {
  let remaining = MAX_WRITE_CHARS_PER_BATCH;
  const parts: string[] = [];

  while (remaining > 0 && pending.length > 0) {
    const next = pending[0];
    if (next.length <= remaining) {
      parts.push(next);
      pending.shift();
      remaining -= next.length;
      continue;
    }

    parts.push(next.slice(0, remaining));
    pending[0] = next.slice(remaining);
    remaining = 0;
  }

  return parts.join("");
}

function pushToBuffer(buf: TaskBuffer, data: string): void {
  buf.chunks.push(data);
  buf.totalLen += data.length;
  while (buf.totalLen > MAX_BUFFER_SIZE && buf.chunks.length > 0) {
    const dropped = buf.chunks.shift()!;
    buf.totalLen -= dropped.length;
    buf.droppedLen += dropped.length;
  }
}

function getBufferAbsLen(buf: TaskBuffer): number {
  return buf.totalLen + buf.droppedLen;
}

function scheduleMicrotask(fn: () => void): void {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(fn);
    return;
  }
  Promise.resolve().then(fn).catch((error) => {
    setTimeout(() => {
      throw error;
    }, 0);
  });
}

// Join chunks starting from an absolute offset (recorded at snapshot time).
function joinBufferFrom(buf: TaskBuffer, absOffset: number): string {
  const relOffset = absOffset - buf.droppedLen;
  if (relOffset <= 0) return buf.chunks.join("");
  let cum = 0;
  for (let i = 0; i < buf.chunks.length; i++) {
    const len = buf.chunks[i].length;
    if (cum + len > relOffset) {
      const parts = buf.chunks.slice(i);
      parts[0] = parts[0].slice(relOffset - cum);
      return parts.join("");
    }
    cum += len;
  }
  return "";
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

function App() {
  const { showToast } = useToast();

  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem("nezha:theme");
    return stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  // Mutable buffer map — written on every agent-output event without triggering re-renders.
  // Keyed by task id; entry created on task submit/resume, deleted on task delete.
  const taskBufferRef = useRef<Record<string, TaskBuffer>>({});
  const terminalSnapshotRef = useRef<Record<string, { snapshot: string; bufferLength: number }>>(
    {},
  );
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [projectViews, setProjectViews] = useState<Record<string, ProjectViewState>>({});
  const [mountedProjectIds, setMountedProjectIds] = useState<string[]>([]);

  const [taskRunCounts, setTaskRunCounts] = useState<Record<string, number>>({});
  // Per-task write functions registered by mounted TerminalView instances
  const terminalWriteRefs = useRef<Record<string, TerminalWriteFn>>({});
  const terminalSizeRef = useRef<{ cols: number; rows: number }>({ cols: 220, rows: 50 });
  const terminalWriteStateRef = useRef<Record<string, TerminalWriteState>>({});
  // Track tasks still in "pending" to avoid calling setTasks on every agent-output event
  const pendingTaskIdsRef = useRef<Set<string>>(new Set());

  const resetTerminalWriteState = useCallback((taskId: string) => {
    const prev = terminalWriteStateRef.current[taskId];
    const next = createTerminalWriteState((prev?.generation ?? 0) + 1);
    terminalWriteStateRef.current[taskId] = next;
    return next;
  }, []);

  const scheduleTerminalDrain = useCallback((taskId: string, generation: number) => {
    const state = terminalWriteStateRef.current[taskId];
    if (!state || state.generation !== generation || state.scheduled || !state.ready) {
      return;
    }
    state.scheduled = true;
    scheduleMicrotask(() => {
      const current = terminalWriteStateRef.current[taskId];
      if (!current || current.generation !== generation) {
        return;
      }
      current.scheduled = false;
      const writeFn = terminalWriteRefs.current[taskId];
      if (!writeFn) {
        current.writing = false;
        current.pending = [];
        return;
      }

      const chunk = shiftTerminalWriteChunk(current.pending);
      if (!chunk) {
        current.writing = false;
        return;
      }

      writeFn(chunk, () => {
        const next = terminalWriteStateRef.current[taskId];
        if (!next || next.generation !== generation) {
          return;
        }
        if (next.pending.length === 0) {
          next.writing = false;
          return;
        }
        scheduleTerminalDrain(taskId, generation);
      });
    });
  }, []);

  const enqueueTerminalWrite = useCallback(
    (taskId: string, data: string) => {
      const state = terminalWriteStateRef.current[taskId] ?? resetTerminalWriteState(taskId);
      state.pending.push(data);
      if (state.writing) {
        return;
      }
      state.writing = true;
      scheduleTerminalDrain(taskId, state.generation);
    },
    [resetTerminalWriteState, scheduleTerminalDrain],
  );

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
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("nezha:theme", isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    async function init() {
      // Load projects from ~/.nezha/projects.json
      const loadedProjects = await invoke<Project[]>("load_projects");
      setProjects(loadedProjects);

      // Load tasks for all known projects
      const chunks = await Promise.all(
        loadedProjects.map((p) => invoke<Task[]>("load_project_tasks", { projectId: p.id })),
      );
      setTasks(chunks.flat());
    }

    init().catch(console.error);
  }, []);

  // Tauri event listeners
  useEffect(() => {
    const p1 = listen<{ task_id: string; data: string }>("agent-output", (e) => {
      const { task_id, data } = e.payload;

      if (terminalWriteRefs.current[task_id]) {
        enqueueTerminalWrite(task_id, data);
      }
      // Always buffer so project-switch → return can replay full history
      if (task_id in taskBufferRef.current) {
        pushToBuffer(taskBufferRef.current[task_id], data);
      }

      if (pendingTaskIdsRef.current.has(task_id)) {
        setTasks((prev) => {
          const task = prev.find((item) => item.id === task_id);
          if (!task || task.status !== "pending") {
            pendingTaskIdsRef.current.delete(task_id);
            return prev;
          }
          pendingTaskIdsRef.current.delete(task_id);
          const next = prev.map((t) =>
            t.id === task_id
              ? { ...t, status: "running" as TaskStatus, attentionRequestedAt: undefined }
              : t,
          );
          persistProjectTasks(task.projectId, next, showToast);
          return next;
        });
      }
    });
    const p2 = listen<{ task_id: string; status: TaskStatus; failure_reason?: string }>(
      "task-status",
      (e) => {
        const { task_id, status, failure_reason } = e.payload;
        updateTaskStatus(task_id, status, undefined, failure_reason);
      },
    );
    const p3 = listen<{ task_id: string; session_id: string; session_path: string }>(
      "task-session",
      (e) => {
        const { task_id, session_id, session_path } = e.payload;
        updateTaskSession(task_id, session_id, session_path);
      },
    );
    return () => {
      p1.then((fn) => fn());
      p2.then((fn) => fn());
      p3.then((fn) => fn());
    };
    // 事件监听器仅需在挂载时注册一次；回调通过 ref 模式保持最新引用，无需重新订阅
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enqueueTerminalWrite]);

  async function handleOpen() {
    const selected = await openDialog({ directory: true, multiple: false });
    if (!selected) return;
    const path = selected as string;
    const name = path.split("/").pop() || path;
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
      cols: terminalSizeRef.current.cols,
      rows: terminalSizeRef.current.rows,
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      const errMsg = `\r\nError: ${msg}\r\n`;
      const writeFn = terminalWriteRefs.current[task.id];
      if (writeFn) {
        writeFn(errMsg);
      }
      const buf = taskBufferRef.current[task.id] ?? createTaskBuffer();
      pushToBuffer(buf, errMsg);
      taskBufferRef.current[task.id] = buf;
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

    taskBufferRef.current[task.id] = createTaskBuffer();
    delete terminalSnapshotRef.current[task.id];
    pendingTaskIdsRef.current.add(task.id);
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
    taskBufferRef.current[task.id] = createTaskBuffer();
    delete terminalSnapshotRef.current[task.id];
    pendingTaskIdsRef.current.add(task.id);
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
    taskBufferRef.current[taskId] = createTaskBuffer();
    delete terminalSnapshotRef.current[taskId];
    pendingTaskIdsRef.current.add(taskId);
    setTaskRunCounts((prev) => ({ ...prev, [taskId]: (prev[taskId] ?? 0) + 1 }));

    invoke("resume_task", {
      taskId,
      projectPath: project.path,
      agent: task.agent,
      sessionId,
      prompt: task.prompt,
      permissionMode: task.permissionMode,
      cols: terminalSizeRef.current.cols,
      rows: terminalSizeRef.current.rows,
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      const errMsg = `\r\nError: ${msg}\r\n`;
      const writeFn = terminalWriteRefs.current[taskId];
      if (writeFn) {
        writeFn(errMsg);
      }
      if (taskId in taskBufferRef.current) {
        pushToBuffer(taskBufferRef.current[taskId], errMsg);
      }
      updateTaskStatus(taskId, "failed", undefined, msg);
    });
  }

  function removeTaskBuffers(taskIds: string[]) {
    for (const taskId of taskIds) {
      delete taskBufferRef.current[taskId];
      delete terminalSnapshotRef.current[taskId];
      delete terminalWriteRefs.current[taskId];
      delete terminalWriteStateRef.current[taskId];
    }
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

    removeTaskBuffers(taskIds);
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

  function handleInput(taskId: string, data: string) {
    invoke("send_input", { taskId, data }).catch(console.error);
  }

  function handleResize(taskId: string, cols: number, rows: number) {
    terminalSizeRef.current = { cols, rows };
    invoke("resize_pty", { taskId, cols, rows }).catch(console.error);
  }

  function handleRegisterTerminal(taskId: string, fn: TerminalWriteFn | null): number {
    const state = resetTerminalWriteState(taskId);
    if (fn) {
      terminalWriteRefs.current[taskId] = fn;
    } else {
      delete terminalWriteRefs.current[taskId];
    }
    return state.generation;
  }

  function handleTerminalReady(taskId: string, generation: number) {
    const state = terminalWriteStateRef.current[taskId];
    if (!state || state.generation !== generation) return;
    state.ready = true;
    scheduleTerminalDrain(taskId, generation);
  }

  function handleSnapshot(taskId: string, snapshot: string) {
    const buf = taskBufferRef.current[taskId];
    // Subtract bytes that are still in the pending write queue and have not yet
    // been passed to term.write().  Using the total buffer length would overshoot
    // the fence and cause those bytes to be silently dropped on terminal remount.
    const state = terminalWriteStateRef.current[taskId];
    const pendingLen = state?.pending.reduce((s, c) => s + c.length, 0) ?? 0;
    terminalSnapshotRef.current[taskId] = {
      snapshot,
      bufferLength: buf ? Math.max(0, getBufferAbsLen(buf) - pendingLen) : 0,
    };
  }

  function updateTaskSession(taskId: string, sessionId: string, sessionPath: string) {
    setTasks((prev) => {
      let changed = false;
      const next = prev.map((task) => {
        if (task.id !== taskId) return task;
        if (task.agent === "claude") {
          if (task.claudeSessionId === sessionId && task.claudeSessionPath === sessionPath)
            return task;
          changed = true;
          return { ...task, claudeSessionId: sessionId, claudeSessionPath: sessionPath };
        } else {
          if (task.codexSessionId === sessionId && task.codexSessionPath === sessionPath)
            return task;
          changed = true;
          return { ...task, codexSessionId: sessionId, codexSessionPath: sessionPath };
        }
      });

      if (changed) {
        const task = next.find((t) => t.id === taskId);
        if (task) persistProjectTasks(task.projectId, next, showToast);
      }
      return changed ? next : prev;
    });
  }

  const getTaskRestoreState = useCallback((taskId: string) => {
    const buf = taskBufferRef.current[taskId];
    const snapshotState = terminalSnapshotRef.current[taskId];

    if (!buf) return { initialData: "" };

    if (!snapshotState?.snapshot) {
      return { initialData: buf.chunks.join("") };
    }

    const absLen = getBufferAbsLen(buf);
    if (snapshotState.bufferLength < 0 || snapshotState.bufferLength > absLen) {
      return { initialData: buf.chunks.join("") };
    }

    return {
      initialSnapshot: snapshotState.snapshot,
      initialData: joinBufferFrom(buf, snapshotState.bufferLength),
    };
  }, []);

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
              getTaskRestoreState={getTaskRestoreState}
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
              onInput={handleInput}
              onResize={handleResize}
              onRegisterTerminal={handleRegisterTerminal}
              onTerminalReady={handleTerminalReady}
              onSnapshot={handleSnapshot}
              onBack={handleBack}
              onSwitchProject={handleProjectClick}
              onOpen={handleOpen}
              isDark={isDark}
              onToggleTheme={() => setIsDark((d) => !d)}
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
            onToggleTheme={() => setIsDark((d) => !d)}
          />
        </div>
      )}
    </div>
  );
}

export default App;
