import { useCallback, useEffect, type RefObject } from "react";
import {
  FILE_TREE_POINTER_DRAG_EVENT,
  formatTerminalDroppedPaths,
  type FileTreePointerDragDetail,
} from "./pathDrop";
import { APP_PLATFORM } from "../platform";

export function useTerminalPathDrop({
  containerRef,
  isActive,
  onInsertText,
}: {
  containerRef: RefObject<HTMLElement | null>;
  isActive: boolean;
  onInsertText: (text: string) => void;
}) {
  const isDropInsideContainer = useCallback(
    (position: { x: number; y: number }) => {
      const container = containerRef.current;
      if (!container) return false;

      const rect = container.getBoundingClientRect();
      if (
        position.x < rect.left ||
        position.x > rect.right ||
        position.y < rect.top ||
        position.y > rect.bottom
      ) {
        return false;
      }

      const element = document.elementFromPoint(position.x, position.y);
      if (element && !container.contains(element)) return false;
      return true;
    },
    [containerRef],
  );

  const sendDroppedPaths = useCallback(
    (paths: string[]) => {
      const text = formatTerminalDroppedPaths(paths, APP_PLATFORM);
      if (!text) return;
      onInsertText(`${text} `);
    },
    [onInsertText],
  );

  useEffect(() => {
    if (!isActive) return;

    function handleFileTreePointerDrag(event: Event) {
      const { detail } = event as CustomEvent<FileTreePointerDragDetail>;
      if (
        detail.type !== "drop" ||
        detail.paths.length === 0 ||
        !isDropInsideContainer({ x: detail.x, y: detail.y })
      ) {
        return;
      }
      sendDroppedPaths(detail.paths);
    }

    window.addEventListener(FILE_TREE_POINTER_DRAG_EVENT, handleFileTreePointerDrag);
    return () => {
      window.removeEventListener(FILE_TREE_POINTER_DRAG_EVENT, handleFileTreePointerDrag);
    };
  }, [isActive, isDropInsideContainer, sendDroppedPaths]);
}
