import { useState, useRef, useImperativeHandle, forwardRef } from "react";
import {
  Search,
  ChevronLeft,
  Plus,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  Moon,
  Sun,
  LinkIcon,
} from "lucide-react";
import type { Project, Task, ThemeMode, SessionListItem } from "../types";
import { ProjectAvatar } from "./ProjectAvatar";
import { SidebarFooterActions } from "./SidebarFooterActions";
import { BranchBar } from "./task-panel/BranchBar";
import { TaskList } from "./task-panel/TaskList";
import { SessionPickerDialog } from "./SessionPickerDialog";
import { APP_PLATFORM } from "../platform";
import { formatShortcutHint } from "../shortcuts";
import { useI18n } from "../i18n";
import s from "../styles";

export interface TaskPanelHandle {
  focusSearch: () => void;
}

interface TaskPanelProps {
  project: Project;
  tasks: Task[];
  selectedId: string | null;
  isNewTask: boolean;
  onNewTask: () => void;
  onSelectTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onDeleteAllTasks: () => void;
  onToggleTaskStar: (id: string) => void;
  onRunTodo: (task: Task) => void;
  onAttachSession: (session: SessionListItem, resume: boolean) => void;
  onBack: () => void;
  isDark: boolean;
  themeMode: ThemeMode;
  systemPrefersDark: boolean;
  onThemeModeChange: (mode: ThemeMode) => void;
  onToggleTheme: () => void;
  active?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export const TaskPanel = forwardRef<TaskPanelHandle, TaskPanelProps>(function TaskPanel(
  {
    project,
    tasks,
    selectedId,
    isNewTask,
    onNewTask,
    onSelectTask,
    onDeleteTask,
    onDeleteAllTasks,
    onToggleTaskStar,
    onRunTodo,
    onAttachSession,
    onBack,
    isDark,
    themeMode,
    systemPrefersDark,
    onThemeModeChange,
    onToggleTheme,
    active = true,
    collapsed = false,
    onToggleCollapsed,
  },
  ref,
) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const hasAttention = tasks.some((t) => t.status === "input_required");

  useImperativeHandle(ref, () => ({
    focusSearch: () => {
      if (!collapsed) searchInputRef.current?.focus();
    },
  }));

  if (collapsed) {
    return (
      <div style={{ ...s.taskPanel, ...s.taskPanelCollapsed }}>
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
            style={{
              ...s.taskPanelCollapsedNewBtn,
              color: isNewTask ? "var(--control-active-fg)" : "var(--text-muted)",
            }}
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
        <button style={s.backBtn} onClick={onBack} title={t("task.switchProject")}>
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
        <Search size={13} strokeWidth={2} color="var(--text-muted)" style={{ flexShrink: 0 }} />
        <input
          ref={searchInputRef}
          style={s.panelSearchInput}
          placeholder={t("task.searchTasks")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Branch bar */}
      <BranchBar projectPath={project.path} active={active} />

      {/* New Task row */}
      <div style={{ display: "flex", gap: 4, padding: "0 10px" }}>
        <button
          style={{
            ...s.newTaskRow,
            flex: 1,
            padding: "7px 10px",
            margin: 0,
            background: isNewTask ? "var(--control-active-bg)" : "var(--bg-card)",
            color: isNewTask ? "var(--control-active-fg)" : "var(--text-secondary)",
          }}
          onClick={onNewTask}
        >
          <Plus size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>
            {t("task.newTask")}
            <span style={{ opacity: 0.5, marginLeft: 6, fontSize: 11 }}>
              {formatShortcutHint("new-task", APP_PLATFORM)}
            </span>
          </span>
        </button>
        <button
          type="button"
          style={{
            ...s.newTaskRow,
            flex: 0,
            padding: "7px 8px",
            margin: 0,
            background: "var(--bg-card)",
            color: "var(--text-muted)",
          }}
          onClick={() => setShowSessionPicker(true)}
          title={t("session.attachSession")}
        >
          <LinkIcon size={14} strokeWidth={2.2} />
        </button>
      </div>

      <div style={s.taskActionsRow}>
        <div style={s.taskActionsMeta}>{tasks.length} {t("task.tasks")}</div>
        <button
          type="button"
          style={{
            ...s.taskActionBtn,
            opacity: tasks.length > 0 ? 1 : 0.45,
            cursor: tasks.length > 0 ? "pointer" : "default",
          }}
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
          isDark={isDark}
          themeMode={themeMode}
          systemPrefersDark={systemPrefersDark}
          onThemeModeChange={onThemeModeChange}
          onToggleTheme={onToggleTheme}
        />
      </div>
      {showSessionPicker && (
        <SessionPickerDialog
          projectPath={project.path}
          onSelect={(session, resume) => {
            setShowSessionPicker(false);
            onAttachSession(session, resume);
          }}
          onClose={() => setShowSessionPicker(false)}
        />
      )}
    </div>
  );
});
