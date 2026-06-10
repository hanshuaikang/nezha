import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  List,
  ListTree,
  Undo2,
} from "lucide-react";
import { useI18n } from "../../i18n";
import s from "../../styles";
import {
  GIT_FILE_BROWSER_MAX_HEIGHT,
  GIT_FILE_BROWSER_ROW_HEIGHT,
  gitDirectoryRowStyle,
  gitFileActionsStyle,
  gitFileRowStyle,
  gitFileStatusDotStyle,
  gitFileStatusLabelStyle,
  gitFileVirtualContentStyle,
  gitFileVirtualListStyle,
  gitFileVirtualRowStyle,
} from "../../styles/git-diff";
import { getFileColor, getGitStatusColor, getGitStatusLabel, load, save } from "../../utils";

export type GitFileViewMode = "tree" | "list";

export const GIT_FILE_VIEW_MODE_KEY = "nezha.git.fileViewMode";
const GIT_FILE_BROWSER_OVERSCAN = 8;
const GIT_FILE_BROWSER_AUTO_COLLAPSE_FILE_COUNT = 25;
const TREE_NODE_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export interface GitFileEntry {
  path: string;
  status: string;
  staged?: boolean;
  additions?: number;
  deletions?: number;
}

interface GitDirectoryNode<T extends GitFileEntry> {
  kind: "directory";
  name: string;
  path: string;
  children: GitTreeNode<T>[];
  filePaths: string[];
  fileCount: number;
  stagedCount: number;
  untrackedCount: number;
  additions: number;
  deletions: number;
  staged: boolean;
  untracked: boolean;
}

interface GitFileNode<T extends GitFileEntry> {
  kind: "file";
  name: string;
  path: string;
  entry: T;
}

type GitTreeNode<T extends GitFileEntry> = GitDirectoryNode<T> | GitFileNode<T>;

type GitVisibleRow<T extends GitFileEntry> =
  | { kind: "directory"; node: GitDirectoryNode<T>; depth: number }
  | { kind: "file"; entry: T; depth: number };

export interface GitDirectoryActionTarget {
  path: string;
  name: string;
  filePaths: string[];
  staged: boolean;
  untracked: boolean;
}

export interface GitFileBrowserScrollContext {
  containerRef: React.RefObject<HTMLDivElement | null>;
  scrollTop: number;
  viewportHeight: number;
  layoutKey?: string;
}

interface GitFileBrowserProps<T extends GitFileEntry> {
  entries: T[];
  mode: GitFileViewMode;
  scrollContext?: GitFileBrowserScrollContext;
  onFileClick?: (entry: T) => void;
  onStageToggle?: (entry: T, e: React.MouseEvent) => void;
  onDirectoryStageToggle?: (directory: GitDirectoryActionTarget, e: React.MouseEvent) => void;
  onDiscard?: (entry: T, e: React.MouseEvent) => void;
  onDirectoryDiscard?: (directory: GitDirectoryActionTarget, e: React.MouseEvent) => void;
  showStats?: boolean;
  autoCollapseLargeDirectories?: boolean;
}

function normalizeGitFileViewMode(value: unknown): GitFileViewMode {
  return value === "list" ? "list" : "tree";
}

export function useGitFileViewMode(storageKey = GIT_FILE_VIEW_MODE_KEY) {
  const [mode, setMode] = useState<GitFileViewMode>(() =>
    normalizeGitFileViewMode(load<GitFileViewMode>(storageKey, "tree")),
  );

  useEffect(() => {
    save(storageKey, mode);
  }, [mode, storageKey]);

  return [mode, setMode] as const;
}

export function GitFileViewToggle({
  mode,
  onChange,
}: {
  mode: GitFileViewMode;
  onChange: (mode: GitFileViewMode) => void;
}) {
  const { t } = useI18n();

  return (
    <div style={s.gitFileViewToggle} role="group" aria-label={t("git.fileViewMode")}>
      <GitFileViewToggleButton
        active={mode === "tree"}
        title={t("git.viewAsTree")}
        onClick={() => onChange("tree")}
      >
        <ListTree size={13} />
      </GitFileViewToggleButton>
      <GitFileViewToggleButton
        active={mode === "list"}
        title={t("git.viewAsList")}
        onClick={() => onChange("list")}
      >
        <List size={13} />
      </GitFileViewToggleButton>
    </div>
  );
}

function GitFileViewToggleButton({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      style={active ? s.gitFileViewToggleBtnActive : s.gitFileViewToggleBtnInactive}
    >
      {children}
    </button>
  );
}

export function GitFileBrowser<T extends GitFileEntry>({
  entries,
  mode,
  scrollContext,
  onFileClick,
  onStageToggle,
  onDirectoryStageToggle,
  onDiscard,
  onDirectoryDiscard,
  showStats = false,
  autoCollapseLargeDirectories = false,
}: GitFileBrowserProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(GIT_FILE_BROWSER_MAX_HEIGHT);
  const [externalOffsetTop, setExternalOffsetTop] = useState(0);
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(() => new Set());
  const usesExternalScroll = !!scrollContext;
  const externalContainerRef = scrollContext?.containerRef;
  const externalScrollTop = scrollContext?.scrollTop ?? 0;
  const externalViewportHeight = scrollContext?.viewportHeight ?? 0;
  const externalLayoutKey = scrollContext?.layoutKey;
  const tree = useMemo(() => (mode === "tree" ? buildGitFileTree(entries) : []), [entries, mode]);
  const autoCollapsedDirs = useMemo(
    () =>
      autoCollapseLargeDirectories && mode === "tree"
        ? collectAutoCollapsedDirectoryPaths(tree)
        : [],
    [autoCollapseLargeDirectories, mode, tree],
  );
  const rows = useMemo(
    () => (mode === "tree" ? flattenGitFileTree(tree, collapsedDirs) : flattenGitFileList(entries)),
    [collapsedDirs, entries, mode, tree],
  );
  const totalHeight = rows.length * GIT_FILE_BROWSER_ROW_HEIGHT;
  const listHeight = Math.min(totalHeight, GIT_FILE_BROWSER_MAX_HEIGHT);
  const measuredViewportHeight = usesExternalScroll
    ? externalViewportHeight || GIT_FILE_BROWSER_MAX_HEIGHT
    : viewportHeight || listHeight || GIT_FILE_BROWSER_MAX_HEIGHT;
  const visibleWindowStart = usesExternalScroll ? externalScrollTop - externalOffsetTop : scrollTop;
  const visibleWindowEnd = visibleWindowStart + measuredViewportHeight;
  const hasVisibleWindow =
    rows.length > 0 && visibleWindowEnd >= 0 && visibleWindowStart <= totalHeight;
  const rawStartIndex =
    Math.floor(Math.max(0, visibleWindowStart) / GIT_FILE_BROWSER_ROW_HEIGHT) -
    GIT_FILE_BROWSER_OVERSCAN;
  const startIndex = hasVisibleWindow
    ? Math.min(Math.max(0, rows.length - 1), Math.max(0, rawStartIndex))
    : 0;
  const rawEndIndex =
    Math.ceil(Math.max(0, visibleWindowEnd) / GIT_FILE_BROWSER_ROW_HEIGHT) +
    GIT_FILE_BROWSER_OVERSCAN;
  const endIndex = hasVisibleWindow
    ? Math.min(rows.length, Math.max(startIndex + 1, rawEndIndex))
    : 0;
  const visibleRows = rows.slice(startIndex, endIndex);

  useEffect(() => {
    if (usesExternalScroll) return;
    const el = scrollRef.current;
    if (!el) return;

    const updateViewportHeight = () => {
      setViewportHeight(el.clientHeight || listHeight || GIT_FILE_BROWSER_MAX_HEIGHT);
    };

    updateViewportHeight();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(updateViewportHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, [listHeight, usesExternalScroll]);

  useLayoutEffect(() => {
    if (!usesExternalScroll) return;
    const el = scrollRef.current;
    const container = externalContainerRef?.current;
    if (!el || !container) return;

    const elRect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const nextOffsetTop = elRect.top - containerRect.top + container.scrollTop;
    setExternalOffsetTop((prev) => (Math.abs(prev - nextOffsetTop) < 0.5 ? prev : nextOffsetTop));
  }, [usesExternalScroll, externalContainerRef, externalScrollTop, externalLayoutKey, totalHeight]);

  useEffect(() => {
    if (autoCollapsedDirs.length === 0) return;

    setCollapsedDirs((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const path of autoCollapsedDirs) {
        if (!next.has(path)) {
          next.add(path);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [autoCollapsedDirs]);

  useEffect(() => {
    if (usesExternalScroll) return;
    const el = scrollRef.current;
    if (!el || scrollTop <= totalHeight) return;
    el.scrollTop = 0;
    setScrollTop(0);
  }, [scrollTop, totalHeight, usesExternalScroll]);

  const toggleDirectory = useCallback((path: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  return (
    <div
      ref={scrollRef}
      onScroll={usesExternalScroll ? undefined : handleScroll}
      style={gitFileVirtualListStyle(
        usesExternalScroll ? totalHeight : listHeight,
        !usesExternalScroll,
      )}
    >
      <div style={gitFileVirtualContentStyle(totalHeight)}>
        {visibleRows.map((row, index) => {
          const rowIndex = startIndex + index;
          return (
            <div key={gitVisibleRowKey(row, mode)} style={gitFileVirtualRowStyle(rowIndex)}>
              {row.kind === "directory" ? (
                <GitDirectoryRow
                  node={row.node}
                  depth={row.depth}
                  expanded={!collapsedDirs.has(row.node.path)}
                  onToggle={() => toggleDirectory(row.node.path)}
                  onStageToggle={onDirectoryStageToggle}
                  onDiscard={onDirectoryDiscard}
                  showStats={showStats}
                />
              ) : (
                <GitFileRow
                  entry={row.entry}
                  depth={row.depth}
                  mode={mode}
                  onFileClick={onFileClick}
                  onStageToggle={onStageToggle}
                  onDiscard={onDiscard}
                  showStats={showStats}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GitDirectoryRow<T extends GitFileEntry>({
  node,
  depth,
  expanded,
  onToggle,
  onStageToggle,
  onDiscard,
  showStats,
}: {
  node: GitDirectoryNode<T>;
  depth: number;
  expanded: boolean;
  onToggle: () => void;
  onStageToggle?: (directory: GitDirectoryActionTarget, e: React.MouseEvent) => void;
  onDiscard?: (directory: GitDirectoryActionTarget, e: React.MouseEvent) => void;
  showStats: boolean;
}) {
  const { t } = useI18n();
  const [hovered, setHovered] = useState(false);
  const [focusedWithin, setFocusedWithin] = useState(false);
  const hasActions = !!onStageToggle || !!onDiscard;
  const actionsVisible = hovered || focusedWithin;
  const directory = useMemo(
    () => ({
      path: node.path,
      name: node.name,
      filePaths: node.filePaths,
      staged: node.staged,
      untracked: node.untracked,
    }),
    [node],
  );

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocusedWithin(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setFocusedWithin(false);
        }
      }}
      style={gitDirectoryRowStyle(depth, hovered)}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        style={s.gitFileDirectoryToggleBtn}
      >
        <span style={s.gitFileChevron}>
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span style={s.gitFileFolderIcon}>
          {expanded ? <FolderOpen size={13} /> : <Folder size={13} />}
        </span>
        <span style={s.gitFileDirectoryName}>{node.name}</span>
      </button>
      {showStats && (
        <span style={s.gitFileStats}>
          <span style={s.diffAddCount}>+{node.additions}</span>
          <span style={s.diffDeleteCount}>-{node.deletions}</span>
        </span>
      )}
      <span style={s.gitFileCountBadge}>{node.fileCount}</span>
      {hasActions && (
        <span aria-hidden={!actionsVisible} style={gitFileActionsStyle(actionsVisible)}>
          {onDiscard && (
            <button
              type="button"
              tabIndex={actionsVisible ? undefined : -1}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDiscard(directory, e);
              }}
              title={t("git.discard")}
              style={s.gitChangesRowDiscardBtn}
            >
              <Undo2 size={11} />
            </button>
          )}
          {onStageToggle && (
            <button
              type="button"
              tabIndex={actionsVisible ? undefined : -1}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onStageToggle(directory, e);
              }}
              title={node.staged ? t("git.unstageAll") : t("git.stageAll")}
              style={s.gitFileStageBtn}
            >
              {node.staged ? "−" : "+"}
            </button>
          )}
        </span>
      )}
    </div>
  );
}

function GitFileRow<T extends GitFileEntry>({
  entry,
  depth,
  mode,
  onFileClick,
  onStageToggle,
  onDiscard,
  showStats,
}: {
  entry: T;
  depth: number;
  mode: GitFileViewMode;
  onFileClick?: (entry: T) => void;
  onStageToggle?: (entry: T, e: React.MouseEvent) => void;
  onDiscard?: (entry: T, e: React.MouseEvent) => void;
  showStats: boolean;
}) {
  const { t } = useI18n();
  const [hovered, setHovered] = useState(false);
  const [focusedWithin, setFocusedWithin] = useState(false);
  const name = fileName(entry.path);
  const dir = fileDir(entry.path);
  const color = getGitStatusColor(entry.status);
  const label = getGitStatusLabel(entry.status);
  const clickable = !!onFileClick;
  const hasActions = !!onStageToggle || !!onDiscard;
  const actionsVisible = hovered || focusedWithin;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!clickable || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    onFileClick?.(entry);
  };

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onFileClick(entry) : undefined}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocusedWithin(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setFocusedWithin(false);
        }
      }}
      style={gitFileRowStyle(depth, mode, clickable, hovered)}
    >
      <span style={gitFileStatusDotStyle(color)} />
      <span style={gitFileStatusLabelStyle(color)}>{label}</span>
      <File size={13} color={getFileColor(name)} style={s.gitFileIcon} aria-hidden="true" />
      <span style={s.gitFileNameWrap}>
        <span style={hovered && clickable ? s.gitFileNameHover : s.gitFileName}>{name}</span>
        {mode === "list" && dir && <span style={s.gitFileDir}>{dir}</span>}
      </span>
      {showStats && (
        <span style={s.gitFileStats}>
          <span style={s.diffAddCount}>+{entry.additions ?? 0}</span>
          <span style={s.diffDeleteCount}>-{entry.deletions ?? 0}</span>
        </span>
      )}
      {hasActions && (
        <span aria-hidden={!actionsVisible} style={gitFileActionsStyle(actionsVisible)}>
          {onDiscard && (
            <button
              type="button"
              tabIndex={actionsVisible ? undefined : -1}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDiscard(entry, e);
              }}
              title={t("git.discard")}
              style={s.gitChangesRowDiscardBtn}
            >
              <Undo2 size={11} />
            </button>
          )}
          {onStageToggle && (
            <button
              type="button"
              tabIndex={actionsVisible ? undefined : -1}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onStageToggle(entry, e);
              }}
              title={entry.staged ? t("git.unstage") : t("git.stage")}
              style={s.gitFileStageBtn}
            >
              {entry.staged ? "−" : "+"}
            </button>
          )}
        </span>
      )}
    </div>
  );
}

function buildGitFileTree<T extends GitFileEntry>(entries: T[]): GitTreeNode<T>[] {
  const root = createDirectoryNode<T>("", "");
  const directories = new Map<string, GitDirectoryNode<T>>([["", root]]);

  for (const entry of entries) {
    const parts = entry.path.split("/");
    if (parts.length === 0) continue;

    let parent = root;
    let currentPath = "";

    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = parts[index];
      if (!part) continue;

      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let directory = directories.get(currentPath);

      if (!directory) {
        directory = createDirectoryNode<T>(part, currentPath);
        directories.set(currentPath, directory);
        parent.children.push(directory);
      }

      parent = directory;
    }

    parent.children.push({
      kind: "file",
      name: parts[parts.length - 1],
      path: entry.path,
      entry,
    });
  }

  hydrateDirectory(root);
  return root.children;
}

function createDirectoryNode<T extends GitFileEntry>(
  name: string,
  path: string,
): GitDirectoryNode<T> {
  return {
    kind: "directory",
    name,
    path,
    children: [],
    filePaths: [],
    fileCount: 0,
    stagedCount: 0,
    untrackedCount: 0,
    additions: 0,
    deletions: 0,
    staged: false,
    untracked: false,
  };
}

function hydrateDirectory<T extends GitFileEntry>(directory: GitDirectoryNode<T>) {
  for (const child of directory.children) {
    if (child.kind === "directory") hydrateDirectory(child);
  }

  directory.children.sort(compareTreeNodes);
  directory.filePaths = [];
  directory.fileCount = 0;
  directory.stagedCount = 0;
  directory.untrackedCount = 0;
  directory.additions = 0;
  directory.deletions = 0;

  for (const child of directory.children) {
    if (child.kind === "directory") {
      directory.filePaths.push(...child.filePaths);
      directory.fileCount += child.fileCount;
      directory.stagedCount += child.stagedCount;
      directory.untrackedCount += child.untrackedCount;
      directory.additions += child.additions;
      directory.deletions += child.deletions;
    } else {
      directory.filePaths.push(child.entry.path);
      directory.fileCount += 1;
      if (child.entry.staged) directory.stagedCount += 1;
      if (child.entry.status === "?") directory.untrackedCount += 1;
      directory.additions += child.entry.additions ?? 0;
      directory.deletions += child.entry.deletions ?? 0;
    }
  }

  directory.staged = directory.fileCount > 0 && directory.stagedCount === directory.fileCount;
  directory.untracked = directory.fileCount > 0 && directory.untrackedCount === directory.fileCount;
}

function collectAutoCollapsedDirectoryPaths<T extends GitFileEntry>(
  tree: GitTreeNode<T>[],
): string[] {
  const paths: string[] = [];
  const stack = [...tree];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || node.kind !== "directory") continue;

    if (node.fileCount >= GIT_FILE_BROWSER_AUTO_COLLAPSE_FILE_COUNT) {
      paths.push(node.path);
    }

    for (const child of node.children) {
      if (child.kind === "directory") stack.push(child);
    }
  }

  return paths;
}

function compareTreeNodes<T extends GitFileEntry>(a: GitTreeNode<T>, b: GitTreeNode<T>) {
  if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
  return TREE_NODE_COLLATOR.compare(a.name, b.name);
}

function flattenGitFileTree<T extends GitFileEntry>(
  tree: GitTreeNode<T>[],
  collapsedDirs: Set<string>,
): GitVisibleRow<T>[] {
  const rows: GitVisibleRow<T>[] = [];
  const stack: Array<{ node: GitTreeNode<T>; depth: number }> = [];

  for (let index = tree.length - 1; index >= 0; index -= 1) {
    stack.push({ node: tree[index], depth: 0 });
  }

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    if (current.node.kind === "file") {
      rows.push({ kind: "file", entry: current.node.entry, depth: current.depth });
      continue;
    }

    rows.push({ kind: "directory", node: current.node, depth: current.depth });
    if (collapsedDirs.has(current.node.path)) continue;

    for (let index = current.node.children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: current.node.children[index], depth: current.depth + 1 });
    }
  }

  return rows;
}

function flattenGitFileList<T extends GitFileEntry>(entries: T[]): GitVisibleRow<T>[] {
  return entries.map((entry) => ({ kind: "file", entry, depth: 0 }));
}

function gitVisibleRowKey<T extends GitFileEntry>(
  row: GitVisibleRow<T>,
  mode: GitFileViewMode,
): string {
  if (row.kind === "directory") return `dir:${row.node.path}`;
  return `${mode}:${fileEntryKey(row.entry)}`;
}

function fileEntryKey(entry: GitFileEntry): string {
  return `${entry.staged ? "staged" : "unstaged"}:${entry.status}:${entry.path}`;
}

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

function fileDir(path: string): string {
  const parts = path.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}
