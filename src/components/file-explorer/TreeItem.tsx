import { ChevronDown, ChevronRight } from "lucide-react";
import s from "../../styles";
import { FileIcon } from "./FileIcon";
import { FILE_TREE_HOVER_BG, GITIGNORED_COLOR, type TreeNode } from "./types";

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
        ...s.fileTreeRow,
        paddingLeft: 8 + depth * 14,
        background: isHighlighted ? "var(--bg-selected)" : "transparent",
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
      <span style={s.fileTreeChevron}>
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
          ...s.fileTreeRowLabel,
          color: node.is_gitignored ? GITIGNORED_COLOR : "var(--text-primary)",
        }}
      >
        {node.name}
      </span>
    </div>
  );
}
