import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useCancellableInvoke } from "../hooks/useCancellableInvoke";
import { ChevronRight, ChevronDown, RotateCcw } from "lucide-react";
import { getFileColor } from "../utils";

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

const GITIGNORED_COLOR = "#6b7280";

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
    const folderColor = isGitignored ? GITIGNORED_COLOR : expanded ? "#7cb9f4" : "#94b8d8";
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

function flattenVisible(nodes: TreeNode[]): Array<{ node: TreeNode; depth: number }> {
  const result: Array<{ node: TreeNode; depth: number }> = [];
  function walk(items: TreeNode[], depth: number) {
    for (const n of items) {
      result.push({ node: n, depth });
      if (n.is_dir && n.expanded && n.children) {
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
  onSelect,
  onToggle,
  onContextMenu,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (node: TreeNode) => void;
  onToggle: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, path: string) => void;
}) {
  const isSelected = selectedPath === node.path;
  return (
    <div
      onClick={() => (node.is_dir ? onToggle(node.path) : onSelect(node))}
      onContextMenu={(e) => onContextMenu(e, node.path)}
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
        background: isSelected ? "var(--bg-selected)" : "transparent",
        userSelect: "none",
      }}
      onMouseEnter={(e) => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent";
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
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(500);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; path: string } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, path: string) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, path });
  }, []);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  const copyPath = useCallback((path: string, withAt: boolean) => {
    navigator.clipboard.writeText(withAt ? `@${path}` : path);
    setCtxMenu(null);
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

  const flat = useMemo(() => flattenVisible(nodes), [nodes]);

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
      onClick={ctxMenu ? closeCtxMenu : undefined}
    >
      {ctxMenu && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 999 }}
            onClick={closeCtxMenu}
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
              boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
              minWidth: 180,
              padding: "4px 0",
              fontSize: 13,
            }}
          >
            {[
              { label: "Copy full path", withAt: false },
              { label: "Copy @full path", withAt: true },
            ].map(({ label, withAt }) => (
              <div
                key={label}
                style={{
                  padding: "6px 14px",
                  cursor: "pointer",
                  color: "var(--text-primary)",
                  whiteSpace: "nowrap",
                  borderRadius: 4,
                  margin: "2px 4px",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--accent)";
                  e.currentTarget.style.color = "#fff";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onClick={() => copyPath(ctxMenu.path, withAt)}
              >
                {label}
              </div>
            ))}
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
          Files
        </span>
        <button
          onClick={() => void refresh()}
          title="Refresh"
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
            background: "var(--accent)",
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
        style={{ flex: 1, overflowY: "auto", position: "relative" }}
      >
        {loading ? (
          <div
            style={{
              padding: "16px 12px",
              fontSize: 12,
              color: "var(--text-hint)",
              textAlign: "center",
            }}
          >
            Loading...
          </div>
        ) : flat.length === 0 ? (
          <div
            style={{
              padding: "16px 12px",
              fontSize: 12,
              color: "var(--text-hint)",
              textAlign: "center",
            }}
          >
            Empty directory
          </div>
        ) : (
          <div style={{ height: flat.length * ROW_HEIGHT + 12, position: "relative" }}>
            {flat.slice(startIdx, endIdx + 1).map(({ node, depth }, i) => (
              <div
                key={node.path}
                style={{
                  position: "absolute",
                  top: (startIdx + i) * ROW_HEIGHT + 2,
                  width: "100%",
                }}
              >
                <TreeItem
                  node={node}
                  depth={depth}
                  selectedPath={selectedPath}
                  onSelect={handleSelect}
                  onToggle={handleToggle}
                  onContextMenu={handleContextMenu}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
