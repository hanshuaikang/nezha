import { ChevronDown, ChevronRight } from "lucide-react";
import { FileIcon } from "./FileIcon";
import { FILE_TREE_HOVER_BG, GITIGNORED_COLOR, ROW_HEIGHT, type TreeNode } from "./types";

export function TreeItem({
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
