import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, FolderGit2 } from "lucide-react";
import type { GitRoot } from "../../types";
import { useI18n } from "../../i18n";
import s from "../../styles";

/** 多 sub-repo 工作区项目中切换当前活动 git 根的选择器。
 *  单 root 或无 root 时不渲染，由调用方判断 roots.length > 1。 */
export function RepoSelector({
  roots,
  selectedPath,
  onSelect,
  disabled = false,
}: {
  roots: GitRoot[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const selected = roots.find((r) => r.path === selectedPath) ?? null;

  return (
    <Popover.Root open={open} onOpenChange={disabled ? undefined : setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          style={disabled ? s.repoSelectorBarDisabled : s.repoSelectorBar}
          title={t(disabled ? "repo.lockedToWorktree" : "repo.switchRepo")}
          aria-label={t(disabled ? "repo.lockedToWorktree" : "repo.switchRepo")}
          disabled={disabled}
        >
          <FolderGit2
            size={12}
            strokeWidth={2}
            color="var(--text-muted)"
            style={s.flexShrinkIcon}
          />
          <span style={s.repoSelectorName}>{selected?.name ?? "—"}</span>
          <span style={s.repoSelectorBadge}>{roots.length}</span>
          <ChevronDown
            size={11}
            strokeWidth={2}
            color="var(--text-hint)"
            style={s.flexShrinkIcon}
          />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="branch-popover-content"
          sideOffset={4}
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="branch-popover-list">
            <div className="branch-popover-group-label">{t("repo.subRepos")}</div>
            {roots.map((r) => {
              const active = selectedPath === r.path;
              return (
                <button
                  type="button"
                  key={r.path}
                  className="branch-popover-item"
                  onClick={() => {
                    onSelect(r.path);
                    setOpen(false);
                  }}
                >
                  <FolderGit2
                    size={12}
                    strokeWidth={2}
                    color={active ? "var(--accent)" : "var(--text-hint)"}
                    style={s.flexShrinkIcon}
                  />
                  <span className="branch-popover-item-name">{r.name}</span>
                  {active && (
                    <Check
                      size={12}
                      strokeWidth={2.5}
                      color="var(--accent)"
                      style={s.repoSelectorCheck}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
