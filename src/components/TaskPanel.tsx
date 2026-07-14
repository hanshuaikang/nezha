import { useState } from "react";
import {
  Search,
  ChevronLeft,
  Plus,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  Moon,
  Sun,
} from "lucide-react";
import type {
  Project,
  Task,
  ThemeMode,
  ThemeVariant,
  TerminalFontSize,
  TerminalScrollback,
  TaskDisplayWindow,
  FontFamily,
  GitRoot,
} from "../types";
import { ProjectAvatar } from "./ProjectAvatar";
import { SidebarFooterActions } from "./SidebarFooterActions";
import { BranchBar } from "./task-panel/BranchBar";
import { RepoSelector } from "./task-panel/RepoSelector";
import { TaskList } from "./task-panel/TaskList";
import { useI18n } from "../i18n";
import s from "../styles";

export function TaskPanel({
  project,
  repoPath,
  branchRepoPath,
  repoSelectionLocked,
  gitRoots,
  onSelectRoot,
  tasks,
  selectedId,
  isNewTask,
  onNewTask,
  onSelectTask,
  onDeleteTask,
  onDeleteAllTasks,
  onToggleTaskStar,
  onRunTodo,
  onBack,
  backTitle,
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
  active = true,
  collapsed = false,
  onToggleCollapsed,
}: {
  project: Project;
  /** 当前活动 git 根（用于 BranchBar / 多仓库工作区切换） */
  repoPath: string;
  /** BranchBar 的实际 git cwd；worktree 任务中为 worktreePath。 */
  branchRepoPath: string;
  /** worktree 任务选中时锁定仓库，避免界面同时操作另一个 sub-repo。 */
  repoSelectionLocked: boolean;
  /** 项目下所有 git 根。仅当 length > 1 时渲染 RepoSelector。 */
  gitRoots: GitRoot[];
  onSelectRoot: (path: string) => void;
  tasks: Task[];
  selectedId: string | null;
  isNewTask: boolean;
  onNewTask: () => void;
  onSelectTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onDeleteAllTasks: () => void;
  onToggleTaskStar: (id: string) => void;
  onRunTodo: (task: Task) => void;
  onBack: () => void;
  backTitle?: string;
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
  active?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const isDark = themeVariant === "dark" || themeVariant === "midnight";
  const hasAttention = tasks.some(
    (t) =>
      t.status === "input_required" ||
      t.status === "awaiting_review" ||
      t.status === "detached" ||
      t.status === "interrupted",
  );

  if (collapsed) {
    return (
      <div style={s.taskPanelCollapsedRoot}>
        <button
          type="button"
          style={s.taskPanelExpandBtn}
          onClick={onToggleCollapsed}
          title={hasAttention ? t("task.showTasksAttention") : t("task.showTasks")}
          aria-label={hasAttention ? t("task.showTasksAttentionAria") : t("task.showTasks")}
        >
          <PanelLeftOpen size={16} strokeWidth={2} />
          {hasAttention && <span style={s.taskPanelAttentionDot} aria-hidden />}
        </button>
        <div style={s.taskPanelCollapsedBody}>
          <ProjectAvatar name={project.name} size={24} />
          <button
            type="button"
            style={
              isNewTask ? s.taskPanelCollapsedNewBtnActive : s.taskPanelCollapsedNewBtnInactive
            }
            onClick={onNewTask}
            title={t("task.newTask")}
            aria-label={t("task.newTask")}
          >
            <Plus size={15} strokeWidth={2.4} />
          </button>
        </div>
        <div style={s.taskPanelCollapsedFooter}>
          <button
            type="button"
            style={s.taskPanelCollapsedSmallBtn}
            onClick={onToggleTheme}
            title={isDark ? t("theme.switchToLight") : t("theme.switchToDark")}
            aria-label={isDark ? t("theme.switchToLight") : t("theme.switchToDark")}
          >
            {isDark ? <Sun size={14} strokeWidth={1.8} /> : <Moon size={14} strokeWidth={1.8} />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={s.taskPanel}>
      {/* Project header */}
      <div style={s.panelHeader}>
        <button style={s.backBtn} onClick={onBack} title={backTitle ?? t("task.switchProject")}>
          <ChevronLeft size={15} strokeWidth={2} />
        </button>
        <ProjectAvatar name={project.name} size={22} />
        <span style={s.panelProjectName}>{project.name}</span>
        <button
          type="button"
          style={s.panelCollapseBtn}
          onClick={onToggleCollapsed}
          title={t("task.hideTasks")}
        >
          <PanelLeftClose size={15} strokeWidth={2} />
        </button>
      </div>

      {/* Search */}
      <div style={s.panelSearchWrap}>
        <Search size={13} strokeWidth={2} color="var(--text-muted)" style={s.flexShrinkIcon} />
        <input
          style={s.panelSearchInput}
          placeholder={t("task.searchTasks")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Repo selector (only multi-repo workspaces) */}
      {gitRoots.length > 1 && (
        <RepoSelector
          roots={gitRoots}
          selectedPath={repoPath}
          onSelect={onSelectRoot}
          disabled={repoSelectionLocked}
        />
      )}

      {/* Branch bar */}
      <BranchBar projectRoot={project.path} repoPath={branchRepoPath} active={active} />

      {/* New Task row */}
      <button style={isNewTask ? s.newTaskRowActive : s.newTaskRowInactive} onClick={onNewTask}>
        <Plus size={14} strokeWidth={2.5} style={s.flexShrinkIcon} />
        <span style={s.newTaskRowLabel}>{t("task.newTask")}</span>
      </button>

      <div style={s.taskActionsRow}>
        <div style={s.taskActionsMeta}>
          {tasks.length} {t("task.tasks")}
        </div>
        <button
          type="button"
          style={tasks.length > 0 ? s.taskActionBtn : s.taskActionBtnDisabled}
          disabled={tasks.length === 0}
          onClick={onDeleteAllTasks}
        >
          <Trash2 size={12} strokeWidth={2.2} />
          <span>{t("task.clearAll")}</span>
        </button>
      </div>

      <div style={s.taskDivider} />

      {/* Task list */}
      <TaskList
        tasks={tasks}
        taskDisplayWindow={taskDisplayWindow}
        query={query}
        selectedId={selectedId}
        isNewTask={isNewTask}
        onSelectTask={onSelectTask}
        onDeleteTask={onDeleteTask}
        onToggleTaskStar={onToggleTaskStar}
        onRunTodo={onRunTodo}
      />
      <div style={s.taskPanelFooter}>
        <SidebarFooterActions
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
        />
      </div>
    </div>
  );
}
