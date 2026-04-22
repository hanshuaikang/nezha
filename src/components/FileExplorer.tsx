import { useState, useEffect, useCallback, useMemo, useRef, useDeferredValue } from "react";
import { useCancellableInvoke } from "../hooks/useCancellableInvoke";
import { invoke } from "@tauri-apps/api/core";
import { ChevronRight, ChevronDown, RotateCcw, Search, Filter } from "lucide-react";
import { getFileColor } from "../utils";
import { useToast } from "./Toast";

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

interface SearchFileEntry {
  name: string;
  path: string;
  relativePath: string;
  extension?: string;
  isGitignored: boolean;
}

interface IndexedSearchFileEntry extends SearchFileEntry {
  normalizedName: string;
  normalizedPath: string;
  nameTokens: string[];
  pathTokens: string[];
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

function splitSearchTokens(value: string) {
  return value
    .split(/[/\\._\-\s]+/)
    .flatMap((part) => part.split(/(?=[A-Z])/))
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function hasCjk(value: string) {
  return /[\u3400-\u9fff]/.test(value);
}

function getSearchRank(entry: IndexedSearchFileEntry, query: string) {
  const nameStartsWith = entry.normalizedName.startsWith(query);
  const nameTokenStartsWith = entry.nameTokens.some((token) => token.startsWith(query));
  const pathTokenStartsWith = entry.pathTokens.some((token) => token.startsWith(query));
  const allowLooseSubstring = query.length >= 3 || (query.length >= 2 && hasCjk(query));
  const nameIncludes = allowLooseSubstring && entry.normalizedName.includes(query);
  const pathIncludes = query.includes("/") && entry.normalizedPath.includes(query);

  if (nameStartsWith) return 0;
  if (nameTokenStartsWith) return 1;
  if (pathTokenStartsWith) return 2;
  if (nameIncludes) return 3;
  if (pathIncludes) return 4;
  return null;
}

function FileRow({
  name,
  path,
  depth,
  extension,
  isDir = false,
  expanded,
  isGitignored,
  selectedPath,
  contextPath,
  trailingLabel,
  title,
  onSelect,
  onContextMenu,
  leadingSlot,
}: {
  name: string;
  path: string;
  depth: number;
  extension?: string;
  isDir?: boolean;
  expanded?: boolean;
  isGitignored?: boolean;
  selectedPath: string | null;
  contextPath: string | null;
  trailingLabel?: string;
  title?: string;
  onSelect: (path: string, name: string) => void;
  onContextMenu: (e: React.MouseEvent, path: string) => void;
  leadingSlot?: React.ReactNode;
}) {
  const isSelected = selectedPath === path;
  const isContextTarget = contextPath === path;
  const isHighlighted = isSelected || isContextTarget;

  return (
    <div
      onClick={() => onSelect(path, name)}
      onContextMenu={(e) => onContextMenu(e, path)}
      title={title}
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
        {leadingSlot}
      </span>
      <FileIcon
        name={name}
        ext={extension}
        isDir={isDir}
        expanded={expanded}
        isGitignored={isGitignored}
      />
      <span
        style={{
          fontSize: 12.5,
          color: isGitignored ? GITIGNORED_COLOR : "var(--text-primary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          fontFamily: "var(--font-ui)",
        }}
      >
        {name}
      </span>
      {trailingLabel && trailingLabel !== name && (
        <span
          style={{
            fontSize: 11,
            color: "var(--text-hint)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flexShrink: 1,
            minWidth: 0,
            maxWidth: "34%",
            textAlign: "right",
            fontFamily: "var(--font-mono)",
          }}
        >
          {trailingLabel}
        </span>
      )}
    </div>
  );
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
  onContextMenu: (e: React.MouseEvent, path: string) => void;
}) {
  return (
    <FileRow
      name={node.name}
      path={node.path}
      depth={depth}
      extension={node.extension}
      isDir={node.is_dir}
      expanded={node.expanded}
      isGitignored={node.is_gitignored}
      selectedPath={selectedPath}
      contextPath={contextPath}
      onSelect={(path, _name) => {
        if (node.is_dir) {
          onToggle(path);
          return;
        }
        onSelect(node);
      }}
      onContextMenu={onContextMenu}
      leadingSlot={
        node.is_dir ? (node.expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />) : undefined
      }
    />
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
  const [projectFiles, setProjectFiles] = useState<SearchFileEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchIndexLoading, setSearchIndexLoading] = useState(true);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(500);
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const deferredSearch = useDeferredValue(normalizedSearch);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    path: string;
  } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, path: string) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, path });
  }, []);

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
        showToast(`Failed to open in system folder: ${String(error)}`);
      }
    },
    [projectPath, showToast],
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
  const searchRefreshIdRef = useRef(0);
  const searchIndexStatusRef = useRef<"idle" | "loading" | "loaded">("idle");

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const readEntries = useCallback(
    (path: string) => safeInvoke<FsEntry[]>("read_dir_entries", { path, projectPath }),
    [projectPath, safeInvoke],
  );

  const loadProjectFiles = useCallback(
    async (showLoading = false) => {
      const refreshId = searchRefreshIdRef.current + 1;
      searchRefreshIdRef.current = refreshId;
      searchIndexStatusRef.current = "loading";
      if (showLoading) setSearchIndexLoading(true);
      try {
        const files = await safeInvoke<SearchFileEntry[]>("list_project_file_search_entries", {
          projectPath,
        });
        if (files === null || refreshId !== searchRefreshIdRef.current) return;
        searchIndexStatusRef.current = "loaded";
        setProjectFiles(files);
      } catch {
        if (!isCancelled() && refreshId === searchRefreshIdRef.current) {
          searchIndexStatusRef.current = "idle";
        }
      } finally {
        if (!isCancelled() && refreshId === searchRefreshIdRef.current) {
          setSearchIndexLoading(false);
        }
      }
    },
    [isCancelled, projectPath, safeInvoke],
  );

  const refreshSearchIndex = useCallback(
    async (showLoading = false) => {
      if (!normalizedSearch) return;
      await loadProjectFiles(showLoading);
    },
    [loadProjectFiles, normalizedSearch],
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
    searchRefreshIdRef.current += 1;
    searchIndexStatusRef.current = "idle";
    setProjectFiles([]);
    setSearchIndexLoading(false);
  }, [active, projectPath]);

  useEffect(() => {
    if (!normalizedSearch) {
      searchRefreshIdRef.current += 1;
      searchIndexStatusRef.current = "idle";
      setProjectFiles([]);
      setSearchIndexLoading(false);
      return;
    }
    if (!active || searchIndexStatusRef.current !== "idle") return;
    void loadProjectFiles(true);
  }, [active, loadProjectFiles, normalizedSearch]);

  useEffect(() => {
    if (!active) return;

    const handleVisibilityRefresh = () => {
      if (document.visibilityState !== "visible") return;
      void refresh();
      void refreshSearchIndex();
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
  }, [active, refresh, refreshSearchIndex]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportHeight(el.clientHeight);
    const ro = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const flat = useMemo(() => flattenVisible(nodes), [nodes]);
  const indexedProjectFiles = useMemo<IndexedSearchFileEntry[]>(
    () =>
      projectFiles.map((entry) => ({
        ...entry,
        normalizedName: entry.name.toLowerCase(),
        normalizedPath: entry.relativePath.toLowerCase(),
        nameTokens: splitSearchTokens(entry.name),
        pathTokens: splitSearchTokens(entry.relativePath),
      })),
    [projectFiles],
  );
  const searchResults = useMemo(() => {
    if (!deferredSearch) return [];

    return indexedProjectFiles
      .map((entry) => {
        const rank = getSearchRank(entry, deferredSearch);
        return {
          ...entry,
          rank,
        };
      })
      .filter((item) => item.rank !== null)
      .sort((a, b) => {
        if (a.rank !== b.rank) return (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER);
        const aNameLengthDelta = a.name.length - deferredSearch.length;
        const bNameLengthDelta = b.name.length - deferredSearch.length;
        if (aNameLengthDelta !== bNameLengthDelta) return aNameLengthDelta - bNameLengthDelta;
        return a.relativePath.localeCompare(b.relativePath);
      });
  }, [deferredSearch, indexedProjectFiles]);

  const OVERSCAN = 5;
  const totalRows = normalizedSearch ? searchResults.length : flat.length;
  const showSearchLoading = normalizedSearch && searchIndexLoading;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIdx = Math.min(
    totalRows - 1,
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

  const handleSearchResultSelect = useCallback(
    (path: string, name: string) => {
      setSelectedPath(path);
      onFileSelect(path, name);
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
              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
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
            {[
              { label: "Open in System Folder", action: "open" as const },
              { label: "Copy full path", withAt: false },
              { label: "Copy @full path", withAt: true },
            ].map((item) => (
              <button
                type="button"
                key={item.label}
                style={{
                  display: "block",
                  width: "calc(100% - 8px)",
                  height: 26,
                  padding: "0 10px",
                  cursor: "pointer",
                  color: "var(--text-primary)",
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
                  e.currentTarget.style.background = "var(--accent)";
                  e.currentTarget.style.color = "#fff";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onClick={(event) => {
                  if (item.action === "open") {
                    void openInSystemFolder(event, ctxMenu.path);
                    return;
                  }
                  void copyPath(event, ctxMenu.path, item.withAt);
                }}
              >
                {item.label}
              </button>
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
          onClick={() => {
            void refresh();
            if (normalizedSearch) {
              void loadProjectFiles(true);
            }
          }}
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
      <div style={{ padding: "8px 10px 4px", flexShrink: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 9px",
            background: "var(--bg-card)",
            border: "1px solid var(--border-dim)",
            borderRadius: 6,
          }}
        >
          <Search size={12} color="var(--text-hint)" />
          <input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setScrollTop(0);
              scrollRef.current?.scrollTo({ top: 0 });
            }}
            placeholder="Search files"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--text-primary)",
              fontSize: 12,
            }}
          />
          <Filter size={12} color="var(--text-hint)" />
        </div>
      </div>
      {/* Project root label */}
      {!normalizedSearch && (
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
      )}
      {/* Tree */}
      <div
        ref={scrollRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        style={{ flex: 1, overflowY: "auto", position: "relative" }}
      >
        {loading || showSearchLoading ? (
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
        ) : totalRows === 0 ? (
          <div
            style={{
              padding: "16px 12px",
              fontSize: 12,
              color: "var(--text-hint)",
              textAlign: "center",
            }}
          >
            {normalizedSearch ? "No files found" : "Empty directory"}
          </div>
        ) : (
          <div style={{ height: totalRows * ROW_HEIGHT + 12, position: "relative" }}>
            {normalizedSearch
              ? searchResults.slice(startIdx, endIdx + 1).map((item, i) => (
                  <div
                    key={item.path}
                    style={{
                      position: "absolute",
                      top: (startIdx + i) * ROW_HEIGHT + 2,
                      width: "100%",
                    }}
                  >
                    <FileRow
                      name={item.name}
                      path={item.path}
                      depth={0}
                      extension={item.extension}
                      isGitignored={item.isGitignored}
                      selectedPath={selectedPath}
                      contextPath={ctxMenu?.path ?? null}
                      trailingLabel={item.relativePath}
                      title={item.relativePath}
                      onSelect={handleSearchResultSelect}
                      onContextMenu={handleContextMenu}
                    />
                  </div>
                ))
              : flat.slice(startIdx, endIdx + 1).map(({ node, depth }, i) => (
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
                      contextPath={ctxMenu?.path ?? null}
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
