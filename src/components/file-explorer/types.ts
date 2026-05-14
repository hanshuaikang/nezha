export type CreateKind = "file" | "folder";

export interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
  extension?: string;
  is_gitignored: boolean;
}

export interface TreeNode extends FsEntry {
  children: TreeNode[] | null; // null = not loaded yet
  expanded: boolean;
}

export type FlatRow =
  | { kind: "node"; node: TreeNode; depth: number }
  | { kind: "input"; parentPath: string; depth: number; createKind: CreateKind };

export interface ContextMenuState {
  x: number;
  y: number;
  path: string;
  isDir: boolean;
  isRoot: boolean;
}

export const ROW_HEIGHT = 22;
export const AUTO_REFRESH_MS = 2500;
export const GITIGNORED_COLOR = "var(--icon-file-ignored)";
export const FILE_TREE_HOVER_BG = "color-mix(in srgb, var(--accent) 7%, transparent)";
