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
}: {
  roots: GitRoot[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const selected = roots.find((r) => r.path === selectedPath) ?? null;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <div
          style={{
            ...s.repoSelectorBar,
            background: open ? "var(--bg-hover)" : "var(--bg-card)",
          }}
          title={t("repo.switchRepo")}
        >
          <FolderGit2 size={12} strokeWidth={2} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          <span style={s.repoSelectorName}>{selected?.name ?? "—"}</span>
          <span style={s.repoSelectorBadge}>{roots.length}</span>
          <ChevronDown
            size={11}
            strokeWidth={2}
            color="var(--text-hint)"
            style={{ flexShrink: 0 }}
          />
        </div>
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
                    style={{ flexShrink: 0 }}
                  />
                  <span className="branch-popover-item-name">{r.name}</span>
                  {active && (
                    <Check
                      size={12}
                      strokeWidth={2.5}
                      color="var(--accent)"
                      style={{ flexShrink: 0, marginLeft: "auto" }}
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
