import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import type {
  Project,
  Task,
  AgentType,
  PermissionMode,
  TaskStatus,
  ThemeMode,
} from "../types";
import { TaskPanel } from "./TaskPanel";
import { NewTaskView } from "./NewTaskView";
import { RunningView } from "./RunningView";
import { FileExplorer } from "./FileExplorer";
import { FileViewer } from "./FileViewer";
import { GitChanges } from "./GitChanges";
import { GitHistory } from "./GitHistory";
import { GitDiffViewer } from "./GitDiffViewer";
import { ProjectRail } from "./ProjectRail";
import { SettingsDialog } from "./SettingsDialog";
import { RightToolbar } from "./RightToolbar";
import { TodoTaskView } from "./TodoTaskView";
import { ShellTerminalPanel, type ShellTerminalPanelHandle } from "./ShellTerminalPanel";
import { ErrorBoundary } from "./ErrorBoundary";
import { useProjectPanels } from "../hooks/useProjectPanels";
import s from "../styles";

export function ProjectPage({
  project,
  visible = true,
  allProjects = [],
  otherProjects = [],
  tasks,
  getTaskRestoreState,
  taskRunCounts,
  selectedTaskId,
  isNewTask,
  onNewTask,
  onSelectTask,
  onDeleteTask,
  onDeleteAllTasks,
  onToggleTaskStar,
  onRenameTask,
  onSubmitTask,
  onRunTodoTask,
  onUpdateTodo,
  onCancelTask,
  onResumeTask,
  onInput,
  onResize,
  onRegisterTerminal,
  onTerminalReady,
  onSnapshot,
  onBack,
  onSwitchProject,
  onReorderProjects,
  onPersistProjectOrder,
  onOpen,
  isDark,
  themeMode,
  systemPrefersDark,
  onThemeModeChange,
  onToggleTheme,
}: {
  project: Project;
  visible?: boolean;
  allProjects?: Project[];
  otherProjects?: Project[];
  tasks: Task[];
  getTaskRestoreState: (taskId: string) => { initialData?: string; initialSnapshot?: string };
  taskRunCounts: Record<string, number>;
  selectedTaskId: string | null;
  isNewTask: boolean;
  onNewTask: () => void;
  onSelectTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onDeleteAllTasks: () => void;
  onToggleTaskStar: (id: string) => void;
  onRenameTask: (id: string, name: string) => void;
  onSubmitTask: (t: {
    prompt: string;
    agent: AgentType;
    permissionMode: PermissionMode;
    images: string[];
    immediate: boolean;
  }) => void;
  onRunTodoTask: (task: Task) => void;
  onUpdateTodo: (
    taskId: string,
    updates: { prompt: string; agent: AgentType; permissionMode: PermissionMode },
  ) => void;
  onCancelTask: (id: string) => void;
  onResumeTask: (id: string) => void;
  onInput: (taskId: string, data: string) => void;
  onResize: (taskId: string, cols: number, rows: number) => void;
  onRegisterTerminal: (
    taskId: string,
    writeFn: ((data: string, callback?: () => void) => void) | null,
  ) => number;
  onTerminalReady: (taskId: string, generation: number) => void;
  onSnapshot: (taskId: string, snapshot: string) => void;
  onBack: () => void;
  onSwitchProject: (project: Project) => void;
  onReorderProjects: (draggedProjectId: string, targetProjectId: string) => void;
  onPersistProjectOrder: () => void;
  onOpen: () => void;
  isDark: boolean;
  themeMode: ThemeMode;
  systemPrefersDark: boolean;
  onThemeModeChange: (mode: ThemeMode) => void;
  onToggleTheme: () => void;
}) {
  const {
    rightPanel,
    openFiles,
    activeFilePath,
    openDiff,
    rightPanelWidth,
    terminalHeight,
    setOpenDiff,
    handleTogglePanel,
    handleFileSelect,
    handleFileTabSelect,
    handleFileTabClose,
    handleCloseOtherFileTabs,
    handleCloseTabsToRight,
    handleCloseAllFileTabs,
    handleDiffFileSelect,
    handleCommitSelect,
    handleCommitFileClick,
    clearFileAndDiff,
    handleRightResizeStart,
    handleTerminalResizeStart,
  } = useProjectPanels();

  const [showShellTerminal, setShowShellTerminal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [mountedTaskIds, setMountedTaskIds] = useState<Set<string>>(() => new Set());
  const shellRef = useRef<ShellTerminalPanelHandle>(null);
  const pendingCmdRef = useRef<string | null>(null);

  const projectTasks = useMemo(
    () => tasks.filter((t) => t.projectId === project.id),
    [tasks, project.id],
  );
  const selectedTask = projectTasks.find((t) => t.id === selectedTaskId) ?? null;

  // 只挂载当前选中的任务的 xterm 实例，其他任务通过 snapshot 序列化后卸载。
  // 这样同时只有 1 个 WebGL context 存活，避免长时间运行后 GPU 内存累积。
  useEffect(() => {
    if (selectedTaskId && !isNewTask) {
      setMountedTaskIds((prev) => {
        if (prev.size === 1 && prev.has(selectedTaskId)) return prev;
        return new Set([selectedTaskId]);
      });
    }
  }, [selectedTaskId, isNewTask]);

  const handleSelectTask = useCallback(
    (id: string) => {
      clearFileAndDiff();
      onSelectTask(id);
    },
    [onSelectTask, clearFileAndDiff],
  );

  const handleRunMakeTarget = useCallback(
    (target: string) => {
      const cmd = `make ${target}\n`;
      if (showShellTerminal && shellRef.current) {
        shellRef.current.sendCommand(cmd);
      } else {
        pendingCmdRef.current = cmd;
        setShowShellTerminal(true);
      }
    },
    [showShellTerminal],
  );

  const handleShellReady = useCallback(() => {
    if (pendingCmdRef.current) {
      shellRef.current?.sendCommand(pendingCmdRef.current);
      pendingCmdRef.current = null;
    }
  }, []);

  const handleNewTask = useCallback(() => {
    clearFileAndDiff();
    onNewTask();
  }, [onNewTask, clearFileAndDiff]);

  const currentTaskCreatedAt = selectedTask?.createdAt ?? null;

  return (
    <div
      style={{
        ...s.projectBody,
        position: "absolute",
        inset: 0,
        visibility: visible ? "visible" : "hidden",
        pointerEvents: visible ? "auto" : "none",
        zIndex: visible ? 1 : 0,
      }}
    >
      <ProjectRail
        projects={allProjects}
        allTasks={tasks}
        activeProjectId={project.id}
        onSwitch={onSwitchProject}
        onReorderProjects={onReorderProjects}
        onPersistProjectOrder={onPersistProjectOrder}
        onOpen={onOpen}
      />
      <TaskPanel
        project={project}
        tasks={projectTasks}
        selectedId={selectedTaskId}
        isNewTask={isNewTask}
        onNewTask={handleNewTask}
        onSelectTask={handleSelectTask}
        onDeleteTask={onDeleteTask}
        onDeleteAllTasks={onDeleteAllTasks}
        onToggleTaskStar={onToggleTaskStar}
        onRunTodo={onRunTodoTask}
        onBack={onBack}
        isDark={isDark}
        themeMode={themeMode}
        systemPrefersDark={systemPrefersDark}
        onThemeModeChange={onThemeModeChange}
        onToggleTheme={onToggleTheme}
        active={visible}
      />
      <div style={{ ...s.mainContent, flexDirection: "column" }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            minHeight: 0,
            position: "relative",
          }}
        >
          {/* Foreground: file viewer, diff, or new-task composer */}
          <ErrorBoundary
            label="主内容区"
            fallback={(error, reset) => (
              <div style={s.errorBoundaryWrap}>
                <div style={s.errorBoundaryIcon}>⚠</div>
                <div style={s.errorBoundaryTitle}>内容区渲染出错</div>
                <div style={s.errorBoundaryMessage}>{error.message || "未知错误"}</div>
                <div style={s.errorBoundaryActions}>
                  <button onClick={reset} style={s.errorBoundaryBtn}>
                    重试
                  </button>
                  <button
                    onClick={() => {
                      clearFileAndDiff();
                      reset();
                    }}
                    style={s.errorBoundaryBtn}
                  >
                    返回任务视图
                  </button>
                </div>
              </div>
            )}
          >
            {openDiff ? (
              openDiff.kind === "file" ? (
                <GitDiffViewer
                  projectPath={project.path}
                  mode="file"
                  filePath={openDiff.filePath}
                  staged={openDiff.staged}
                  title={openDiff.label}
                  onClose={() => setOpenDiff(null)}
                />
              ) : openDiff.kind === "commit-file" ? (
                <GitDiffViewer
                  projectPath={project.path}
                  mode="commit-file"
                  commitHash={openDiff.hash}
                  filePath={openDiff.filePath}
                  title={openDiff.label}
                  onClose={() => setOpenDiff(null)}
                />
              ) : (
                <GitDiffViewer
                  projectPath={project.path}
                  mode="commit"
                  commitHash={openDiff.hash}
                  title={openDiff.message}
                  onClose={() => setOpenDiff(null)}
                />
              )
            ) : openFiles.length > 0 ? (
              <FileViewer
                tabs={openFiles}
                activeFilePath={activeFilePath}
                projectPath={project.path}
                onSelectTab={handleFileTabSelect}
                onCloseTab={handleFileTabClose}
                onCloseOtherTabs={handleCloseOtherFileTabs}
                onCloseTabsToRight={handleCloseTabsToRight}
                onCloseAllTabs={handleCloseAllFileTabs}
                isDark={isDark}
                onRunMakeTarget={handleRunMakeTarget}
              />
            ) : isNewTask || !selectedTask ? (
              <NewTaskView
                project={project}
                otherProjects={otherProjects}
                onSubmit={onSubmitTask}
              />
            ) : selectedTask.status === ("todo" as TaskStatus) ? (
              <TodoTaskView
                task={selectedTask}
                onRunTodo={onRunTodoTask}
                onUpdateTodo={onUpdateTodo}
              />
            ) : null}
          </ErrorBoundary>

          {/* Background terminals */}
          {projectTasks
            .filter((t) => mountedTaskIds.has(t.id))
            .map((task) => {
              const isVisible =
                openFiles.length === 0 &&
                !openDiff &&
                !isNewTask &&
                !!selectedTask &&
                task.id === selectedTaskId &&
                task.status !== "todo";
              return (
                <RunningView
                  key={task.id}
                  task={task}
                  runCount={taskRunCounts[task.id] ?? 0}
                  visible={visible && isVisible}
                  projectActive={visible}
                  onCancel={() => onCancelTask(task.id)}
                  onResume={() => onResumeTask(task.id)}
                  onInput={(data) => onInput(task.id, data)}
                  onResize={(cols, rows) => onResize(task.id, cols, rows)}
                  onRegisterTerminal={(fn) => onRegisterTerminal(task.id, fn)}
                  onTerminalReady={(generation) => onTerminalReady(task.id, generation)}
                  onSnapshot={(snapshot) => onSnapshot(task.id, snapshot)}
                  getRestoreState={() => getTaskRestoreState(task.id)}
                  onRename={(name) => onRenameTask(task.id, name)}
                  isDark={isDark}
                />
              );
            })}
        </div>
        {showShellTerminal && (
          <ShellTerminalPanel
            ref={shellRef}
            projectPath={project.path}
            projectId={project.id}
            isActive={visible}
            onClose={() => setShowShellTerminal(false)}
            isDark={isDark}
            onReady={handleShellReady}
            height={terminalHeight}
            onResizeStart={handleTerminalResizeStart}
          />
        )}
      </div>

      {rightPanel && (
        <div style={{ position: "relative", display: "flex", flexShrink: 0 }}>
          <div
            onMouseDown={handleRightResizeStart}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 5,
              cursor: "col-resize",
              zIndex: 10,
            }}
          />
          {rightPanel === "files" && (
            <ErrorBoundary label="文件浏览器">
              <FileExplorer
                projectPath={project.path}
                projectName={project.name}
                onFileSelect={handleFileSelect}
                isDark={isDark}
                active={visible}
                width={rightPanelWidth}
              />
            </ErrorBoundary>
          )}
          {rightPanel === "git-changes" && (
            <ErrorBoundary label="Git 变更">
              <GitChanges
                projectPath={project.path}
                currentTaskCreatedAt={currentTaskCreatedAt}
                onFileSelect={handleDiffFileSelect}
                width={rightPanelWidth}
              />
            </ErrorBoundary>
          )}
          {rightPanel === "git-history" && (
            <ErrorBoundary label="Git 历史">
              <GitHistory
                projectPath={project.path}
                onCommitSelect={handleCommitSelect}
                onFileClick={handleCommitFileClick}
                width={rightPanelWidth}
              />
            </ErrorBoundary>
          )}
        </div>
      )}

      <RightToolbar
        activePanel={rightPanel}
        onToggle={handleTogglePanel}
        terminalActive={showShellTerminal}
        onToggleTerminal={() => setShowShellTerminal((v) => !v)}
        onOpenSettings={() => setShowSettings(true)}
      />

      {showSettings && (
        <SettingsDialog projectPath={project.path} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
