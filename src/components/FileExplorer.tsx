import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useCancellableInvoke } from "../hooks/useCancellableInvoke";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { RotateCcw } from "lucide-react";
import s from "../styles";
import { useToast } from "./Toast";
import { useI18n } from "../i18n";
import { writeClipboardText } from "./file-explorer/clipboard";
import { FileExplorerContextMenu } from "./file-explorer/ContextMenu";
import { CreateInputRow } from "./file-explorer/CreateInputRow";
import { TreeItem } from "./file-explorer/TreeItem";
import {
  AUTO_REFRESH_MS,
  ROW_HEIGHT,
  type ContextMenuState,
  type CreateKind,
  type FsEntry,
  type TreeNode,
} from "./file-explorer/types";
import {
  findNode,
  flattenVisible,
  joinPath,
  loadTreeNodes,
  parentPathOf,
  pathSeparator,
  updateNode,
} from "./file-explorer/treeUtils";

export function FileExplorer({
  projectPath,
  projectName,
  onFileSelect,
  active = true,
  width = 240,
}: {
  projectPath: string;
  projectName: string;
  onFileSelect: (path: string, name: string) => void;
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
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
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
      // Invalidate any in-flight auto-refresh: it captured a snapshot before this
      // toggle and would otherwise apply that stale tree, collapsing the folder the
      // user just expanded (issue #194).
      refreshIdRef.current += 1;

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
    <div style={{ ...s.fileExplorerRoot, width }}>
      {ctxMenu && (
        <FileExplorerContextMenu
          ctxMenu={ctxMenu}
          onClose={closeCtxMenu}
          onNewFile={() => startCreate("file")}
          onNewFolder={() => startCreate("folder")}
          onDelete={() => void handleDelete()}
          onOpenInSystem={(event, path) => void openInSystemFolder(event, path)}
          onCopyPath={(event, path, withAt) => void copyPath(event, path, withAt)}
        />
      )}
      {/* Header */}
      <div style={s.fileExplorerHeader}>
        <span style={s.fileExplorerHeaderTitle}>{t("file.files")}</span>
        <button
          onClick={() => void refresh()}
          title={t("common.refresh")}
          style={s.fileExplorerRefreshBtn}
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
      <div style={s.fileExplorerRootLabel}>
        <span style={s.fileExplorerRootIcon} />
        {projectName}
      </div>
      {/* Tree */}
      <div
        ref={scrollRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        onContextMenu={handleEmptyContextMenu}
        style={s.fileExplorerTreeScroll}
      >
        {loading ? (
          <div onContextMenu={handleEmptyContextMenu} style={s.fileExplorerEmpty}>
            {t("common.loading")}
          </div>
        ) : flat.length === 0 ? (
          <div onContextMenu={handleEmptyContextMenu} style={s.fileExplorerEmpty}>
            {t("file.emptyDirectory")}
          </div>
        ) : (
          <div
            style={{ position: "relative", height: flat.length * ROW_HEIGHT + 12 }}
            onContextMenu={handleEmptyContextMenu}
          >
            {flat.slice(startIdx, endIdx + 1).map((row, i) => {
              if (row.kind === "input") return null;
              const top = (startIdx + i) * ROW_HEIGHT + 2;
              return (
                <div key={row.node.path} style={{ ...s.fileExplorerVirtualRow, top }}>
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
                  ...s.fileExplorerVirtualRow,
                  top: creatingPlacement.index * ROW_HEIGHT + 2,
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
