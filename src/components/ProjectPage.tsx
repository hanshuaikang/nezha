import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import type {
  Project,
  Task,
  AgentType,
  PermissionMode,
  TaskStatus,
  ThemeMode,
  ThemeVariant,
  TerminalFontSize,
  TerminalScrollback,
  TaskDisplayWindow,
  FontFamily,
} from "../types";
import { TaskPanel } from "./TaskPanel";
import { NewTaskView, type NewTaskDraft } from "./NewTaskView";
import { RunningView } from "./RunningView";
import { FileExplorer } from "./FileExplorer";
import { FileSearchDialog } from "./file-explorer/SearchPanel";
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
import { useToast } from "./Toast";
import { useProjectPanels } from "../hooks/useProjectPanels";
import { resolveProjectGitContext, useGitRoots } from "../hooks/useGitRoots";
import { useI18n } from "../i18n";
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
  onGenerateTaskName,
  onSubmitTask,
  onRunTodoTask,
  onUpdateTodo,
  onCancelTask,
  onResumeTask,
  onMergeWorktree,
  onDiscardWorktree,
  onReconnectTask,
  onMarkTaskDone,
  onInput,
  onResize,
  onRegisterTerminal,
  onTerminalReady,
  onSnapshot,
  onBack,
  onSwitchProject,
  onCommitProjectOrder,
  onOpen,
  themeVariant,
  themeMode,
  systemPrefersDark,
  onThemeModeChange,
  onToggleTheme,
  terminalFontSize,
  onTerminalFontSizeChange,
  taskDisplayWindow,
  onTaskDisplayWindowChange,
  attentionBadge,
  onAttentionBadgeChange,
  terminalScrollback,
  onTerminalScrollbackChange,
  uiFontFamily,
  onUiFontFamilyChange,
  monoFontFamily,
  onMonoFontFamilyChange,
  hubMode = false,
  onExitSkillHub,
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
  onGenerateTaskName: (id: string) => Promise<void>;
  onSubmitTask: (t: {
    prompt: string;
    agent: AgentType;
    permissionMode: PermissionMode;
    images: string[];
    texts: string[];
    immediate: boolean;
    launchMode: "local" | "worktree";
    baseBranch: string;
    /** 任务关联的 git 根（worktree 创建于此） */
    repoPath: string;
  }) => void;
  onRunTodoTask: (task: Task) => void;
  onUpdateTodo: (
    taskId: string,
    updates: { prompt: string; agent: AgentType; permissionMode: PermissionMode },
  ) => void;
  onCancelTask: (id: string) => void;
  onResumeTask: (id: string) => void;
  onMergeWorktree: (id: string) => Promise<void>;
  onDiscardWorktree: (id: string) => Promise<void>;
  onReconnectTask: (id: string) => void;
  onMarkTaskDone: (id: string) => void;
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
  onCommitProjectOrder: (draggedId: string, beforeId: string | null, visibleIds: string[]) => void;
  onOpen: () => void;
  themeVariant: ThemeVariant;
  themeMode: ThemeMode;
  systemPrefersDark: boolean;
  onThemeModeChange: (mode: ThemeMode) => void;
  onToggleTheme: () => void;
  terminalFontSize: TerminalFontSize;
  onTerminalFontSizeChange: (size: TerminalFontSize) => void;
  taskDisplayWindow: TaskDisplayWindow;
  onTaskDisplayWindowChange: (window: TaskDisplayWindow) => void;
  attentionBadge: boolean;
  onAttentionBadgeChange: (enabled: boolean) => void;
  terminalScrollback: TerminalScrollback;
  onTerminalScrollbackChange: (value: TerminalScrollback) => void;
  uiFontFamily: FontFamily;
  onUiFontFamilyChange: (family: FontFamily) => void;
  monoFontFamily: FontFamily;
  onMonoFontFamilyChange: (family: FontFamily) => void;
  hubMode?: boolean;
  onExitSkillHub?: () => void;
}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const {
    rightPanel,
    openFiles,
    activeFilePath,
    openDiff,
    rightPanelWidth,
    terminalHeight,
    setOpenDiff,
    openRightPanel,
    handleTogglePanel,
    handleFileSelect,
    handleFileTabSelect,
    handleFileTabClose,
    handleCloseOtherFileTabs,
    handleCloseTabsToRight,
    handleCloseTabsToLeft,
    handleCloseAllFileTabs,
    handleDiffFileSelect,
    handleCommitSelect,
    handleCommitFileClick,
    clearFileAndDiff,
    handleRightResizeStart,
    handleTerminalResizeStart,
  } = useProjectPanels();

  const [showShellTerminal, setShowShellTerminal] = useState(false);
  const [shellProjectPath, setShellProjectPath] = useState(project.path);
  const [showSettings, setShowSettings] = useState(false);
  const [showFileSearch, setShowFileSearch] = useState(false);
  const [taskPanelCollapsed, setTaskPanelCollapsed] = useState(false);
  const [mountedTaskIds, setMountedTaskIds] = useState<Set<string>>(() => new Set());
  const shellRef = useRef<ShellTerminalPanelHandle>(null);
  const pendingCmdRef = useRef<string | null>(null);
  const prevHadDiffRef = useRef(false);
  const newTaskDraftRef = useRef<NewTaskDraft | null>(null);
  const handleCacheNewTaskDraft = useCallback((draft: NewTaskDraft | null) => {
    newTaskDraftRef.current = draft;
  }, []);

  const projectTasks = useMemo(
    () => tasks.filter((t) => t.projectId === project.id),
    [tasks, project.id],
  );
  const selectedTask = projectTasks.find((t) => t.id === selectedTaskId) ?? null;

  // 工作区项目可能包含多个 sub-repo，selectedRoot.path 为当前活动的 git 根（缺省回落 project.path）。
  const {
    roots: gitRoots,
    selectedRoot,
    setSelectedRoot,
  } = useGitRoots(project.id, project.path, visible);
  const subRepoPath = selectedRoot?.path ?? project.path;

  // Worktree 任务固定归属于创建它的 git 根。选中这类任务时，仓库选择器、BranchBar
  // 和 Git 面板必须保持同一上下文，不能让全局 sub-repo 选择把界面拆成两个仓库。
  const {
    displayedRepoPath,
    commandRepoPath: gitContextPath,
    selectionLocked: repoSelectionLocked,
  } = resolveProjectGitContext(project.path, subRepoPath, selectedTask);

  const previousGitContextRef = useRef(gitContextPath);
  useEffect(() => {
    if (previousGitContextRef.current === gitContextPath) return;
    previousGitContextRef.current = gitContextPath;
    // diff 的 path/hash 都属于旧仓库；切换上下文后继续复用会展示另一个仓库的内容。
    setOpenDiff(null);
  }, [gitContextPath, setOpenDiff]);

  const handleSearchFileSelect = useCallback(
    (path: string, name: string) => {
      handleFileSelect(path, name);
      openRightPanel("files");
    },
    [handleFileSelect, openRightPanel],
  );

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

  // diff viewer 打开/关闭时自动联动任务面板的折叠态，但只在 "无 diff → 有 diff" 或
  // "有 diff → 无 diff" 跨界的那一刻同步一次。用户中途手动展/收，以及切换不同 diff
  // 文件（openDiff 引用变化但仍是 truthy）都不会被覆盖。
  useEffect(() => {
    const hasDiff = Boolean(openDiff);
    if (hasDiff !== prevHadDiffRef.current) {
      setTaskPanelCollapsed(hasDiff);
      prevHadDiffRef.current = hasDiff;
    }
  }, [openDiff]);

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
        const sent = shellRef.current.sendCommandToPath(project.path, cmd);
        if (!sent) {
          showToast(t("terminal.limitReachedWithCloseHint"), "warning");
        }
      } else {
        setShellProjectPath(project.path);
        pendingCmdRef.current = cmd;
        setShowShellTerminal(true);
      }
    },
    [project.path, showShellTerminal, showToast, t],
  );

  const handleOpenWorktreeTerminal = useCallback(
    (worktreePath: string) => {
      if (showShellTerminal && shellRef.current) {
        const opened = shellRef.current.openPath(worktreePath);
        if (!opened) {
          showToast(t("terminal.limitReachedWithCloseHint"), "warning");
        }
        return;
      }
      setShellProjectPath(worktreePath);
      setShowShellTerminal(true);
    },
    [showShellTerminal, showToast, t],
  );

  const handleToggleShellTerminal = useCallback(() => {
    setShowShellTerminal((currentlyVisible) => {
      if (!currentlyVisible) {
        setShellProjectPath(project.path);
      }
      return !currentlyVisible;
    });
  }, [project.path]);

  useEffect(() => {
    if (showShellTerminal) return;
    setShellProjectPath(project.path);
  }, [project.id, project.path, showShellTerminal]);

  const handleShellReady = useCallback(() => {
    if (pendingCmdRef.current) {
      shellRef.current?.sendCommand(pendingCmdRef.current);
      pendingCmdRef.current = null;
    }
  }, []);

  const handleShellClose = useCallback(() => {
    setShowShellTerminal(false);
    setShellProjectPath(project.path);
  }, [project.path]);

  const handleNewTask = useCallback(() => {
    clearFileAndDiff();
    onNewTask();
  }, [onNewTask, clearFileAndDiff]);

  const collapseTaskPanelForNewDiff = useCallback(() => {
    if (!openDiff) {
      setTaskPanelCollapsed(true);
    }
  }, [openDiff]);

  const handleDiffFileSelectWithCollapse = useCallback(
    (filePath: string, staged: boolean, label: string) => {
      collapseTaskPanelForNewDiff();
      handleDiffFileSelect(filePath, staged, label);
    },
    [collapseTaskPanelForNewDiff, handleDiffFileSelect],
  );

  const handleCommitSelectWithCollapse = useCallback(
    (hash: string, message: string) => {
      collapseTaskPanelForNewDiff();
      handleCommitSelect(hash, message);
    },
    [collapseTaskPanelForNewDiff, handleCommitSelect],
  );

  const handleCommitFileClickWithCollapse = useCallback(
    (hash: string, filePath: string, label: string) => {
      collapseTaskPanelForNewDiff();
      handleCommitFileClick(hash, filePath, label);
    },
    [collapseTaskPanelForNewDiff, handleCommitFileClick],
  );

  const currentTaskCreatedAt = selectedTask?.createdAt ?? null;

  return (
    <div style={visible ? s.projectBodyVisible : s.projectBodyHidden}>
      <ProjectRail
        projects={allProjects}
        allTasks={tasks}
        activeProjectId={project.id}
        attentionBadge={attentionBadge}
        onSwitch={onSwitchProject}
        onCommitProjectOrder={onCommitProjectOrder}
        onOpen={onOpen}
        singleProjectMode={hubMode}
      />
      <TaskPanel
        project={project}
        repoPath={displayedRepoPath}
        branchRepoPath={gitContextPath}
        repoSelectionLocked={repoSelectionLocked}
        gitRoots={gitRoots}
        onSelectRoot={setSelectedRoot}
        tasks={projectTasks}
        selectedId={selectedTaskId}
        isNewTask={isNewTask}
        onNewTask={handleNewTask}
        onSelectTask={handleSelectTask}
        onDeleteTask={onDeleteTask}
        onDeleteAllTasks={onDeleteAllTasks}
        onToggleTaskStar={onToggleTaskStar}
        onRunTodo={onRunTodoTask}
        onBack={hubMode ? (onExitSkillHub ?? onBack) : onBack}
        backTitle={hubMode ? t("skill.taskView.back") : undefined}
        themeVariant={themeVariant}
        themeMode={themeMode}
        systemPrefersDark={systemPrefersDark}
        onThemeModeChange={onThemeModeChange}
        onToggleTheme={onToggleTheme}
        terminalFontSize={terminalFontSize}
        onTerminalFontSizeChange={onTerminalFontSizeChange}
        taskDisplayWindow={taskDisplayWindow}
        onTaskDisplayWindowChange={onTaskDisplayWindowChange}
        attentionBadge={attentionBadge}
        onAttentionBadgeChange={onAttentionBadgeChange}
        terminalScrollback={terminalScrollback}
        onTerminalScrollbackChange={onTerminalScrollbackChange}
        uiFontFamily={uiFontFamily}
        onUiFontFamilyChange={onUiFontFamilyChange}
        monoFontFamily={monoFontFamily}
        onMonoFontFamilyChange={onMonoFontFamilyChange}
        active={visible}
        collapsed={taskPanelCollapsed}
        onToggleCollapsed={() => setTaskPanelCollapsed((v) => !v)}
      />
      <div style={s.mainContent}>
        <div style={s.projectMainStage}>
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
                  projectRoot={project.path}
                  repoPath={gitContextPath}
                  mode="file"
                  filePath={openDiff.filePath}
                  staged={openDiff.staged}
                  title={openDiff.label}
                  onClose={() => setOpenDiff(null)}
                />
              ) : openDiff.kind === "commit-file" ? (
                <GitDiffViewer
                  projectRoot={project.path}
                  repoPath={gitContextPath}
                  mode="commit-file"
                  commitHash={openDiff.hash}
                  filePath={openDiff.filePath}
                  title={openDiff.label}
                  onClose={() => setOpenDiff(null)}
                />
              ) : (
                <GitDiffViewer
                  projectRoot={project.path}
                  repoPath={gitContextPath}
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
                onCloseTabsToLeft={handleCloseTabsToLeft}
                onCloseAllTabs={handleCloseAllFileTabs}
                themeVariant={themeVariant}
                onRunMakeTarget={handleRunMakeTarget}
              />
            ) : isNewTask || !selectedTask ? (
              <NewTaskView
                project={project}
                repoPath={subRepoPath}
                roots={gitRoots}
                onSetRepoPath={setSelectedRoot}
                otherProjects={otherProjects}
                onSubmit={(t) => onSubmitTask({ ...t, repoPath: subRepoPath })}
                initialDraft={newTaskDraftRef.current}
                onCacheDraft={handleCacheNewTaskDraft}
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
              const worktreePath =
                task.worktreePath && !task.worktreeDiscarded ? task.worktreePath : null;
              return (
                <RunningView
                  key={task.id}
                  task={task}
                  projectPath={project.path}
                  runCount={taskRunCounts[task.id] ?? 0}
                  visible={visible && isVisible}
                  projectActive={visible}
                  onCancel={() => onCancelTask(task.id)}
                  onResume={() => onResumeTask(task.id)}
                  onMergeWorktree={() => onMergeWorktree(task.id)}
                  onDiscardWorktree={() => onDiscardWorktree(task.id)}
                  onOpenWorktreeTerminal={
                    worktreePath ? () => handleOpenWorktreeTerminal(worktreePath) : undefined
                  }
                  onReconnect={() => onReconnectTask(task.id)}
                  onMarkDone={() => onMarkTaskDone(task.id)}
                  onInput={(data) => onInput(task.id, data)}
                  onResize={(cols, rows) => onResize(task.id, cols, rows)}
                  onRegisterTerminal={(fn) => onRegisterTerminal(task.id, fn)}
                  onTerminalReady={(generation) => onTerminalReady(task.id, generation)}
                  onSnapshot={(snapshot) => onSnapshot(task.id, snapshot)}
                  getRestoreState={() => getTaskRestoreState(task.id)}
                  onRename={(name) => onRenameTask(task.id, name)}
                  onGenerateName={() => onGenerateTaskName(task.id)}
                  themeVariant={themeVariant}
                  terminalFontSize={terminalFontSize}
                  terminalScrollback={terminalScrollback}
                  monoFontFamily={monoFontFamily}
                />
              );
            })}
        </div>
        {showShellTerminal && (
          <ShellTerminalPanel
            ref={shellRef}
            projectPath={shellProjectPath}
            projectId={project.id}
            isActive={visible}
            onClose={handleShellClose}
            themeVariant={themeVariant}
            terminalFontSize={terminalFontSize}
            monoFontFamily={monoFontFamily}
            onReady={handleShellReady}
            height={terminalHeight}
            onResizeStart={handleTerminalResizeStart}
          />
        )}
      </div>

      {rightPanel && (
        <div style={s.rightPanelWrap}>
          <div onMouseDown={handleRightResizeStart} style={s.rightPanelResizeHandle} />
          {rightPanel === "files" && (
            <ErrorBoundary label="文件浏览器">
              <FileExplorer
                projectPath={project.path}
                projectName={project.name}
                onFileSelect={handleFileSelect}
                active={visible}
                width={rightPanelWidth}
              />
            </ErrorBoundary>
          )}
          {rightPanel === "git-changes" && (
            <ErrorBoundary label="Git 变更">
              <GitChanges
                projectRoot={project.path}
                repoPath={gitContextPath}
                currentTaskCreatedAt={currentTaskCreatedAt}
                onFileSelect={handleDiffFileSelectWithCollapse}
                width={rightPanelWidth}
              />
            </ErrorBoundary>
          )}
          {rightPanel === "git-history" && (
            <ErrorBoundary label="Git 历史">
              <GitHistory
                projectRoot={project.path}
                repoPath={gitContextPath}
                onCommitSelect={handleCommitSelectWithCollapse}
                onFileClick={handleCommitFileClickWithCollapse}
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
        onToggleTerminal={handleToggleShellTerminal}
        onOpenSearch={() => setShowFileSearch(true)}
        onOpenSettings={() => setShowSettings(true)}
      />

      {showFileSearch && (
        <FileSearchDialog
          projectPath={project.path}
          onFileSelect={handleSearchFileSelect}
          onClose={() => setShowFileSearch(false)}
        />
      )}

      {showSettings && (
        <SettingsDialog projectPath={project.path} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
