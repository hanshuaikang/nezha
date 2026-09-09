import { memo, useEffect, useState } from "react";
import type React from "react";
import type { Project } from "../../types";
import { ProjectAvatar } from "../ProjectAvatar";
import claudeWaveGif from "../../assets/gif/claude-wave.gif";
import type { ProjectStatus } from "./activity";

// 状态指示所在的容器底色：描边颜色要与之融合（rail / 拖拽预览 vs 抽屉）。
export type RailIndicatorSurface = "sidebar" | "panel";

// 项目状态指示:启用角标且存在待确认任务时显示数量角标,否则回退为小圆点。
export function AttentionIndicator({
  status,
  count,
  showBadge,
}: {
  status: ProjectStatus;
  count: number;
  showBadge: boolean;
}) {
  if (!status) return null;
  const isAttention = status === "attention";
  if (showBadge && isAttention && count > 0) {
    return <span className="rail-attention-badge">{count > 99 ? "99+" : count}</span>;
  }
  return (
    <span className="rail-status-dot" data-status={isAttention ? "attention" : "running"} />
  );
}

export const RailItem = memo(function RailItem({
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
  const [waving, setWaving] = useState(false);

  // waveNonce 每次递增(出现新的待确认任务)就触发一次性招手,3.6s 后卸载。
  // 卸载+重新挂载可让 gif 从首帧重播,同时重启 CSS 探头/缩回动画。
  useEffect(() => {
    if (waveNonce <= 0) return;
    setWaving(true);
    const id = setTimeout(() => setWaving(false), 3600);
    return () => clearTimeout(id);
  }, [waveNonce]);

  // 让位位移是拖拽期间的高频动态值,通过 CSS 变量注入,其余样式见 project-rail.css。
  const dynamicVars = { "--rail-item-dy": `${translateY}px` } as React.CSSProperties;

  return (
    <button
      data-rail-id={project.id}
      title={project.name}
      className="rail-item rail-indicator-host"
      data-surface="sidebar"
      data-active={isActive}
      data-dragging={isDragging}
      data-moving={translateY !== 0}
      style={dynamicVars}
      onClick={() => onClick(project)}
      onPointerDown={(event) => onPointerDown(project, event)}
    >
      {waving && (
        <img key={waveNonce} src={claudeWaveGif} alt="" className="rail-item-mascot" />
      )}
      <ProjectAvatar name={project.name} size={28} className="rail-item-avatar" />
      <AttentionIndicator status={status} count={attentionCount} showBadge={showBadge} />
    </button>
  );
});
