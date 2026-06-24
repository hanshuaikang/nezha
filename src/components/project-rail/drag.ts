import { RAIL_ITEM_STRIDE } from "../../styles/rail-drag";

export const RAIL_PADDING_TOP = 10;
export const RAIL_DRAG_THRESHOLD_PX = 4;
export const RAIL_SUPPRESS_CLICK_MS = 500;

export type DragOrigin = {
  draggedId: string;
  offsetX: number;
  offsetY: number;
};

export type DragViz = {
  dropIndex: number;
  previewX: number;
  previewY: number;
};

// 让位 transform:dragged 自己不动(用 DragPreview 跟手指),
// 其他项按 dropIndex 与 draggedVisibleIndex 的相对位置平移一个 stride。
// dropIndex ∈ [0, visibleLen],代表"插入到位置 i 之前"。
export function getRailItemTranslateY(
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
