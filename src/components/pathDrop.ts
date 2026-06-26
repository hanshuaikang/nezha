import type { AppPlatform } from "../platform";

export const FILE_TREE_POINTER_DRAG_EVENT = "nezha:file-tree-pointer-drag";

export interface FileTreePointerDragDetail {
  type: "start" | "move" | "drop" | "cancel";
  paths: string[];
  x: number;
  y: number;
}

export function dispatchFileTreePointerDrag(detail: FileTreePointerDragDetail) {
  window.dispatchEvent(
    new CustomEvent<FileTreePointerDragDetail>(FILE_TREE_POINTER_DRAG_EVENT, { detail }),
  );
}

function quotePosixShellPath(path: string): string {
  return `'${path.replace(/'/g, "'\\''")}'`;
}

function quoteWindowsPathIfNeeded(path: string): string {
  if (!/[\s'"&(){}[\]^=;!,`~]/.test(path)) return path;
  return `"${path.replace(/"/g, '""')}"`;
}

// 写入 PTY stdin 后会被解释为 Enter / NUL,可能触发已输入命令立即执行
const PTY_CONTROL_CHARS = /[\r\n\0]/;
// Windows 双引号策略无法防御:PowerShell 会在 "..." 内展开 $var,反引号是 escape;cmd 会在 "..." 外展开 %var%
const WINDOWS_UNSAFE_CHARS = /[$%`]/;

export function formatTerminalDroppedPath(
  path: string,
  platform: AppPlatform = "other",
): string {
  const trimmed = path.trim();
  if (!trimmed) return "";
  if (PTY_CONTROL_CHARS.test(trimmed)) {
    console.warn("Dropped path contains control character, ignored:", path);
    return "";
  }
  if (platform === "windows") {
    if (WINDOWS_UNSAFE_CHARS.test(trimmed)) {
      console.warn("Dropped path contains Windows shell metacharacter, ignored:", path);
      return "";
    }
    return quoteWindowsPathIfNeeded(trimmed);
  }
  return quotePosixShellPath(trimmed);
}

export function formatTerminalDroppedPaths(
  paths: string[],
  platform: AppPlatform = "other",
): string {
  return paths
    .map((path) => formatTerminalDroppedPath(path, platform))
    .filter(Boolean)
    .join(" ");
}
