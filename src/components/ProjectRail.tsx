import { useState, useEffect, useMemo, useRef } from "react";
import { Plus, ChevronsRight, Search, PinOff } from "lucide-react";
import type { Project, Task } from "../types";
import { ProjectAvatar } from "./ProjectAvatar";
import { useI18n } from "../i18n";
import s from "../styles";

type ProjectStatus = "attention" | "running" | null;

function normalizeProjectSearchText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase();
}

export function projectMatchesRailSearch(project: Project, query: string) {
  const normalizedQuery = normalizeProjectSearchText(query.trim());
  if (!normalizedQuery) return true;

  return [project.name, project.path].some((value) =>
    normalizeProjectSearchText(value).includes(normalizedQuery),
  );
}

function getProjectStatus(tasks: Task[], projectId: string): ProjectStatus {
  const projectTasks = tasks.filter((t) => t.projectId === projectId);
  if (
    projectTasks.some(
      (t) => t.status === "input_required" || t.status === "detached" || t.status === "interrupted",
    )
  ) {
    return "attention";
  }
  if (projectTasks.some((t) => t.status === "running" || t.status === "pending")) return "running";
  return null;
}

// 待确认(input_required)任务数——用于黄色数量角标
function getAttentionCount(tasks: Task[], projectId: string): number {
  return tasks.filter((t) => t.projectId === projectId && t.status === "input_required").length;
}

// 项目状态指示:启用角标且存在待确认任务时显示数量角标,否则回退为小圆点。
// borderColor 用于与所在容器背景描边融合(rail 与 drawer 背景不同)。
function AttentionIndicator({
  status,
  count,
  showBadge,
  borderColor,
}: {
  status: ProjectStatus;
  count: number;
  showBadge: boolean;
  borderColor: string;
}) {
  if (!status) return null;
  const isAttention = status === "attention";
  if (showBadge && isAttention && count > 0) {
    return (
      <span style={{ ...s.railAttentionBadge, borderColor }}>{count > 99 ? "99+" : count}</span>
    );
  }
  return (
    <span
      style={{
        ...s.railStatusDot,
        background: isAttention ? "var(--color-warning)" : "var(--color-success)",
        borderColor,
      }}
    />
  );
}

function RailItem({
  project,
  isActive,
  status,
  attentionCount,
  showBadge,
  shortcutLabel,
  shortcutHintsVisible,
  onSwitch,
}: {
  project: Project;
  isActive: boolean;
  status: ProjectStatus;
  attentionCount: number;
  showBadge: boolean;
  shortcutLabel?: string;
  shortcutHintsVisible?: boolean;
  onSwitch: (p: Project) => void;
}) {
  const [hov, setHov] = useState(false);

  return (
    <button
      title={project.name}
      onClick={() => onSwitch(project)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className={isActive ? "rail-active" : undefined}
      style={{
        position: "relative",
        width: 36,
        height: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "none",
        border: "none",
        borderRadius: 10,
        cursor: isActive ? "default" : "pointer",
        padding: 0,
        outline: isActive
          ? "2px solid var(--accent)"
          : hov
            ? "2px solid var(--border-medium)"
            : "2px solid transparent",
        outlineOffset: 1,
        transition: isActive ? "none" : "outline-color 0.12s",
      }}
    >
      <ProjectAvatar name={project.name} size={28} />
      <AttentionIndicator
        status={status}
        count={attentionCount}
        showBadge={showBadge && !shortcutHintsVisible}
        borderColor="var(--bg-sidebar)"
      />
      {shortcutLabel && (
        <span
          aria-hidden="true"
          style={{
            ...s.railShortcutBadge,
            opacity: shortcutHintsVisible ? 1 : 0,
            transform: shortcutHintsVisible ? "translateY(0)" : "translateY(2px)",
          }}
        >
          {shortcutLabel}
        </span>
      )}
    </button>
  );
}

function ProjectDrawer({
  projects,
  allTasks,
  activeProjectId,
  showBadge,
  onSwitch,
  onClose,
}: {
  projects: Project[];
  allTasks: Task[];
  activeProjectId: string;
  showBadge: boolean;
  onSwitch: (p: Project) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const drawerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => projectMatchesRailSearch(project, query));
  }, [projects, query]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={drawerRef}
      style={{
        position: "absolute",
        left: 52,
        top: 0,
        bottom: 0,
        width: 220,
        background: "var(--bg-panel)",
        borderRight: "1px solid var(--border-dim)",
        display: "flex",
        flexDirection: "column",
        zIndex: 50,
        boxShadow: "var(--shadow-drawer)",
      }}
    >
      <div
        style={{
          padding: "12px 12px 10px",
          borderBottom: "1px solid var(--border-dim)",
        }}
      >
        <div
          style={{
            margin: "0 2px 8px",
            fontSize: 11,
            fontWeight: 700,
            color: "var(--text-hint)",
            letterSpacing: 0.7,
            textTransform: "uppercase",
          }}
        >
          {t("welcome.projects")}
        </div>
        <div
          style={{
            ...s.panelSearchWrap,
            margin: 0,
          }}
        >
          <Search size={13} strokeWidth={2} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              if (query) {
                setQuery("");
              } else {
                onClose();
              }
            }}
            placeholder={t("welcome.searchProjects")}
            style={{ ...s.panelSearchInput, minWidth: 0 }}
          />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px 8px" }}>
        {filteredProjects.length === 0 && (
          <div
            style={{
              padding: "24px 10px",
              textAlign: "center",
              color: "var(--text-hint)",
              fontSize: 12,
            }}
          >
            {t("welcome.noMatchingProjects")}
          </div>
        )}
        {filteredProjects.map((project) => {
          const status = getProjectStatus(allTasks, project.id);
          const attentionCount = getAttentionCount(allTasks, project.id);
          const isActive = project.id === activeProjectId;
          return (
            <button
              key={project.id}
              onClick={() => {
                onSwitch(project);
                onClose();
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 8px",
                borderRadius: 8,
                border: "none",
                background: isActive ? "var(--accent-subtle)" : "none",
                cursor: isActive ? "default" : "pointer",
                textAlign: "left",
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => {
                if (!isActive)
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "none";
              }}
            >
              <div style={{ position: "relative", flexShrink: 0 }}>
                <ProjectAvatar name={project.name} size={28} />
                <AttentionIndicator
                  status={status}
                  count={attentionCount}
                  showBadge={showBadge}
                  borderColor="var(--bg-panel)"
                />
              </div>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? "var(--accent)" : "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {project.name}
              </span>
              {project.hiddenFromRail && (
                <PinOff
                  size={12}
                  strokeWidth={2}
                  color="var(--text-hint)"
                  style={s.railHiddenIcon}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ProjectRail({
  projects,
  allTasks,
  activeProjectId,
  attentionBadge = true,
  onSwitch,
  onOpen,
  singleProjectMode = false,
  shortcutLabelsByProjectId,
  shortcutHintsVisible,
  openDrawerRequest = 0,
}: {
  projects: Project[];
  allTasks: Task[];
  activeProjectId: string;
  attentionBadge?: boolean;
  onSwitch: (project: Project) => void;
  onOpen: () => void;
  singleProjectMode?: boolean;
  shortcutLabelsByProjectId?: Record<string, string>;
  shortcutHintsVisible?: boolean;
  openDrawerRequest?: number;
}) {
  const { t } = useI18n();
  const [addHov, setAddHov] = useState(false);
  const [expandHov, setExpandHov] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 竖条只显示常驻项目；当前激活项目即使被设为非常驻也始终保留，避免失去当前上下文。
  const railProjects = useMemo(
    () => projects.filter((p) => !p.hiddenFromRail || p.id === activeProjectId),
    [projects, activeProjectId],
  );

  useEffect(() => {
    if (singleProjectMode || openDrawerRequest <= 0) return;
    setDrawerOpen(true);
  }, [openDrawerRequest, singleProjectMode]);

  return (
    <div
      style={{
        position: "relative",
        width: 52,
        flexShrink: 0,
        background: "var(--bg-sidebar)",
        borderRight: "1px solid var(--border-dim)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 10,
        paddingBottom: 10,
        gap: 5,
        overflow: "visible",
        zIndex: drawerOpen ? 50 : "auto",
      }}
    >
      {railProjects.map((project) => (
        <RailItem
          key={project.id}
          project={project}
          isActive={project.id === activeProjectId}
          status={getProjectStatus(allTasks, project.id)}
          attentionCount={getAttentionCount(allTasks, project.id)}
          showBadge={attentionBadge}
          shortcutLabel={shortcutLabelsByProjectId?.[project.id]}
          shortcutHintsVisible={shortcutHintsVisible}
          onSwitch={(p) => {
            onSwitch(p);
            setDrawerOpen(false);
          }}
        />
      ))}

      <div style={{ flex: 1 }} />

      {!singleProjectMode ? (
        <>
          <button
            title={t("project.showAllProjects")}
            onClick={() => setDrawerOpen((v) => !v)}
            onMouseEnter={() => setExpandHov(true)}
            onMouseLeave={() => setExpandHov(false)}
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: drawerOpen ? "var(--accent-subtle)" : expandHov ? "var(--bg-hover)" : "none",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              color: drawerOpen
                ? "var(--accent)"
                : expandHov
                  ? "var(--text-muted)"
                  : "var(--text-hint)",
              transition: "background 0.12s, color 0.12s",
            }}
          >
            <ChevronsRight
              size={14}
              strokeWidth={2.5}
              style={{
                transform: drawerOpen ? "rotate(180deg)" : "none",
                transition: "transform 0.18s",
              }}
            />
          </button>

          <button
            title={t("welcome.openProject")}
            onClick={onOpen}
            onMouseEnter={() => setAddHov(true)}
            onMouseLeave={() => setAddHov(false)}
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: addHov ? "var(--bg-hover)" : "var(--bg-card)",
              border: "1px solid var(--border-medium)",
              borderRadius: 8,
              cursor: "pointer",
              color: addHov ? "var(--text-primary)" : "var(--text-muted)",
              transition: "background 0.12s, color 0.12s",
            }}
          >
            <Plus size={14} strokeWidth={2.5} />
          </button>
        </>
      ) : null}

      {drawerOpen && !singleProjectMode && (
        <ProjectDrawer
          projects={projects}
          allTasks={allTasks}
          activeProjectId={activeProjectId}
          showBadge={attentionBadge}
          onSwitch={onSwitch}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}
