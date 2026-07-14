import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronDown,
  GitBranch,
  Laptop,
  GitPullRequestArrow,
  Check,
  Search,
  X,
  RefreshCw,
} from "lucide-react";
import * as Select from "@radix-ui/react-select";
import * as Popover from "@radix-ui/react-popover";
import { FolderGit2 } from "lucide-react";
import type { GitRoot } from "../../types";
import { useI18n } from "../../i18n";
import s from "../../styles";

export type LaunchMode = "local" | "worktree";

interface GitBranchInfo {
  name: string;
  current: boolean;
  remote: string | null;
}

const MODES: LaunchMode[] = ["local", "worktree"];

export function LaunchModeSelector({
  projectRoot,
  repoPath,
  roots,
  launchMode,
  baseBranch,
  onSetLaunchMode,
  onSetBaseBranch,
  onSetRepoPath,
}: {
  projectRoot: string;
  repoPath: string;
  /** 项目下所有 git 根；worktree 模式必须落在其中一个之下。 */
  roots: GitRoot[];
  launchMode: LaunchMode;
  baseBranch: string;
  onSetLaunchMode: (mode: LaunchMode) => void;
  onSetBaseBranch: (branch: string) => void;
  onSetRepoPath: (path: string) => void;
}) {
  const { t } = useI18n();
  const [branchState, setBranchState] = useState<{
    repoKey: string;
    branches: GitBranchInfo[];
  }>({ repoKey: "", branches: [] });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [repoPickerOpen, setRepoPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const repoKey = `${projectRoot}\0${repoPath}`;
  const activeRepoKeyRef = useRef(repoKey);
  activeRepoKeyRef.current = repoKey;
  const branchSequenceRef = useRef(0);
  const baseBranchRef = useRef(baseBranch);
  baseBranchRef.current = baseBranch;
  const branches = useMemo(
    () => (branchState.repoKey === repoKey ? branchState.branches : []),
    [branchState, repoKey],
  );

  const selectedRepoName = roots.find((r) => r.path === repoPath)?.name ?? "—";
  const showRepoPicker = roots.length > 1;

  function handleSelectRepo(path: string) {
    if (path !== repoPath) {
      baseBranchRef.current = "";
      onSetRepoPath(path);
      // 切换 sub-repo 后老分支名通常不在新 repo 里，清空让 loadBranches 重新选默认。
      onSetBaseBranch("");
    }
    setRepoPickerOpen(false);
  }

  const loadBranches = useCallback(
    async ({ applyDefault }: { applyDefault: boolean }) => {
      if (!projectRoot) return;
      const sequence = ++branchSequenceRef.current;
      try {
        const list = await invoke<GitBranchInfo[]>("git_list_branches", {
          projectPath: projectRoot,
          repoPath,
        });
        if (activeRepoKeyRef.current !== repoKey || branchSequenceRef.current !== sequence) return;
        setBranchState({ repoKey, branches: list });
        if (applyDefault) {
          const currentBase = baseBranchRef.current;
          const baseIsValid = list.some((b) => b.remote === null && b.name === currentBase);
          if (!baseIsValid) {
            const current = list.find((b) => b.current && b.remote === null);
            const next = current?.name ?? "";
            baseBranchRef.current = next;
            onSetBaseBranch(next);
          }
        }
      } catch {
        if (activeRepoKeyRef.current === repoKey && branchSequenceRef.current === sequence) {
          setBranchState({ repoKey, branches: [] });
        }
      }
    },
    [projectRoot, repoPath, repoKey, onSetBaseBranch],
  );

  const previousRepoKeyRef = useRef(repoKey);
  useEffect(() => {
    if (previousRepoKeyRef.current === repoKey) return;
    previousRepoKeyRef.current = repoKey;
    baseBranchRef.current = "";
    onSetBaseBranch("");
    setPickerOpen(false);
    setRepoPickerOpen(false);
    setSearch("");
  }, [repoKey, onSetBaseBranch]);

  useEffect(() => {
    void loadBranches({ applyDefault: true });
  }, [loadBranches]);

  async function handleRefresh(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (refreshing) return;
    setRefreshing(true);
    try {
      await loadBranches({ applyDefault: false });
    } finally {
      setRefreshing(false);
    }
  }

  const localBranches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return branches
      .filter((b) => b.remote === null)
      .filter((b) => !q || b.name.toLowerCase().includes(q));
  }, [branches, search]);

  function modeIcon(mode: LaunchMode) {
    return mode === "local" ? (
      <Laptop size={13} strokeWidth={2} color="var(--text-muted)" />
    ) : (
      <GitPullRequestArrow size={13} strokeWidth={2} color="var(--text-muted)" />
    );
  }

  function modeLabel(mode: LaunchMode) {
    return mode === "local" ? t("newTask.launchMode.local") : t("newTask.launchMode.worktree");
  }

  return (
    <>
      <Select.Root value={launchMode} onValueChange={(v) => onSetLaunchMode(v as LaunchMode)}>
        <Select.Trigger style={s.toolbarBtn} aria-label={t("newTask.launchMode")}>
          {modeIcon(launchMode)}
          <span>{modeLabel(launchMode)}</span>
          <Select.Icon>
            <ChevronDown size={12} strokeWidth={2.5} style={s.dimChevronIcon} />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content position="popper" sideOffset={6} style={s.toolbarMenuContent}>
            <Select.Viewport>
              {MODES.map((mode) => (
                <Select.Item
                  key={mode}
                  value={mode}
                  className="branch-popover-item"
                  style={s.toolbarMenuItem}
                >
                  {modeIcon(mode)}
                  <Select.ItemText>{modeLabel(mode)}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>

      {launchMode === "worktree" && (
        <>
          {showRepoPicker && (
            <Popover.Root open={repoPickerOpen} onOpenChange={setRepoPickerOpen}>
              <Popover.Trigger asChild>
                <button
                  type="button"
                  style={s.toolbarBtn}
                  aria-label={t("newTask.subRepo")}
                  title={t("newTask.subRepoTitle")}
                >
                  <FolderGit2 size={13} strokeWidth={2} color="var(--text-muted)" />
                  <span>{selectedRepoName}</span>
                  <ChevronDown size={12} strokeWidth={2.5} style={s.dimChevronIcon} />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  className="branch-popover-content"
                  sideOffset={6}
                  align="start"
                  onOpenAutoFocus={(e) => e.preventDefault()}
                >
                  <div className="branch-popover-list">
                    <div className="branch-popover-group-label">{t("repo.subRepos")}</div>
                    {roots.map((r) => {
                      const active = r.path === repoPath;
                      return (
                        <button
                          type="button"
                          key={r.path}
                          className="branch-popover-item"
                          onClick={() => handleSelectRepo(r.path)}
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
          )}
          <Popover.Root
            open={pickerOpen}
            onOpenChange={(open) => {
              setPickerOpen(open);
              if (!open) setSearch("");
            }}
          >
            <Popover.Trigger asChild>
              <button type="button" style={s.toolbarBtn} aria-label={t("newTask.baseBranch")}>
                <GitBranch size={13} strokeWidth={2} color="var(--text-muted)" />
                <span>{baseBranch || t("newTask.selectBaseBranch")}</span>
                <ChevronDown size={12} strokeWidth={2.5} style={s.dimChevronIcon} />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content className="branch-popover-content" sideOffset={6} align="start">
                <div className="branch-popover-search">
                  <Search
                    size={13}
                    strokeWidth={2}
                    color="var(--text-hint)"
                    style={s.flexShrinkIcon}
                  />
                  <input
                    className="branch-popover-search-input"
                    placeholder={t("branch.searchBranches")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    autoFocus
                  />
                  {search && (
                    <button
                      type="button"
                      className="branch-popover-clear"
                      onClick={() => setSearch("")}
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
                <div className="branch-popover-list">
                  {localBranches.length === 0 ? (
                    <div className="branch-popover-empty">{t("branch.noBranchesFound")}</div>
                  ) : (
                    localBranches.map((b) => (
                      <button
                        type="button"
                        key={b.name}
                        className="branch-popover-item"
                        onClick={() => {
                          onSetBaseBranch(b.name);
                          setPickerOpen(false);
                        }}
                      >
                        <GitBranch
                          size={12}
                          strokeWidth={2}
                          color="var(--text-hint)"
                          style={s.flexShrinkIcon}
                        />
                        <span className="branch-popover-item-name">{b.name}</span>
                        {baseBranch === b.name && (
                          <Check
                            size={12}
                            strokeWidth={2.5}
                            color="var(--accent)"
                            style={s.repoSelectorCheck}
                          />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <button
            type="button"
            style={s.toolbarIconBtn}
            onClick={handleRefresh}
            disabled={refreshing}
            title={t("common.refresh")}
            aria-label={t("common.refresh")}
          >
            <RefreshCw
              size={13}
              strokeWidth={2}
              color="var(--text-muted)"
              className={refreshing ? "spin" : undefined}
            />
          </button>
        </>
      )}
    </>
  );
}
