import { useCallback, useEffect, useRef, type RefObject } from "react";
import { getCurrentWebview, type DragDropEvent } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  FILE_TREE_POINTER_DRAG_EVENT,
  formatTerminalDroppedPaths,
  type FileTreePointerDragDetail,
} from "./pathDrop";
import { APP_PLATFORM } from "../platform";

// ---------- 外部（OS 级）拖放：模块级单例监听 ----------

interface ExternalDropSubscriber {
  containerRef: RefObject<HTMLElement | null>;
  onDropPaths: (paths: string[]) => void;
}

const externalDropSubscribers = new Set<ExternalDropSubscriber>();
let externalDropListenersStarted = false;
let lastExternalDrop: { key: string; at: number } | null = null;

function handleExternalDragDrop(payload: DragDropEvent) {
  // enter/over 在拖拽悬停期间以 mousemove 频率投递，必须首行零成本丢弃
  if (payload.type !== "drop" || externalDropSubscribers.size === 0) return;
  if (payload.paths.length === 0) return;

  // 同一次 drop 可能被 webview 与 window 两个事件源各投递一次（平台相关），
  // 按 paths + 时间窗去重，只处理第一份
  const key = payload.paths.join("\n");
  const now = Date.now();
  if (lastExternalDrop && lastExternalDrop.key === key && now - lastExternalDrop.at < 750) {
    return;
  }
  lastExternalDrop = { key, at: now };

  // Tauri 一律把坐标包成 PhysicalPosition，但 wry 只有 Windows（ScreenToClient
  // 后的客户区坐标）是真物理像素；macOS（NSDraggingInfo.draggingLocation）和
  // Linux（GTK widget 坐标）本就是逻辑坐标（上游 mislabel）。因此只在 Windows
  // 除以 devicePixelRatio，其余平台直接当 CSS 坐标用——Retina 屏上误除会把
  // 坐标砍半导致命中判定永远落空。
  const scale = APP_PLATFORM === "windows" ? window.devicePixelRatio || 1 : 1;
  const x = payload.position.x / scale;
  const y = payload.position.y / scale;

  // elementFromPoint 只查一次、所有订阅者共享，防止 drop 点被浮层遮挡时误插入
  const element = document.elementFromPoint(x, y);
  for (const subscriber of externalDropSubscribers) {
    const container = subscriber.containerRef.current;
    if (!container) continue;
    const rect = container.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue;
    if (element && !container.contains(element)) continue;
    subscriber.onDropPaths(payload.paths);
    return;
  }
}

// 全进程只注册一对监听并常驻：isActive 随任务切换频繁翻转，跟随它反复
// unlisten/relisten 只会徒增 IPC 往返；无订阅者时 handler 首行即返回。
function ensureExternalDropListeners() {
  if (externalDropListenersStarted) return;
  externalDropListenersStarted = true;
  const handler = (event: { payload: DragDropEvent }) => handleExternalDragDrop(event.payload);
  getCurrentWebview()
    .onDragDropEvent(handler)
    .catch((err) => console.error("Failed to listen webview drag-drop events:", err));
  getCurrentWindow()
    .onDragDropEvent(handler)
    .catch((err) => console.error("Failed to listen window drag-drop events:", err));
}

export function useTerminalPathDrop({
  containerRef,
  isActive,
  onInsertText,
  externalDrops = false,
}: {
  containerRef: RefObject<HTMLElement | null>;
  isActive: boolean;
  onInsertText: (text: string) => void;
  externalDrops?: boolean;
}) {
  const onInsertTextRef = useRef(onInsertText);
  onInsertTextRef.current = onInsertText;

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

  useEffect(() => {
    if (!isActive || !externalDrops) return;
    ensureExternalDropListeners();
    const subscriber: ExternalDropSubscriber = {
      containerRef,
      onDropPaths: (paths) => {
        const text = formatTerminalDroppedPaths(paths, APP_PLATFORM);
        if (!text) return;
        onInsertTextRef.current(`${text} `);
      },
    };
    externalDropSubscribers.add(subscriber);
    return () => {
      externalDropSubscribers.delete(subscriber);
    };
  }, [isActive, externalDrops, containerRef]);
}
