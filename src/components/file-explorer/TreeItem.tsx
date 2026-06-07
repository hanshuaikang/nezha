import { memo, useCallback } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import s from "../../styles";
import { FileIcon } from "./FileIcon";
import { FILE_TREE_HOVER_BG, GITIGNORED_COLOR, type TreeNode } from "./types";
import type { FileExplorerAction } from "../FileExplorer";
import { ContextMenu, type MenuItem } from "../ContextMenu";
import { useI18n } from "../../i18n";

export const TreeItem = memo(
  function TreeItem({
    node,
    depth,
    selectedPath,
    onSelect,
    onToggle,
    onCtxAction,
  }: {
    node: TreeNode;
    depth: number;
    selectedPath: string | null;
    onSelect: (node: TreeNode) => void;
    onToggle: (path: string) => void;
    onCtxAction: (action: FileExplorerAction, node: TreeNode) => void;
  }) {
    const { t } = useI18n();
    const isHighlighted = selectedPath === node.path;

    const items = useCallback(
      (): MenuItem[] => [
        { label: t("file.newFile"), onSelect: () => onCtxAction("newFile", node) },
        { label: t("file.newFolder"), onSelect: () => onCtxAction("newFolder", node) },
        { separator: true },
        { label: t("file.openInSystemFolder"), onSelect: () => onCtxAction("open", node) },
        { label: t("file.copyFullPath"), onSelect: () => onCtxAction("copyPath", node) },
        { label: t("file.copyAtFullPath"), onSelect: () => onCtxAction("copyAtPath", node) },
        ...(!node.is_dir && node.path.split(/[/\\]/).length <= 2
          ? []
          : [
              { separator: true } as MenuItem,
              {
                label: t("file.delete"),
                onSelect: () => onCtxAction("delete", node),
                variant: "destructive" as const,
              },
            ]),
      ],
      [node, onCtxAction, t],
    )();

    return (
      <ContextMenu items={items}>
        <div
          onClick={() => (node.is_dir ? onToggle(node.path) : onSelect(node))}
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
      </ContextMenu>
    );
  },
);
