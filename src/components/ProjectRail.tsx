import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
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
        background: isAttention ? "var(--color-warning, #f59e0b)" : "var(--color-success, #22c55e)",
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
  isDragging,
  isDragTarget,
  onSwitch,
  onPointerDown,
  onMount,
}: {
  project: Project;
  isActive: boolean;
  status: ProjectStatus;
  isDragging: boolean;
  isDragTarget: boolean;
  onSwitch: (p: Project) => void;
  onPointerDown: (
    projectId: string,
    event: {
      x: number;
      y: number;
      offsetX: number;
      offsetY: number;
      width: number;
      height: number;
      pointerId: number;
      node: HTMLButtonElement;
    },
  ) => void;
  onMount: (projectId: string, node: HTMLButtonElement | null) => void;
}) {
  const [hov, setHov] = useState(false);
  const transform = isDragging ? "scale(0.92)" : isDragTarget ? "scale(1.04)" : "translate3d(0, 0, 0)";

  return (
    <button
      ref={(node) => onMount(project.id, node)}
      title={project.name}
      data-project-rail-id={project.id}
      onClick={() => onSwitch(project)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const rect = event.currentTarget.getBoundingClientRect();
        onPointerDown(project.id, {
          x: event.clientX,
          y: event.clientY,
          offsetX: event.clientX - rect.left,
          offsetY: event.clientY - rect.top,
          width: rect.width,
          height: rect.height,
          pointerId: event.pointerId,
          node: event.currentTarget,
        });
      }}
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
        background: isDragTarget ? "var(--accent-subtle)" : "none",
        border: "none",
        borderRadius: 10,
        cursor: isDragging ? "grabbing" : isActive ? "grab" : "pointer",
        padding: 0,
        touchAction: "none",
        userSelect: "none",
        opacity: isDragging ? 0.16 : 1,
        transform,
        zIndex: isDragging ? 1 : 0,
        boxShadow: isDragTarget ? "0 4px 12px rgba(0,0,0,0.12)" : "none",
        outline: isActive
          ? "2px solid var(--accent)"
          : isDragTarget
            ? "2px solid var(--accent)"
          : hov
            ? "2px solid var(--border-medium)"
            : "2px solid transparent",
        outlineOffset: 1,
        transition:
          "transform 0.18s ease, outline-color 0.12s, opacity 0.12s, background 0.12s, box-shadow 0.16s",
      }}
    >
      <ProjectAvatar name={project.name} size={28} />
      <StatusBadge status={status} />
    </button>
  );
}

function DragPreview({
  project,
  status,
  x,
  y,
  width,
  height,
}: {
  project: Project;
  status: ProjectStatus;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return (
    <div
      style={{
        position: "fixed",
        left: x,
        top: y,
        width,
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 10,
        background: "color-mix(in srgb, var(--bg-sidebar) 84%, white 16%)",
        boxShadow: "0 12px 28px rgba(0,0,0,0.24)",
        transform: "scale(1.08)",
        pointerEvents: "none",
        zIndex: 999,
      }}
    >
      <div style={{ position: "relative", width: 28, height: 28 }}>
        <ProjectAvatar name={project.name} size={28} />
        <StatusBadge status={status} />
      </div>
    </div>
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
        boxShadow: "4px 0 16px rgba(0,0,0,0.12)",
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
                        status === "attention"
                          ? "var(--color-warning, #f59e0b)"
                          : "var(--color-success, #22c55e)",
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
  onReorderProjects,
  onPersistProjectOrder,
  onOpen,
}: {
  projects: Project[];
  allTasks: Task[];
  activeProjectId: string;
  onSwitch: (project: Project) => void;
  onReorderProjects: (draggedProjectId: string, targetProjectId: string) => void;
  onPersistProjectOrder: () => void;
  onOpen: () => void;
}) {
  const [addHov, setAddHov] = useState(false);
  const [expandHov, setExpandHov] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [dragTargetProjectId, setDragTargetProjectId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const draggedProjectIdRef = useRef<string | null>(null);
  const lastHoverProjectIdRef = useRef<string | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragMovedRef = useRef(false);
  const reorderChangedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const previousTopsRef = useRef<Map<string, number>>(new Map());
  const activePointerIdRef = useRef<number | null>(null);
  const activePointerNodeRef = useRef<HTMLButtonElement | null>(null);

  const clearDragState = useCallback(() => {
    const activePointerId = activePointerIdRef.current;
    const activePointerNode = activePointerNodeRef.current;
    if (activePointerId !== null && activePointerNode?.hasPointerCapture(activePointerId)) {
      activePointerNode.releasePointerCapture(activePointerId);
    }
    activePointerIdRef.current = null;
    activePointerNodeRef.current = null;

    if (reorderChangedRef.current) {
      onPersistProjectOrder();
    }
    if (dragMovedRef.current) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    draggedProjectIdRef.current = null;
    lastHoverProjectIdRef.current = null;
    pointerStartRef.current = null;
    reorderChangedRef.current = false;
    setDragPreview(null);
    setDraggedProjectId(null);
    setDragTargetProjectId(null);
    dragMovedRef.current = false;
  }, [onPersistProjectOrder]);

  function getProjectIdAtPoint(x: number, y: number): string | null {
    const element = document.elementFromPoint(x, y);
    const item = element?.closest("[data-project-rail-id]");
    return item instanceof HTMLElement ? (item.dataset.projectRailId ?? null) : null;
  }

  useEffect(() => {
    if (!draggedProjectId) return;

    function handlePointerMove(event: PointerEvent) {
      const start = pointerStartRef.current;
      const draggedId = draggedProjectIdRef.current;
      if (!start || !draggedId) return;

      const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (distance < 4) return;
      dragMovedRef.current = true;

      setDragPreview((prev) =>
        prev
          ? {
              ...prev,
              x: event.clientX - prev.offsetX,
              y: event.clientY - prev.offsetY,
            }
          : prev,
      );

      const targetProjectId = getProjectIdAtPoint(event.clientX, event.clientY);
      if (!targetProjectId || targetProjectId === lastHoverProjectIdRef.current) return;

      lastHoverProjectIdRef.current = targetProjectId;
      setDragTargetProjectId(targetProjectId);
      if (targetProjectId !== draggedId) {
        reorderChangedRef.current = true;
        onReorderProjects(draggedId, targetProjectId);
      }
    }

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", clearDragState);
    document.addEventListener("pointercancel", clearDragState);
    window.addEventListener("blur", clearDragState);

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", clearDragState);
      document.removeEventListener("pointercancel", clearDragState);
      window.removeEventListener("blur", clearDragState);
    };
  }, [clearDragState, draggedProjectId, onReorderProjects]);

  useLayoutEffect(() => {
    const nextTops = new Map<string, number>();

    projects.forEach((project) => {
      const node = itemRefs.current[project.id];
      if (!node) return;

      const top = node.getBoundingClientRect().top;
      nextTops.set(project.id, top);

      const previousTop = previousTopsRef.current.get(project.id);
      const delta = previousTop === undefined ? 0 : previousTop - top;
      if (delta === 0 || project.id === draggedProjectId) return;

      node.animate(
        [
          { transform: `translateY(${delta}px)` },
          { transform: "translateY(0)" },
        ],
        {
          duration: 180,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        },
      );
    });

    previousTopsRef.current = nextTops;
  }, [projects, draggedProjectId]);

  const draggedProject =
    draggedProjectId ? projects.find((project) => project.id === draggedProjectId) ?? null : null;

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
          isDragging={draggedProjectId === project.id}
          isDragTarget={dragTargetProjectId === project.id && draggedProjectId !== project.id}
          onSwitch={(p) => {
            if (dragMovedRef.current || suppressClickRef.current) return;
            onSwitch(p);
            setDrawerOpen(false);
          }}
          onPointerDown={(projectId, event) => {
            draggedProjectIdRef.current = projectId;
            lastHoverProjectIdRef.current = projectId;
            pointerStartRef.current = { x: event.x, y: event.y };
            activePointerIdRef.current = event.pointerId;
            activePointerNodeRef.current = event.node;
            event.node.setPointerCapture(event.pointerId);
            setDragPreview({
              x: event.x - event.offsetX,
              y: event.y - event.offsetY,
              width: event.width,
              height: event.height,
              offsetX: event.offsetX,
              offsetY: event.offsetY,
            });
            setDraggedProjectId(projectId);
            dragMovedRef.current = false;
            reorderChangedRef.current = false;
          }}
          onMount={(projectId, node) => {
            itemRefs.current[projectId] = node;
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
          background: addHov ? "var(--bg-hover)" : "none",
          border: "1.5px dashed var(--border-medium)",
          borderRadius: 8,
          cursor: "pointer",
          color: addHov ? "var(--text-muted)" : "var(--text-hint)",
          transition: "background 0.12s, color 0.12s",
        }}
      >
        <Plus size={14} strokeWidth={2.5} />
      </button>

      {draggedProject && dragPreview && (
        <DragPreview
          project={draggedProject}
          status={getProjectStatus(allTasks, draggedProject.id)}
          x={dragPreview.x}
          y={dragPreview.y}
          width={dragPreview.width}
          height={dragPreview.height}
        />
      )}

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
