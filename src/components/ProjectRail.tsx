import { memo, useCallback, useState, useEffect, useMemo, useRef } from "react";
import { Plus, ChevronsRight, Search, PinOff } from "lucide-react";
import type { Project, Task } from "../types";
import { ProjectAvatar } from "./ProjectAvatar";
import { useI18n } from "../i18n";
import s from "../styles";
import {
  RAIL_ITEM_SIZE,
  RAIL_ITEM_STRIDE,
  railDragPreviewAvatarWrap,
  railDragPreviewStyle,
} from "../styles/rail-drag";
import claudeWaveGif from "../assets/gif/claude-wave.gif";

const RAIL_PADDING_TOP = 10;
const RAIL_DRAG_THRESHOLD_PX = 4;
const RAIL_SUPPRESS_CLICK_MS = 500;

type ProjectStatus = "attention" | "running" | null;
type ProjectActivity = {
  status: ProjectStatus;
  attentionCount: number;
};

const EMPTY_PROJECT_ACTIVITY: ProjectActivity = { status: null, attentionCount: 0 };

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

function getProjectActivity(
  activityByProjectId: Map<string, ProjectActivity>,
  projectId: string,
): ProjectActivity {
  return activityByProjectId.get(projectId) ?? EMPTY_PROJECT_ACTIVITY;
}

function buildProjectActivityMap(tasks: Task[]): Map<string, ProjectActivity> {
  const activityByProjectId = new Map<string, ProjectActivity>();
  for (const task of tasks) {
    let activity = activityByProjectId.get(task.projectId);
    if (!activity) {
      activity = { status: null, attentionCount: 0 };
      activityByProjectId.set(task.projectId, activity);
    }

    if (task.status === "input_required") {
      activity.attentionCount += 1;
      activity.status = "attention";
    } else if (task.status === "detached" || task.status === "interrupted") {
      activity.status = "attention";
    } else if ((task.status === "running" || task.status === "pending") && activity.status === null) {
      activity.status = "running";
    }
  }
  return activityByProjectId;
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

const RailItem = memo(function RailItem({
  project,
  isActive,
  status,
  attentionCount,
  showBadge,
  waveNonce,
  isDragging,
  translateY,
  onPointerDown,
  onClick,
}: {
  project: Project;
  isActive: boolean;
  status: ProjectStatus;
  attentionCount: number;
  showBadge: boolean;
  waveNonce: number;
  isDragging: boolean;
  translateY: number;
  onPointerDown: (project: Project, event: React.PointerEvent<HTMLButtonElement>) => void;
  onClick: (project: Project) => void;
}) {
  const [hov, setHov] = useState(false);
  const [waving, setWaving] = useState(false);

  // waveNonce 每次递增(出现新的待确认任务)就触发一次性招手,3.6s 后卸载。
  // 卸载+重新挂载可让 gif 从首帧重播,同时重启 CSS 探头/缩回动画。
  useEffect(() => {
    if (waveNonce <= 0) return;
    setWaving(true);
    const id = setTimeout(() => setWaving(false), 3600);
    return () => clearTimeout(id);
  }, [waveNonce]);

  // outline 颜色保持瞬变(与旧版本一致 — 加 transition 后切 active 会看到 ~120ms 的
  // 颜色过渡,视觉上"框慢半拍稳定"。transform / opacity 仍需平滑过渡。
  const transition = "transform 160ms cubic-bezier(0.22, 1, 0.36, 1), opacity 100ms";

  return (
    <button
      data-rail-id={project.id}
      title={project.name}
      onClick={() => onClick(project)}
      onPointerDown={(event) => onPointerDown(project, event)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className={isActive ? "rail-active" : undefined}
      style={{
        position: "relative",
        width: RAIL_ITEM_SIZE,
        height: RAIL_ITEM_SIZE,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "none",
        border: "none",
        borderRadius: 10,
        cursor: isDragging ? "grabbing" : isActive ? "grab" : "pointer",
        padding: 0,
        outline: isActive
          ? "2px solid var(--accent)"
          : hov
            ? "2px solid var(--border-medium)"
            : "2px solid transparent",
        outlineOffset: 1,
        transition,
        transform: `translate3d(0, ${translateY}px, 0)`,
        opacity: isDragging ? 0.18 : 1,
        touchAction: "none",
        userSelect: "none",
        willChange: translateY !== 0 || isDragging ? "transform" : undefined,
      }}
    >
      {waving && (
        <img
          key={waveNonce}
          src={claudeWaveGif}
          alt=""
          className="rail-mascot-wave"
          style={s.railMascot}
        />
      )}
      <ProjectAvatar name={project.name} size={28} style={s.railAvatarStacked} />
      <AttentionIndicator
        status={status}
        count={attentionCount}
        showBadge={showBadge}
        borderColor="var(--bg-sidebar)"
      />
    </button>
  );
});

// 让位 transform:dragged 自己不动(用 DragPreview 跟手指),
// 其他项按 dropIndex 与 draggedVisibleIndex 的相对位置平移一个 stride。
// dropIndex ∈ [0, visibleLen],代表"插入到位置 i 之前"。
function getRailItemTranslateY(
  visibleIndex: number,
  draggedVisibleIndex: number,
  dropIndex: number,
): number {
  if (visibleIndex === draggedVisibleIndex) return 0;
  if (draggedVisibleIndex < dropIndex) {
    if (visibleIndex > draggedVisibleIndex && visibleIndex < dropIndex) return -RAIL_ITEM_STRIDE;
  } else if (draggedVisibleIndex > dropIndex) {
    if (visibleIndex >= dropIndex && visibleIndex < draggedVisibleIndex) return RAIL_ITEM_STRIDE;
  }
  return 0;
}

function ProjectDrawer({
  projects,
  activityByProjectId,
  activeProjectId,
  showBadge,
  onSwitch,
  onClose,
}: {
  projects: Project[];
  activityByProjectId: Map<string, ProjectActivity>;
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
          const activity = getProjectActivity(activityByProjectId, project.id);
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
                  status={activity.status}
                  count={activity.attentionCount}
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

type DragOrigin = {
  draggedId: string;
  offsetX: number;
  offsetY: number;
};

type DragViz = {
  dropIndex: number;
  previewX: number;
  previewY: number;
};

export function ProjectRail({
  projects,
  allTasks,
  activeProjectId,
  attentionBadge = true,
  onSwitch,
  onCommitProjectOrder,
  onOpen,
  singleProjectMode = false,
}: {
  projects: Project[];
  allTasks: Task[];
  activeProjectId: string;
  attentionBadge?: boolean;
  onSwitch: (project: Project) => void;
  onCommitProjectOrder: (
    draggedId: string,
    beforeId: string | null,
    visibleIds: string[],
  ) => void;
  onOpen: () => void;
  singleProjectMode?: boolean;
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
  const projectActivityById = useMemo(() => buildProjectActivityMap(allTasks), [allTasks]);

  // 拖拽相关:dragOrigin 一旦设置就开始监听 document 事件;dragViz 高频更新 dropIndex / preview
  // 位置驱动让位动画与浮层。pointerup 时只 commit 一次,projects state 不在拖动过程中变化。
  const railContainerRef = useRef<HTMLDivElement>(null);
  const [dragOrigin, setDragOrigin] = useState<DragOrigin | null>(null);
  const [dragViz, setDragViz] = useState<DragViz | null>(null);
  const dragVizRef = useRef<DragViz | null>(null);
  const pendingDragVizRef = useRef<DragViz | null>(null);
  const dragVizRafRef = useRef<number | null>(null);
  const dragMovedRef = useRef(false);
  const suppressClickUntilRef = useRef(0);
  const suppressClickProjectIdRef = useRef<string | null>(null);
  const suppressClickResetTimerRef = useRef<number | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const activePointerNodeRef = useRef<HTMLButtonElement | null>(null);

  const railProjectsRef = useRef(railProjects);
  useEffect(() => {
    railProjectsRef.current = railProjects;
  }, [railProjects]);

  useEffect(() => {
    return () => {
      if (suppressClickResetTimerRef.current !== null) {
        window.clearTimeout(suppressClickResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!dragOrigin) return;

    function flushDragViz() {
      dragVizRafRef.current = null;
      const nextViz = pendingDragVizRef.current;
      pendingDragVizRef.current = null;
      if (nextViz) setDragViz(nextViz);
    }

    function scheduleDragViz(nextViz: DragViz) {
      dragVizRef.current = nextViz;
      pendingDragVizRef.current = nextViz;
      if (dragVizRafRef.current !== null) return;
      dragVizRafRef.current = requestAnimationFrame(flushDragViz);
    }

    function handleMove(event: PointerEvent) {
      const start = pointerStartRef.current;
      if (!start) return;

      if (!dragMovedRef.current) {
        const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
        if (distance < RAIL_DRAG_THRESHOLD_PX) return;
        dragMovedRef.current = true;
      }

      const container = railContainerRef.current;
      if (!container || !dragOrigin) return;
      const rect = container.getBoundingClientRect();
      const relativeY = event.clientY - rect.top - RAIL_PADDING_TOP;
      const rawIndex = Math.round(relativeY / RAIL_ITEM_STRIDE);
      const visibleLen = railProjectsRef.current.length;
      const dropIndex = Math.max(0, Math.min(visibleLen, rawIndex));

      const nextViz: DragViz = {
        dropIndex,
        previewX: event.clientX - dragOrigin.offsetX,
        previewY: event.clientY - dragOrigin.offsetY,
      };
      scheduleDragViz(nextViz);
    }

    // pointerup 后会有 click 派发,dragMovedRef 留给 click 守卫读完再清;
    // pointercancel / blur 不会派发 click,如果不在此时清,ref 会停在 true 上,
    // 下次键盘 Tab+Enter 派发的 synthetic click 会被静默吞掉。
    function handleEnd(clearMovedNow: boolean) {
      const moved = dragMovedRef.current;
      const viz = dragVizRef.current;
      if (moved && viz && dragOrigin) {
        const visible = railProjectsRef.current;
        const draggedVisibleIdx = visible.findIndex((p) => p.id === dragOrigin.draggedId);
        const dropIdx = viz.dropIndex;
        const noop =
          draggedVisibleIdx === -1 ||
          dropIdx === draggedVisibleIdx ||
          dropIdx === draggedVisibleIdx + 1;
        if (!noop) {
          const beforeId = dropIdx < visible.length ? visible[dropIdx].id : null;
          onCommitProjectOrder(
            dragOrigin.draggedId,
            beforeId,
            visible.map((p) => p.id),
          );
        }
      }
      const pointerId = activePointerIdRef.current;
      const pointerNode = activePointerNodeRef.current;
      if (pointerId !== null && pointerNode?.hasPointerCapture(pointerId)) {
        pointerNode.releasePointerCapture(pointerId);
      }
      activePointerIdRef.current = null;
      activePointerNodeRef.current = null;
      pointerStartRef.current = null;
      pendingDragVizRef.current = null;
      if (dragVizRafRef.current !== null) {
        cancelAnimationFrame(dragVizRafRef.current);
        dragVizRafRef.current = null;
      }
      dragVizRef.current = null;
      setDragViz(null);
      setDragOrigin(null);
      if (clearMovedNow || !moved || !dragOrigin) {
        dragMovedRef.current = false;
      } else {
        if (suppressClickResetTimerRef.current !== null) {
          window.clearTimeout(suppressClickResetTimerRef.current);
        }
        suppressClickUntilRef.current = performance.now() + RAIL_SUPPRESS_CLICK_MS;
        suppressClickProjectIdRef.current = dragOrigin.draggedId;
        suppressClickResetTimerRef.current = window.setTimeout(() => {
          dragMovedRef.current = false;
          suppressClickUntilRef.current = 0;
          suppressClickProjectIdRef.current = null;
          suppressClickResetTimerRef.current = null;
        }, RAIL_SUPPRESS_CLICK_MS);
      }
    }

    function handlePointerUp() {
      handleEnd(false);
    }
    function handleAbort() {
      handleEnd(true);
    }

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handleAbort);
    window.addEventListener("blur", handleAbort);
    return () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handleAbort);
      window.removeEventListener("blur", handleAbort);
      if (dragVizRafRef.current !== null) {
        cancelAnimationFrame(dragVizRafRef.current);
        dragVizRafRef.current = null;
      }
    };
  }, [dragOrigin, onCommitProjectOrder]);

  const handleRailItemPointerDown = useCallback((
    project: Project,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button !== 0) return;
    const node = event.currentTarget;
    const rect = node.getBoundingClientRect();
    node.setPointerCapture(event.pointerId);
    activePointerIdRef.current = event.pointerId;
    activePointerNodeRef.current = node;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    dragMovedRef.current = false;
    // dragViz 不在 pointerdown 立即 set:纯 click 切项目走不到 handleMove 阈值,
    // 也不该触发浮层 mount / ProjectAvatar 实例化。延后到 handleMove 第一次
    // 跨过 RAIL_DRAG_THRESHOLD_PX 阈值时再初始化。
    setDragOrigin({
      draggedId: project.id,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    });
  }, []);

  const handleRailItemClick = useCallback((project: Project) => {
    const shouldSuppressClick =
      dragMovedRef.current ||
      (project.id === suppressClickProjectIdRef.current &&
        performance.now() < suppressClickUntilRef.current);
    if (shouldSuppressClick) {
      dragMovedRef.current = false;
      suppressClickUntilRef.current = 0;
      suppressClickProjectIdRef.current = null;
      if (suppressClickResetTimerRef.current !== null) {
        window.clearTimeout(suppressClickResetTimerRef.current);
        suppressClickResetTimerRef.current = null;
      }
      return;
    }
    onSwitch(project);
    setDrawerOpen(false);
  }, [onSwitch]);

  const draggedVisibleIndex = dragOrigin
    ? railProjects.findIndex((p) => p.id === dragOrigin.draggedId)
    : -1;
  const draggedProject =
    dragOrigin && draggedVisibleIndex !== -1 ? railProjects[draggedVisibleIndex] : null;
  const draggedProjectActivity = draggedProject
    ? getProjectActivity(projectActivityById, draggedProject.id)
    : EMPTY_PROJECT_ACTIVITY;

  // 招手触发:记录每个项目上一次的待确认数量,数量增加(0→≥1 或 n→n+1)时给该项目
  // 递增一个 nonce,RailItem 据此播一次招手动画。首帧只做初始化播种,不为已有任务招手。
  const prevAttentionRef = useRef<Map<string, number>>(new Map());
  const seededRef = useRef(false);
  const [waveNonces, setWaveNonces] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    const triggered: string[] = [];
    for (const p of railProjects) {
      const count = getProjectActivity(projectActivityById, p.id).attentionCount;
      const prev = prevAttentionRef.current.get(p.id) ?? 0;
      if (seededRef.current && count > prev) triggered.push(p.id);
      prevAttentionRef.current.set(p.id, count);
    }
    seededRef.current = true;
    if (triggered.length === 0) return;
    setWaveNonces((prev) => {
      const next = new Map(prev);
      for (const id of triggered) next.set(id, (next.get(id) ?? 0) + 1);
      return next;
    });
  }, [projectActivityById, railProjects]);

  return (
    <div
      ref={railContainerRef}
      style={{
        position: "relative",
        width: 52,
        flexShrink: 0,
        background: "var(--bg-sidebar)",
        borderRight: "1px solid var(--border-dim)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: RAIL_PADDING_TOP,
        paddingBottom: 10,
        gap: 5,
        overflow: "visible",
        zIndex: drawerOpen ? 50 : "auto",
      }}
    >
      {railProjects.map((project, index) => {
        const isDragging = dragOrigin?.draggedId === project.id;
        const activity = getProjectActivity(projectActivityById, project.id);
        const translateY =
          dragOrigin && dragViz && draggedVisibleIndex !== -1
            ? getRailItemTranslateY(index, draggedVisibleIndex, dragViz.dropIndex)
            : 0;
        return (
          <RailItem
            key={project.id}
            project={project}
            isActive={project.id === activeProjectId}
            status={activity.status}
            attentionCount={activity.attentionCount}
            showBadge={attentionBadge}
            waveNonce={waveNonces.get(project.id) ?? 0}
            isDragging={isDragging}
            translateY={translateY}
            onPointerDown={handleRailItemPointerDown}
            onClick={handleRailItemClick}
          />
        );
      })}

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
          activityByProjectId={projectActivityById}
          activeProjectId={activeProjectId}
          showBadge={attentionBadge}
          onSwitch={onSwitch}
          onClose={() => setDrawerOpen(false)}
        />
      )}

      {draggedProject && dragViz && (
        <div
          style={railDragPreviewStyle({
            x: dragViz.previewX,
            y: dragViz.previewY,
            size: RAIL_ITEM_SIZE,
          })}
        >
          <div style={railDragPreviewAvatarWrap}>
            <ProjectAvatar name={draggedProject.name} size={28} />
            <AttentionIndicator
              status={draggedProjectActivity.status}
              count={draggedProjectActivity.attentionCount}
              showBadge={attentionBadge}
              borderColor="var(--bg-sidebar)"
            />
          </div>
        </div>
      )}
    </div>
  );
}
