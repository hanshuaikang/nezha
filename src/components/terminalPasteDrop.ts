import { getCurrentWebview } from "@tauri-apps/api/webview";

const CTRL_V = "\x16";

type DragDropPayload =
  | { type: "drop"; paths: string[]; position?: { x: number; y: number } }
  | { type: "over"; position?: { x: number; y: number } }
  | { type: "enter"; paths?: string[]; position?: { x: number; y: number } }
  | { type: "leave" }
  | { type: "cancel" };

interface AttachTerminalPasteAndDropOptions {
  container: HTMLElement;
  sendInput: (data: string) => void;
  focusTerminal: () => void;
  isActive?: () => boolean;
}

function isPasteShortcut(event: KeyboardEvent) {
  return (
    event.type === "keydown" &&
    event.key.toLowerCase() === "v" &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey
  );
}

function stopTerminalShortcut(event: Event) {
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") {
    event.stopImmediatePropagation();
  }
}

function isProbablyImageType(type: string) {
  return type.toLowerCase().startsWith("image/");
}

function hasImageDataTransferItem(items: DataTransferItemList | undefined) {
  if (!items) return false;
  return Array.from(items).some((item) => isProbablyImageType(item.type));
}

function hasImageClipboardItem(items: ClipboardItem[] | undefined) {
  if (!items) return false;
  return items.some((item) => item.types.some(isProbablyImageType));
}

async function readClipboardTextFromItems(items: ClipboardItem[]) {
  for (const item of items) {
    if (!item.types.includes("text/plain")) continue;
    const blob = await item.getType("text/plain");
    const text = await blob.text();
    if (text) return text;
  }
  return "";
}

async function pasteFromSystemClipboard(sendInput: (data: string) => void) {
  try {
    if (navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();
      const text = await readClipboardTextFromItems(items);
      if (text) {
        sendInput(text);
        return;
      }
      if (hasImageClipboardItem(items)) {
        sendInput(CTRL_V);
        return;
      }
    }
  } catch {
    // Fall through to readText. Some WebViews expose readText but deny read().
  }

  try {
    const text = await navigator.clipboard?.readText?.();
    if (text) {
      sendInput(text);
      return;
    }
  } catch {
    // Preserve the terminal app's old Ctrl+V behavior when clipboard access is denied.
  }

  sendInput(CTRL_V);
}

function pathNeedsQuoting(path: string) {
  return /[\s"'`$&|;<>()[\]{}*!?\\]/.test(path);
}

export function quotePathForTerminal(path: string) {
  if (!pathNeedsQuoting(path)) return path;
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

export function formatDroppedPathsForTerminal(paths: string[]) {
  return paths.map(quotePathForTerminal).join(" ") + (paths.length > 0 ? " " : "");
}

function isPointInsideElement(element: HTMLElement, point?: { x: number; y: number }) {
  if (!point) return true;
  const rect = element.getBoundingClientRect();
  return (
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  );
}

function extractDomDroppedPaths(event: DragEvent) {
  return Array.from(event.dataTransfer?.files ?? [])
    .map((file) => {
      const withPath = file as File & { path?: string };
      return withPath.path || file.name;
    })
    .filter(Boolean);
}

function sendDroppedPaths(
  paths: string[],
  sendInput: (data: string) => void,
  focusTerminal: () => void,
) {
  if (paths.length === 0) return;
  focusTerminal();
  sendInput(formatDroppedPathsForTerminal(paths));
}

export function attachTerminalPasteAndDrop({
  container,
  sendInput,
  focusTerminal,
  isActive = () => true,
}: AttachTerminalPasteAndDropOptions) {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!isActive() || !isPasteShortcut(event)) return;
    stopTerminalShortcut(event);
    focusTerminal();
    void pasteFromSystemClipboard(sendInput);
  };

  const handlePaste = (event: ClipboardEvent) => {
    if (!isActive()) return;
    const text = event.clipboardData?.getData("text/plain") ?? "";
    const hasImage = hasImageDataTransferItem(event.clipboardData?.items);
    if (!text && !hasImage) return;
    stopTerminalShortcut(event);
    focusTerminal();
    sendInput(text || CTRL_V);
  };

  const handleDragOver = (event: DragEvent) => {
    if (!isActive()) return;
    if ((event.dataTransfer?.types ?? []).includes("Files")) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    }
  };

  const handleDrop = (event: DragEvent) => {
    if (!isActive()) return;
    const paths = extractDomDroppedPaths(event);
    if (paths.length === 0) return;
    stopTerminalShortcut(event);
    sendDroppedPaths(paths, sendInput, focusTerminal);
  };

  container.addEventListener("keydown", handleKeyDown, true);
  container.addEventListener("paste", handlePaste, true);
  container.addEventListener("dragover", handleDragOver);
  container.addEventListener("drop", handleDrop);

  let unlistenTauriDrop: (() => void) | null = null;
  void getCurrentWebview()
    .onDragDropEvent((event) => {
      if (!isActive()) return;
      const payload = event.payload as DragDropPayload;
      if (payload.type !== "drop") return;
      if (!isPointInsideElement(container, payload.position)) return;
      sendDroppedPaths(payload.paths, sendInput, focusTerminal);
    })
    .then((unlisten) => {
      unlistenTauriDrop = unlisten;
    })
    .catch(() => {
      // Browser-only tests and previews do not provide the Tauri webview API.
    });

  return () => {
    container.removeEventListener("keydown", handleKeyDown, true);
    container.removeEventListener("paste", handlePaste, true);
    container.removeEventListener("dragover", handleDragOver);
    container.removeEventListener("drop", handleDrop);
    unlistenTauriDrop?.();
  };
}
