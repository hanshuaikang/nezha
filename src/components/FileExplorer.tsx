import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useCancellableInvoke } from "../hooks/useCancellableInvoke";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { ChevronRight, ChevronDown, RotateCcw } from "lucide-react";
import { getFileColor } from "../utils";
import { useToast } from "./Toast";
import { useI18n } from "../i18n";

type CreateKind = "file" | "folder";

function pathSeparator(path: string): "/" | "\\" {
  return path.includes("\\") && !path.includes("/") ? "\\" : "/";
}

function joinPath(parent: string, name: string): string {
  const sep = pathSeparator(parent);
  const trimmed = parent.replace(/[\\/]+$/, "");
  return `${trimmed}${sep}${name}`;
}

function parentPathOf(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx > 0 ? path.slice(0, idx) : path;
}

interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
  extension?: string;
  is_gitignored: boolean;
}

interface TreeNode extends FsEntry {
  children: TreeNode[] | null; // null = not loaded yet
  expanded: boolean;
}

const GITIGNORED_COLOR = "var(--icon-file-ignored)";

function FileIcon({
  name,
  ext,
  isDir,
  expanded,
  isGitignored,
}: {
  name: string;
  ext?: string;
  isDir: boolean;
  expanded?: boolean;
  isGitignored?: boolean;
}) {
  if (isDir) {
    const folderColor = isGitignored
      ? GITIGNORED_COLOR
      : expanded
        ? "var(--icon-folder-open)"
        : "var(--icon-folder)";
    return (
      <span
        style={{
          color: folderColor,
          display: "inline-flex",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        {expanded ? (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 3.5A1.5 1.5 0 012.5 2h3.764c.58 0 1.12.34 1.342.87l.496 1.13H13.5A1.5 1.5 0 0115 5.5v7A1.5 1.5 0 0113.5 14h-11A1.5 1.5 0 011 12.5v-9z" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 3.5A1.5 1.5 0 012.5 2h3.764c.58 0 1.12.34 1.342.87l.496 1.13H13.5A1.5 1.5 0 0115 5.5v7A1.5 1.5 0 0113.5 14h-11A1.5 1.5 0 011 12.5v-9zM2.5 3a.5.5 0 00-.5.5v9a.5.5 0 00.5.5h11a.5.5 0 00.5-.5v-7a.5.5 0 00-.5-.5H8l-.724-1.647A.5.5 0 007.264 3H2.5z" />
          </svg>
        )}
      </span>
    );
  }
  const color = isGitignored ? GITIGNORED_COLOR : getFileColor(name, ext);
  return (
    <span
      style={{
        width: 5,
        height: 14,
        borderRadius: 2,
        background: color,
        flexShrink: 0,
        display: "inline-block",
      }}
    />
  );
}

const ROW_HEIGHT = 22;
const AUTO_REFRESH_MS = 2500;
const FILE_TREE_HOVER_BG = "color-mix(in srgb, var(--accent) 7%, transparent)";

async function writeClipboardText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back to execCommand for WebViews that deny the async clipboard API.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.opacity = "0";

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Copy command was rejected");
    }
  } finally {
    document.body.removeChild(textarea);
  }
}

type FlatRow =
  | { kind: "node"; node: TreeNode; depth: number }
  | { kind: "input"; parentPath: string; depth: number; createKind: CreateKind };

function flattenVisible(
  nodes: TreeNode[],
  rootPath: string,
  creating: { parentPath: string; kind: CreateKind } | null,
): FlatRow[] {
  const result: FlatRow[] = [];
  if (creating && creating.parentPath === rootPath) {
    result.push({ kind: "input", parentPath: rootPath, depth: 0, createKind: creating.kind });
  }
  function walk(items: TreeNode[], depth: number) {
    for (const n of items) {
      result.push({ kind: "node", node: n, depth });
      if (n.is_dir && n.expanded && n.children) {
        if (creating && creating.parentPath === n.path) {
          result.push({
            kind: "input",
            parentPath: n.path,
            depth: depth + 1,
            createKind: creating.kind,
          });
        }
        walk(n.children, depth + 1);
      }
    }
  }
  walk(nodes, 0);
  return result;
}

function TreeItem({
  node,
  depth,
  selectedPath,
  contextPath,
  onSelect,
  onToggle,
  onContextMenu,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  contextPath: string | null;
  onSelect: (node: TreeNode) => void;
  onToggle: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void;
}) {
  const isSelected = selectedPath === node.path;
  const isContextTarget = contextPath === node.path;
  const isHighlighted = isSelected || isContextTarget;
  return (
    <div
      onClick={() => (node.is_dir ? onToggle(node.path) : onSelect(node))}
      onContextMenu={(e) => onContextMenu(e, node)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        height: ROW_HEIGHT,
        paddingLeft: 8 + depth * 14,
        paddingRight: 8,
        cursor: "pointer",
        borderRadius: 4,
        margin: "0 4px",
        boxSizing: "border-box",
        background: isHighlighted ? "var(--bg-selected)" : "transparent",
        userSelect: "none",
      }}
      onMouseEnter={(e) => {
        if (!isHighlighted) {
          e.currentTarget.style.background = FILE_TREE_HOVER_BG;
        }
      }}
      onMouseLeave={(e) => {
        if (!isHighlighted) {
          e.currentTarget.style.background = "transparent";
        }
      }}
    >
      <span
        style={{
          width: 12,
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          color: "var(--text-hint)",
        }}
      >
        {node.is_dir && (node.expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />)}
      </span>
      <FileIcon
        name={node.name}
        ext={node.extension}
        isDir={node.is_dir}
        expanded={node.expanded}
        isGitignored={node.is_gitignored}
      />
      <span
        style={{
          fontSize: 12.5,
          color: node.is_gitignored ? GITIGNORED_COLOR : "var(--text-primary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          fontFamily: "var(--font-ui)",
        }}
      >
        {node.name}
      </span>
    </div>
  );
}

function CreateInputRow({
  depth,
  kind,
  value,
  onChange,
  onCommit,
  onCancel,
  inputRef,
}: {
  depth: number;
  kind: CreateKind;
  value: string;
  onChange: (next: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        height: ROW_HEIGHT,
        paddingLeft: 8 + depth * 14,
        paddingRight: 8,
        margin: "0 4px",
        boxSizing: "border-box",
        background: "var(--bg-selected)",
        borderRadius: 4,
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <span style={{ width: 12, flexShrink: 0 }} />
      <FileIcon
        name={kind === "file" ? value || "untitled" : ""}
        ext={undefined}
        isDir={kind === "folder"}
        expanded={false}
      />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => {
          // Commit is intentionally only triggered by Enter; blurring discards the input
          // to prevent racing the keyboard handler (which used to double-fire commit).
          onCancel();
        }}
        spellCheck={false}
        autoComplete="off"
        style={{
          flex: 1,
          minWidth: 0,
          height: 18,
          padding: "0 4px",
          fontSize: 12.5,
          fontFamily: "var(--font-ui)",
          color: "var(--text-primary)",
          background: "var(--bg-input, var(--bg-sidebar))",
          border: "1px solid var(--accent)",
          borderRadius: 3,
          outline: "none",
        }}
      />
    </div>
  );
}

function findNode(items: TreeNode[], path: string): TreeNode | null {
  for (const item of items) {
    if (item.path === path) return item;
    if (item.children) {
      const found = findNode(item.children, path);
      if (found) return found;
    }
  }
  return null;
}

function isSameEntry(a: FsEntry, b: FsEntry) {
  return (
    a.path === b.path &&
    a.name === b.name &&
    a.is_dir === b.is_dir &&
    a.extension === b.extension &&
    a.is_gitignored === b.is_gitignored
  );
}

function updateNode(
  items: TreeNode[],
  path: string,
  updater: (node: TreeNode) => TreeNode,
): TreeNode[] {
  let changed = false;
  const nextItems = items.map((item) => {
    if (item.path === path) {
      const nextItem = updater(item);
      if (nextItem !== item) changed = true;
      return nextItem;
    }

    if (!item.children) return item;

    const nextChildren = updateNode(item.children, path, updater);
    if (nextChildren === item.children) return item;

    changed = true;
    return { ...item, children: nextChildren };
  });

  return changed ? nextItems : items;
}

async function loadTreeNodes(
  path: string,
  previousNodes: TreeNode[],
  readEntries: (path: string) => Promise<FsEntry[] | null>,
): Promise<TreeNode[] | null> {
  const entries = await readEntries(path);
  if (entries === null) return null;

  const previousByPath = new Map(previousNodes.map((node) => [node.path, node]));
  let changed = entries.length !== previousNodes.length;
  const nextNodes: TreeNode[] = [];

  for (const [index, entry] of entries.entries()) {
    const previous = previousByPath.get(entry.path);
    const expanded = previous?.expanded ?? false;
    let children: TreeNode[] | null = null;

    if (entry.is_dir) {
      if (expanded) {
        const nextChildren = await loadTreeNodes(entry.path, previous?.children ?? [], readEntries);
        if (nextChildren === null) return null;
        children = nextChildren;
      } else {
        children = previous?.children ?? null;
      }
    }

    const previousAtIndex = previousNodes[index];
    if (!previousAtIndex || previousAtIndex.path !== entry.path) {
      changed = true;
    }

    if (previous && isSameEntry(previous, entry) && previous.children === children) {
      nextNodes.push(previous);
      continue;
    }

    changed = true;
    nextNodes.push({ ...entry, expanded, children });
  }

  return changed ? nextNodes : previousNodes;
}

export function FileExplorer({
  projectPath,
  projectName,
  onFileSelect,
  isDark: _isDark,
  active = true,
  width = 240,
}: {
  projectPath: string;
  projectName: string;
  onFileSelect: (path: string, name: string) => void;
  isDark: boolean;
  active?: boolean;
  width?: number;
}) {
  const { t } = useI18n();
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(500);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    path: string;
    isDir: boolean;
    isRoot: boolean;
  } | null>(null);
  const [creating, setCreating] = useState<{
    parentPath: string;
    kind: CreateKind;
  } | null>(null);
  const [creatingValue, setCreatingValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const commitInFlightRef = useRef(false);
  const deleteInFlightRef = useRef(false);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      path: node.path,
      isDir: node.is_dir,
      isRoot: false,
    });
  }, []);

  const handleEmptyContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (e.target !== e.currentTarget) return;
      e.preventDefault();
      e.stopPropagation();
      setCtxMenu({
        x: e.clientX,
        y: e.clientY,
        path: projectPath,
        isDir: true,
        isRoot: true,
      });
    },
    [projectPath],
  );

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  const openInSystemFolder = useCallback(
    async (event: React.MouseEvent, path: string) => {
      event.preventDefault();
      event.stopPropagation();
      setCtxMenu(null);

      try {
        await invoke("open_in_system_file_manager", { path, projectPath });
      } catch (error) {
        console.error("Failed to open file in system folder", error);
        showToast(t("file.failedOpenSystemFolder", { error: String(error) }));
      }
    },
    [projectPath, showToast, t],
  );

  const copyPath = useCallback(async (event: React.MouseEvent, path: string, withAt: boolean) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      await writeClipboardText(withAt ? `@${path}` : path);
    } catch (error) {
      console.error("Failed to copy file path", error);
    } finally {
      setCtxMenu(null);
    }
  }, []);

  const { safeInvoke, isCancelled } = useCancellableInvoke();
  const nodesRef = useRef<TreeNode[]>([]);
  const refreshIdRef = useRef(0);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const readEntries = useCallback(
    (path: string) => safeInvoke<FsEntry[]>("read_dir_entries", { path, projectPath }),
    [projectPath, safeInvoke],
  );

  const refresh = useCallback(
    async (showLoading = false) => {
      const refreshId = refreshIdRef.current + 1;
      refreshIdRef.current = refreshId;
      if (showLoading) setLoading(true);

      try {
        const nextNodes = await loadTreeNodes(projectPath, nodesRef.current, readEntries);
        if (nextNodes === null || refreshId !== refreshIdRef.current) return;
        if (nextNodes !== nodesRef.current) {
          setNodes(nextNodes);
        }
        setLoading(false);
      } catch {
        if (!isCancelled() && refreshId === refreshIdRef.current) {
          setLoading(false);
        }
      }
    },
    [isCancelled, projectPath, readEntries],
  );

  useEffect(() => {
    if (!active) return;
    void refresh(true);
  }, [active, projectPath, refresh]);

  useEffect(() => {
    if (!active) return;

    const handleVisibilityRefresh = () => {
      if (document.visibilityState !== "visible") return;
      void refresh();
    };

    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refresh();
    }, AUTO_REFRESH_MS);

    window.addEventListener("focus", handleVisibilityRefresh);
    document.addEventListener("visibilitychange", handleVisibilityRefresh);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", handleVisibilityRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityRefresh);
    };
  }, [active, refresh]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportHeight(el.clientHeight);
    const ro = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const flat = useMemo(
    () => flattenVisible(nodes, projectPath, creating),
    [nodes, projectPath, creating],
  );

  // The create-input row is rendered outside the virtualized slice (see render block) so its
  // DOM node remains mounted even when scrolled out of view — otherwise the input ref would
  // race with focus/scroll on long trees. We still need its index from `flat` to position it.
  const creatingPlacement = useMemo(() => {
    if (!creating) return null;
    const idx = flat.findIndex((r) => r.kind === "input");
    if (idx < 0) return null;
    const row = flat[idx];
    if (row.kind !== "input") return null;
    return { index: idx, depth: row.depth, kind: row.createKind };
  }, [flat, creating]);

  const OVERSCAN = 5;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIdx = Math.min(
    flat.length - 1,
    Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN,
  );

  const handleToggle = useCallback(
    (dirPath: string) => {
      const current = findNode(nodesRef.current, dirPath);
      const shouldExpand = !current?.expanded;

      setNodes((prev) =>
        updateNode(prev, dirPath, (node) => {
          const nextChildren = shouldExpand ? (node.children ?? []) : node.children;
          if (node.expanded === shouldExpand && node.children === nextChildren) {
            return node;
          }
          return { ...node, expanded: shouldExpand, children: nextChildren };
        }),
      );

      if (!shouldExpand) return;

      void (async () => {
        const currentChildren = findNode(nodesRef.current, dirPath)?.children ?? [];
        const nextChildren = await loadTreeNodes(dirPath, currentChildren, readEntries);
        if (nextChildren === null) return;
        setNodes((prev) =>
          updateNode(prev, dirPath, (node) =>
            node.children === nextChildren ? node : { ...node, children: nextChildren },
          ),
        );
      })();
    },
    [readEntries],
  );

  const handleSelect = useCallback(
    (node: TreeNode) => {
      setSelectedPath(node.path);
      onFileSelect(node.path, node.name);
    },
    [onFileSelect],
  );

  const ensureExpanded = useCallback(
    (dirPath: string) => {
      if (dirPath === projectPath) return;
      const current = findNode(nodesRef.current, dirPath);
      if (!current?.expanded) {
        handleToggle(dirPath);
      }
    },
    [handleToggle, projectPath],
  );

  const startCreate = useCallback(
    (kind: CreateKind) => {
      if (!ctxMenu) return;
      let parentPath: string;
      if (ctxMenu.isRoot) {
        parentPath = projectPath;
      } else if (ctxMenu.isDir) {
        parentPath = ctxMenu.path;
        ensureExpanded(parentPath);
      } else {
        parentPath = parentPathOf(ctxMenu.path);
      }
      setCtxMenu(null);
      setCreatingValue("");
      setCreating({ parentPath, kind });
    },
    [ctxMenu, ensureExpanded, projectPath],
  );

  const cancelCreate = useCallback(() => {
    setCreating(null);
    setCreatingValue("");
  }, []);

  const commitCreate = useCallback(async () => {
    if (!creating) return;
    if (commitInFlightRef.current) return;
    const name = creatingValue.trim();
    if (!name) {
      cancelCreate();
      return;
    }
    if (name.includes("/") || name.includes("\\")) {
      showToast(t("file.createFailed", { error: "Invalid file name" }));
      return;
    }
    commitInFlightRef.current = true;
    const fullPath = joinPath(creating.parentPath, name);
    const kind = creating.kind;
    const parentPath = creating.parentPath;
    try {
      if (kind === "file") {
        await safeInvoke("create_file", { path: fullPath, projectPath });
      } else {
        await safeInvoke("create_directory", { path: fullPath, projectPath });
      }
      if (isCancelled()) return;
      setCreating(null);
      setCreatingValue("");
      if (parentPath !== projectPath) {
        ensureExpanded(parentPath);
      }
      await refresh();
      if (isCancelled()) return;
      setSelectedPath(fullPath);
      if (kind === "file") {
        onFileSelect(fullPath, name);
      }
    } catch (error) {
      if (!isCancelled()) {
        showToast(t("file.createFailed", { error: String(error) }));
      }
    } finally {
      commitInFlightRef.current = false;
    }
  }, [
    cancelCreate,
    creating,
    creatingValue,
    ensureExpanded,
    isCancelled,
    onFileSelect,
    projectPath,
    refresh,
    safeInvoke,
    showToast,
    t,
  ]);

  useEffect(() => {
    if (!creating || !creatingPlacement) return;
    const el = scrollRef.current;
    if (!el) return;
    const rowTop = creatingPlacement.index * ROW_HEIGHT;
    const rowBottom = rowTop + ROW_HEIGHT;
    if (rowTop < el.scrollTop || rowBottom > el.scrollTop + el.clientHeight) {
      const targetTop = Math.max(0, rowTop - el.clientHeight / 2 + ROW_HEIGHT);
      el.scrollTo({ top: targetTop, behavior: "auto" });
    }
  }, [creating, creatingPlacement]);

  useEffect(() => {
    if (creating && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [creating]);

  const handleDelete = useCallback(async () => {
    if (!ctxMenu || ctxMenu.isRoot) return;
    if (deleteInFlightRef.current) return;
    const targetPath = ctxMenu.path;
    const isDir = ctxMenu.isDir;
    const idx = Math.max(targetPath.lastIndexOf("/"), targetPath.lastIndexOf("\\"));
    const name = idx >= 0 ? targetPath.slice(idx + 1) : targetPath;
    setCtxMenu(null);

    const ok = await confirm(
      t(isDir ? "file.confirmDeleteFolder" : "file.confirmDeleteFile", { name }),
      {
        title: t("file.confirmDeleteTitle", { name }),
        kind: "warning",
        okLabel: t("file.delete"),
      },
    );
    if (!ok) return;

    deleteInFlightRef.current = true;
    try {
      await safeInvoke("delete_path", { path: targetPath, projectPath });
      if (isCancelled()) return;
      const sep = pathSeparator(targetPath);
      const descendantPrefix = targetPath + sep;
      setSelectedPath((prev) => {
        if (!prev) return prev;
        if (prev === targetPath) return null;
        if (prev.startsWith(descendantPrefix)) return null;
        return prev;
      });
      await refresh();
    } catch (error) {
      if (!isCancelled()) {
        showToast(t("file.deleteFailed", { error: String(error) }));
      }
    } finally {
      deleteInFlightRef.current = false;
    }
  }, [ctxMenu, isCancelled, projectPath, refresh, safeInvoke, showToast, t]);

  return (
    <div
      style={{
        width,
        flexShrink: 0,
        background: "var(--bg-sidebar)",
        borderLeft: "1px solid var(--border-dim)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {ctxMenu && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 999 }}
            onPointerDown={closeCtxMenu}
            onContextMenu={(e) => {
              e.preventDefault();
              closeCtxMenu();
            }}
          />
          <div
            style={{
              position: "fixed",
              left: ctxMenu.x,
              top: ctxMenu.y,
              zIndex: 1000,
              background: "var(--bg-sidebar)",
              border: "1px solid var(--border-dim)",
              borderRadius: 6,
              boxShadow: "var(--shadow-popover)",
              minWidth: 148,
              padding: "3px 0",
              fontSize: 12.5,
            }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {(
              [
                { label: t("file.newFile"), action: "newFile" },
                { label: t("file.newFolder"), action: "newFolder" },
                { action: "separator" },
                { label: t("file.openInSystemFolder"), action: "open" },
                { label: t("file.copyFullPath"), action: "copy", withAt: false },
                { label: t("file.copyAtFullPath"), action: "copy", withAt: true },
                ...(ctxMenu.isRoot
                  ? []
                  : ([
                      { action: "separator" },
                      { label: t("file.delete"), action: "delete", destructive: true },
                    ] as const)),
              ] as const
            ).map((item, idx) => {
              if (item.action === "separator") {
                return (
                  <div
                    key={`sep-${idx}`}
                    style={{
                      height: 1,
                      background: "var(--border-dim)",
                      margin: "4px 6px",
                    }}
                  />
                );
              }
              const isDestructive = item.action === "delete";
              const baseColor = isDestructive
                ? "var(--danger-action-bg, #d23f3f)"
                : "var(--text-primary)";
              return (
                <button
                  type="button"
                  key={item.label}
                  style={{
                    display: "block",
                    width: "calc(100% - 8px)",
                    height: 26,
                    padding: "0 10px",
                    cursor: "pointer",
                    color: baseColor,
                    whiteSpace: "nowrap",
                    borderRadius: 3,
                    margin: "2px 4px",
                    transition: "background 0.1s",
                    background: "transparent",
                    border: "none",
                    textAlign: "left",
                    fontSize: 12.5,
                    fontFamily: "var(--font-ui)",
                    lineHeight: "26px",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = isDestructive
                      ? "var(--danger-action-bg, #d23f3f)"
                      : "var(--accent)";
                    e.currentTarget.style.color = isDestructive
                      ? "var(--danger-action-fg, #ffffff)"
                      : "var(--fg-on-accent)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = baseColor;
                  }}
                  onClick={(event) => {
                    if (item.action === "newFile") {
                      event.preventDefault();
                      event.stopPropagation();
                      startCreate("file");
                      return;
                    }
                    if (item.action === "newFolder") {
                      event.preventDefault();
                      event.stopPropagation();
                      startCreate("folder");
                      return;
                    }
                    if (item.action === "delete") {
                      event.preventDefault();
                      event.stopPropagation();
                      void handleDelete();
                      return;
                    }
                    if (item.action === "open") {
                      void openInSystemFolder(event, ctxMenu.path);
                      return;
                    }
                    if (item.action === "copy") {
                      void copyPath(event, ctxMenu.path, item.withAt);
                    }
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </>
      )}
      {/* Header */}
      <div
        style={{
          height: 40,
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          borderBottom: "1px solid var(--border-dim)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--text-hint)",
            letterSpacing: 0.7,
            textTransform: "uppercase",
            flex: 1,
          }}
        >
          {t("file.files")}
        </span>
        <button
          onClick={() => void refresh()}
          title={t("common.refresh")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-hint)",
            padding: 4,
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
            (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--text-hint)";
            (e.currentTarget as HTMLElement).style.background = "none";
          }}
        >
          <RotateCcw size={13} />
        </button>
      </div>
      {/* Project root label */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 8px 3px 20px",
          fontSize: 12.5,
          fontWeight: 600,
          color: "var(--text-primary)",
        }}
      >
        <span
          style={{
            width: 5,
            height: 14,
            borderRadius: 2,
            background: "var(--icon-folder-root)",
            flexShrink: 0,
            display: "inline-block",
          }}
        />
        {projectName}
      </div>
      {/* Tree */}
      <div
        ref={scrollRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        onContextMenu={handleEmptyContextMenu}
        style={{ flex: 1, overflowY: "auto", position: "relative" }}
      >
        {loading ? (
          <div
            onContextMenu={handleEmptyContextMenu}
            style={{
              padding: "16px 12px",
              fontSize: 12,
              color: "var(--text-hint)",
              textAlign: "center",
            }}
          >
            {t("common.loading")}
          </div>
        ) : flat.length === 0 ? (
          <div
            onContextMenu={handleEmptyContextMenu}
            style={{
              padding: "16px 12px",
              fontSize: 12,
              color: "var(--text-hint)",
              textAlign: "center",
            }}
          >
            {t("file.emptyDirectory")}
          </div>
        ) : (
          <div
            style={{ height: flat.length * ROW_HEIGHT + 12, position: "relative" }}
            onContextMenu={handleEmptyContextMenu}
          >
            {flat.slice(startIdx, endIdx + 1).map((row, i) => {
              if (row.kind === "input") return null;
              const top = (startIdx + i) * ROW_HEIGHT + 2;
              return (
                <div
                  key={row.node.path}
                  style={{
                    position: "absolute",
                    top,
                    width: "100%",
                  }}
                >
                  <TreeItem
                    node={row.node}
                    depth={row.depth}
                    selectedPath={selectedPath}
                    contextPath={ctxMenu?.path ?? null}
                    onSelect={handleSelect}
                    onToggle={handleToggle}
                    onContextMenu={handleContextMenu}
                  />
                </div>
              );
            })}
            {creating && creatingPlacement && (
              <div
                key="__create_row__"
                style={{
                  position: "absolute",
                  top: creatingPlacement.index * ROW_HEIGHT + 2,
                  width: "100%",
                }}
              >
                <CreateInputRow
                  depth={creatingPlacement.depth}
                  kind={creatingPlacement.kind}
                  value={creatingValue}
                  onChange={setCreatingValue}
                  onCommit={() => {
                    void commitCreate();
                  }}
                  onCancel={cancelCreate}
                  inputRef={inputRef}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
