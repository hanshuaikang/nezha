export type DiffViewMode = "unified" | "split";

export type DiffLineType = "context" | "add" | "remove" | "meta";

export type DiffFileStatus = "added" | "deleted" | "renamed" | "copied" | "modified";

export interface DiffRow {
  type: DiffLineType;
  content: string;
  oldLine?: number;
  newLine?: number;
}

export interface DiffHunk {
  header: string;
  rows: DiffRow[];
}

export interface DiffFile {
  oldPath: string;
  newPath: string;
  displayPath: string;
  status: DiffFileStatus;
  isBinary: boolean;
  renameFrom?: string;
  renameTo?: string;
  hunks: DiffHunk[];
  headerLines: string[];
  additions: number;
  deletions: number;
}
