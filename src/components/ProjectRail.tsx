import { useCallback, useState, useEffect, useMemo, useRef } from "react";
import type { Project, Task } from "../types";
import { ProjectAvatar } from "./ProjectAvatar";
import {
  RAIL_ITEM_SIZE,
  RAIL_ITEM_STRIDE,
  railDragPreviewAvatarWrap,
  railDragPreviewStyle,
} from "../styles/rail-drag";
import {
  EMPTY_PROJECT_ACTIVITY,
  buildProjectActivityMap,
  getProjectActivity,
} from "./project-rail/activity";
import { ProjectDrawer } from "./project-rail/ProjectDrawer";
import { ProjectRailActions } from "./project-rail/ProjectRailActions";
import { AttentionIndicator, RailItem } from "./project-rail/RailItem";
import {
  RAIL_DRAG_THRESHOLD_PX,
  RAIL_PADDING_TOP,
  RAIL_SUPPRESS_CLICK_MS,
  type DragOrigin,
  type DragViz,
  getRailItemTranslateY,
} from "./project-rail/drag";

export { projectMatchesRailSearch } from "./project-rail/search";

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

      {!singleProjectMode && (
        <ProjectRailActions
          drawerOpen={drawerOpen}
          onToggleDrawer={() => setDrawerOpen((v) => !v)}
          onOpen={onOpen}
        />
      )}

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
