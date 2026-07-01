import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { LayoutGrid, Star, X } from "lucide-react";
import type { Project, Task, TaskStatus } from "../types";
import { ProjectAvatar } from "./ProjectAvatar";
import { StatusIcon } from "./StatusIcon";
import { shortenPath } from "../utils";
import { useI18n, pluralKey } from "../i18n";
import s from "../styles";

/** 任何位置触发该 CustomEvent 都会在 App 根挂载看板全屏浮层（见 App.tsx 的监听器）。 */
export const OPEN_KANBAN_VIEW_EVENT = "nezha:open-kanban-view";

/** 看板上每列最多渲染多少卡片，超出折叠为 "+N more"。 */
const COLUMN_LIMIT = 5;

type ColumnKey = "running" | "attention" | "awaiting";

interface KanbanGroup {
  projectId: string;
  columns: Record<ColumnKey, Task[]>;
  totalActive: number;
}

function columnForStatus(status: TaskStatus): ColumnKey | null {
  switch (status) {
    case "pending":
    case "running":
      return "running";
    case "input_required":
    case "detached":
    case "interrupted":
      return "attention";
    case "awaiting_review":
      return "awaiting";
    default:
      return null;
  }
}

const COLUMN_ORDER: ColumnKey[] = ["running", "attention", "awaiting"];

const COLUMN_DOT_STYLE: Record<ColumnKey, CSSProperties> = {
  running: s.kanbanColumnDotRunning,
  attention: s.kanbanColumnDotAttention,
  awaiting: s.kanbanColumnDotAwaiting,
};

function taskTitle(task: Task): string {
  if (task.name && task.name.trim()) return task.name;
  const prompt = task.prompt.trim();
  return prompt.length > 0 ? prompt.split("\n")[0] : "(untitled)";
}

function sortAttention(a: Task, b: Task): number {
  return (b.attentionRequestedAt ?? b.createdAt) - (a.attentionRequestedAt ?? a.createdAt);
}

function KanbanCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      type="button"
      style={hov ? s.kanbanCardHover : s.kanbanCard}
      onClick={onClick}
      title={taskTitle(task)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <span style={s.kanbanCardStatus}>
        <StatusIcon status={task.status} />
      </span>
      <span style={s.kanbanCardTitle}>{taskTitle(task)}</span>
      {task.starred ? (
        <Star size={11} strokeWidth={2.2} fill="currentColor" style={s.kanbanCardStar} />
      ) : null}
    </button>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [hov, setHov] = useState(false);
  return (
    <button
      type="button"
      style={hov ? s.kanbanCloseBtnHover : s.kanbanCloseBtn}
      onClick={onClose}
      title={t("kanban.close")}
      aria-label={t("kanban.close")}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <X size={14} strokeWidth={1.8} />
    </button>
  );
}

function ProjectHeader({
  project,
  fallbackId,
  totalActive,
  onClick,
}: {
  project: Project | undefined;
  fallbackId: string;
  totalActive: number;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const [hov, setHov] = useState(false);
  return (
    <button
      type="button"
      style={hov ? s.kanbanProjectHeaderHover : s.kanbanProjectHeader}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={project?.path}
    >
      {project ? <ProjectAvatar name={project.name} size={18} /> : null}
      <span style={s.kanbanProjectName}>{project?.name ?? fallbackId}</span>
      {project ? (
        <span style={s.kanbanProjectPath}>{shortenPath(project.path)}</span>
      ) : null}
      <span style={s.kanbanProjectCount}>
        {t(
          pluralKey("kanban.activeCount", "kanban.activeCountPlural", totalActive),
          { count: totalActive },
        )}
      </span>
    </button>
  );
}

export function KanbanView({
  projects,
  tasks,
  onTaskClick,
  onProjectClick,
  onClose,
}: {
  projects: Project[];
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onProjectClick: (project: Project) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();

  // Esc 关闭浮层。capture 阶段以避免被 xterm/编辑器吞掉。
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handle, true);
    return () => window.removeEventListener("keydown", handle, true);
  }, [onClose]);

  const projectById = useMemo(() => {
    const map = new Map<string, Project>();
    projects.forEach((p) => map.set(p.id, p));
    return map;
  }, [projects]);

  const groups = useMemo<KanbanGroup[]>(() => {
    const byProject = new Map<string, KanbanGroup>();
    for (const task of tasks) {
      const col = columnForStatus(task.status);
      if (!col) continue;
      let group = byProject.get(task.projectId);
      if (!group) {
        group = {
          projectId: task.projectId,
          columns: { running: [], attention: [], awaiting: [] },
          totalActive: 0,
        };
        byProject.set(task.projectId, group);
      }
      group.columns[col].push(task);
      group.totalActive += 1;
    }
    // 列内排序：待介入和已完成待确认按 attention 时间倒序，进行中按创建时间倒序
    for (const group of byProject.values()) {
      group.columns.running.sort((a, b) => b.createdAt - a.createdAt);
      group.columns.attention.sort(sortAttention);
      group.columns.awaiting.sort(sortAttention);
    }
    return Array.from(byProject.values()).sort((a, b) => {
      // 项目排序：先按"待介入"数量倒序（最需要关注的在上），再按总活跃数倒序
      const aAttn = a.columns.attention.length;
      const bAttn = b.columns.attention.length;
      if (aAttn !== bAttn) return bAttn - aAttn;
      return b.totalActive - a.totalActive;
    });
  }, [tasks]);

  const totalActive = groups.reduce((sum, g) => sum + g.totalActive, 0);

  if (groups.length === 0) {
    return (
      <div style={s.kanbanPane}>
        <div style={s.kanbanHeader}>
          <div style={s.kanbanTitle}>{t("kanban.title")}</div>
          <CloseButton onClose={onClose} />
        </div>
        <div style={s.kanbanSubtitle}>{t("kanban.subtitle")}</div>
        <div style={s.kanbanEmpty}>
          <LayoutGrid size={28} strokeWidth={1.2} color="var(--text-hint)" />
          <div>{t("kanban.empty")}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.kanbanPane}>
      <div style={s.kanbanHeader}>
        <div style={s.kanbanTitle}>{t("kanban.title")}</div>
        <CloseButton onClose={onClose} />
      </div>
      <div style={s.kanbanSubtitle}>
        {t("kanban.summary", { projects: groups.length, tasks: totalActive })}
      </div>
      {groups.map((group) => {
        const project = projectById.get(group.projectId);
        return (
          <section key={group.projectId} style={s.kanbanProjectBlock}>
            <ProjectHeader
              project={project}
              fallbackId={group.projectId}
              totalActive={group.totalActive}
              onClick={() => {
                if (project) onProjectClick(project);
              }}
            />
            <div style={s.kanbanColumns}>
              {COLUMN_ORDER.map((col) => {
                const tasks = group.columns[col];
                const visible = tasks.slice(0, COLUMN_LIMIT);
                const overflow = tasks.length - visible.length;
                return (
                  <div key={col} style={s.kanbanColumn}>
                    <div style={s.kanbanColumnHeader}>
                      <span
                        style={COLUMN_DOT_STYLE[col]}
                        aria-hidden
                      />
                      <span style={s.kanbanColumnTitle}>
                        {t(`kanban.column.${col}`)}
                      </span>
                      <span style={s.kanbanColumnCount}>{tasks.length}</span>
                    </div>
                    {visible.length === 0 ? (
                      <div style={s.kanbanColumnEmpty}>—</div>
                    ) : (
                      visible.map((task) => (
                        <KanbanCard
                          key={task.id}
                          task={task}
                          onClick={() => onTaskClick(task)}
                        />
                      ))
                    )}
                    {overflow > 0 ? (
                      <button
                        type="button"
                        style={s.kanbanColumnMore}
                        onClick={() => {
                          if (project) onProjectClick(project);
                        }}
                      >
                        {t("kanban.more", { count: overflow })}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
