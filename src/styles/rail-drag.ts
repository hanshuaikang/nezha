import type React from "react";

// RailItem 的尺寸与项间距来自 ProjectRail 的视觉规范:item 36px、container gap 5px。
// 拖拽时让位距离 = item + gap,改这里需要同步 ProjectRail 的对应字段。
export const RAIL_ITEM_SIZE = 36;
export const RAIL_ITEM_GAP = 5;
export const RAIL_ITEM_STRIDE = RAIL_ITEM_SIZE + RAIL_ITEM_GAP;

// 跟手指走的拖拽预览浮层。fixed 定位、不响应事件、置顶。
export function railDragPreviewStyle({
  x,
  y,
  size,
}: {
  x: number;
  y: number;
  size: number;
}): React.CSSProperties {
  return {
    position: "fixed",
    left: x,
    top: y,
    width: size,
    height: size,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    background: "color-mix(in srgb, var(--bg-sidebar) 84%, white 16%)",
    boxShadow: "0 12px 28px rgba(0,0,0,0.24)",
    transform: "scale(1.08)",
    pointerEvents: "none",
    zIndex: 999,
  };
}

// 浮层内部为 ProjectAvatar + AttentionIndicator 提供 stacking context。
export const railDragPreviewAvatarWrap: React.CSSProperties = {
  position: "relative",
  width: 28,
  height: 28,
};
