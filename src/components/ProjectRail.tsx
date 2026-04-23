import { useState, useEffect, useRef } from "react";
import { Plus, ChevronsRight } from "lucide-react";
import type { Project, Task } from "../types";
import { ProjectAvatar } from "./ProjectAvatar";

type ProjectStatus = "attention" | "running" | null;

function getProjectStatus(tasks: Task[], projectId: string): ProjectStatus {
  const projectTasks = tasks.filter((t) => t.projectId === projectId);
  if (projectTasks.some((t) => t.status === "input_required")) return "attention";
  if (projectTasks.some((t) => t.status === "running" || t.status === "pending")) return "running";
  return null;
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  if (!status) return null;
  const isAttention = status === "attention";
  return (
    <span
      style={{
        position: "absolute",
        bottom: -1,
        right: -1,
        width: 9,
        height: 9,
        borderRadius: "50%",
        background: isAttention ? "var(--color-warning)" : "var(--color-success)",
        border: "2px solid var(--bg-sidebar)",
        boxSizing: "border-box" as const,
      }}
    />
  );
}

function RailItem({
  project,
  isActive,
  status,
  onSwitch,
}: {
  project: Project;
  isActive: boolean;
  status: ProjectStatus;
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
      <StatusBadge status={status} />
    </button>
  );
}

function ProjectDrawer({
  projects,
  allTasks,
  activeProjectId,
  onSwitch,
  onClose,
}: {
  projects: Project[];
  allTasks: Task[];
  activeProjectId: string;
  onSwitch: (p: Project) => void;
  onClose: () => void;
}) {
  const drawerRef = useRef<HTMLDivElement>(null);

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
          padding: "14px 14px 8px",
          fontSize: 11,
          fontWeight: 700,
          color: "var(--text-hint)",
          letterSpacing: 0.7,
          textTransform: "uppercase",
          borderBottom: "1px solid var(--border-dim)",
          marginBottom: 4,
        }}
      >
        Projects
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px 8px" }}>
        {projects.map((project) => {
          const status = getProjectStatus(allTasks, project.id);
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
                {status && (
                  <span
                    style={{
                      position: "absolute",
                      bottom: -1,
                      right: -1,
                      width: 9,
                      height: 9,
                      borderRadius: "50%",
                      background:
                        status === "attention" ? "var(--color-warning)" : "var(--color-success)",
                      border: "2px solid var(--bg-panel)",
                      boxSizing: "border-box",
                    }}
                  />
                )}
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
  onSwitch,
  onOpen,
}: {
  projects: Project[];
  allTasks: Task[];
  activeProjectId: string;
  onSwitch: (project: Project) => void;
  onOpen: () => void;
}) {
  const [addHov, setAddHov] = useState(false);
  const [expandHov, setExpandHov] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
      {projects.map((project) => (
        <RailItem
          key={project.id}
          project={project}
          isActive={project.id === activeProjectId}
          status={getProjectStatus(allTasks, project.id)}
          onSwitch={(p) => {
            onSwitch(p);
            setDrawerOpen(false);
          }}
        />
      ))}

      <div style={{ flex: 1 }} />

      <button
        title="Show all projects"
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
        title="Open project"
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

      {drawerOpen && (
        <ProjectDrawer
          projects={projects}
          allTasks={allTasks}
          activeProjectId={activeProjectId}
          onSwitch={onSwitch}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}
