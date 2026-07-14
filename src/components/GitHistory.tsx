import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useCancellableInvoke } from "../hooks/useCancellableInvoke";
import {
  Search,
  RefreshCw,
  Filter,
  GitCommit as GitCommitIcon,
  GitBranch as GitBranchIcon,
  Loader2,
  ChevronDown,
  Check,
  X,
} from "lucide-react";
import { useI18n } from "../i18n";
import { gitHistoryRootStyle } from "../styles/git-diff";
import { GitFileBrowser, GitFileViewToggle, useGitFileViewMode } from "./git-view/GitFileBrowser";

interface GitCommit {
  hash: string;
  short_hash: string;
  author: string;
  date: string;
  message: string;
  refs: string[];
}

interface GitCommitFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

interface GitCommitDetail {
  hash: string;
  short_hash: string;
  author: string;
  date: string;
  message: string;
  files: GitCommitFile[];
  total_additions: number;
  total_deletions: number;
}

interface GitRemoteCounts {
  ahead: number;
  behind: number;
  branch: string;
}

interface GitBranchInfo {
  name: string;
  current: boolean;
}

interface Props {
  projectRoot: string;
  repoPath: string;
  onCommitSelect: (hash: string, message: string) => void;
  onFileClick?: (hash: string, filePath: string, label: string) => void;
  width?: number;
}

export function GitHistory({
  projectRoot,
  repoPath,
  onCommitSelect,
  onFileClick,
  width = 280,
}: Props) {
  const { t } = useI18n();
  const repoKey = `${projectRoot}\0${repoPath}`;
  const activeRepoKeyRef = useRef(repoKey);
  activeRepoKeyRef.current = repoKey;
  const branchSequenceRef = useRef(0);
  const refreshSequenceRef = useRef(0);
  const detailSequenceRef = useRef(0);
  const [commitState, setCommitState] = useState<{
    repoKey: string;
    commits: GitCommit[];
  }>({ repoKey: "", commits: [] });
  const commits = commitState.repoKey === repoKey ? commitState.commits : [];
  const [remoteCounts, setRemoteCounts] = useState<GitRemoteCounts>({
    ahead: 0,
    behind: 0,
    branch: "",
  });
  const [branchState, setBranchState] = useState<{
    repoKey: string;
    branches: GitBranchInfo[];
  }>({ repoKey: "", branches: [] });
  const branches = useMemo(
    () => (branchState.repoKey === repoKey ? branchState.branches : []),
    [branchState, repoKey],
  );
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<GitCommitDetail | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchSearch, setBranchSearch] = useState("");
  const branchDropRef = useRef<HTMLDivElement>(null);

  const { safeInvoke, isCancelled } = useCancellableInvoke();

  const filteredBranches = useMemo(() => {
    const query = branchSearch.trim().toLowerCase();
    if (!query) return branches;
    return branches.filter((branch) => branch.name.toLowerCase().includes(query));
  }, [branches, branchSearch]);

  useEffect(() => {
    if (!branchOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (!branchDropRef.current?.contains(e.target as Node)) {
        setBranchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [branchOpen]);

  const loadBranches = useCallback(async () => {
    const sequence = ++branchSequenceRef.current;
    const requestRepoKey = repoKey;
    try {
      const list = await safeInvoke<GitBranchInfo[]>("git_list_branches", {
        projectPath: projectRoot,
        repoPath,
      });
      if (
        list === null ||
        activeRepoKeyRef.current !== requestRepoKey ||
        branchSequenceRef.current !== sequence
      ) {
        return;
      }
      setBranchState({ repoKey: requestRepoKey, branches: list });
      // Set initial branch to current if not yet set
      setSelectedBranch((prev) => {
        if (prev) return prev;
        return list.find((b) => b.current)?.name ?? "";
      });
    } catch {
      // ignore
    }
  }, [projectRoot, repoPath, repoKey, safeInvoke]);

  const refresh = useCallback(
    async (query?: string, branch?: string) => {
      const sequence = ++refreshSequenceRef.current;
      setLoading(true);
      setError(null);
      const activeBranch = branch ?? selectedBranch;
      const requestRepoKey = repoKey;
      try {
        const [log, remote] = await Promise.all([
          safeInvoke<GitCommit[]>("git_log", {
            projectPath: projectRoot,
            repoPath,
            limit: 50,
            search: query ?? searchQuery,
            branch: activeBranch || null,
          }),
          safeInvoke<GitRemoteCounts>("git_remote_counts", {
            projectPath: projectRoot,
            repoPath,
            branch: activeBranch || null,
          }).catch(() => ({ ahead: 0, behind: 0, branch: "" })),
        ]);
        if (
          log === null ||
          activeRepoKeyRef.current !== requestRepoKey ||
          refreshSequenceRef.current !== sequence
        ) {
          return;
        }
        setCommitState({ repoKey: requestRepoKey, commits: log });
        setRemoteCounts((remote as GitRemoteCounts) ?? { ahead: 0, behind: 0, branch: "" });
      } catch (e) {
        if (
          !isCancelled() &&
          activeRepoKeyRef.current === requestRepoKey &&
          refreshSequenceRef.current === sequence
        ) {
          setError(String(e));
        }
      } finally {
        if (
          !isCancelled() &&
          activeRepoKeyRef.current === requestRepoKey &&
          refreshSequenceRef.current === sequence
        ) {
          setLoading(false);
        }
      }
    },
    [projectRoot, repoPath, repoKey, searchQuery, selectedBranch, safeInvoke, isCancelled],
  );

  useEffect(() => {
    setSelectedBranch("");
    setBranchSearch("");
    setRemoteCounts({ ahead: 0, behind: 0, branch: "" });
    loadBranches();
    setSelectedHash(null);
    setSelectedDetail(null);
  }, [repoKey, loadBranches]);

  useEffect(() => {
    if (selectedBranch !== "") {
      refresh(undefined, selectedBranch);
    }
    // refresh 依赖 searchQuery，若加入 deps 会在搜索变化时触发此 effect（不预期的行为）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranch]);

  const handleSearch = useCallback(
    (q: string) => {
      setSearchQuery(q);
      refresh(q);
    },
    [refresh],
  );

  const handleSelectCommit = useCallback(
    async (commit: GitCommit) => {
      const sequence = ++detailSequenceRef.current;
      const requestRepoKey = repoKey;
      setSelectedHash(commit.hash);
      onCommitSelect(commit.hash, commit.message);
      setLoadingDetail(true);
      try {
        const detail = await safeInvoke<GitCommitDetail>("git_commit_detail", {
          projectPath: projectRoot,
          repoPath,
          commitHash: commit.hash,
        });
        if (
          detail === null ||
          activeRepoKeyRef.current !== requestRepoKey ||
          detailSequenceRef.current !== sequence
        ) {
          return;
        }
        setSelectedDetail(detail);
      } catch {
        if (
          !isCancelled() &&
          activeRepoKeyRef.current === requestRepoKey &&
          detailSequenceRef.current === sequence
        ) {
          setSelectedDetail(null);
        }
      } finally {
        if (
          !isCancelled() &&
          activeRepoKeyRef.current === requestRepoKey &&
          detailSequenceRef.current === sequence
        ) {
          setLoadingDetail(false);
        }
      }
    },
    [projectRoot, repoPath, repoKey, onCommitSelect, safeInvoke, isCancelled],
  );

  const handlePull = async () => {
    setPulling(true);
    setError(null);
    try {
      await safeInvoke("git_pull", { projectPath: projectRoot, repoPath });
      if (!isCancelled()) refresh();
    } catch (e) {
      if (!isCancelled()) setError(String(e));
    } finally {
      if (!isCancelled()) setPulling(false);
    }
  };

  const handlePush = async () => {
    setPushing(true);
    setError(null);
    try {
      await safeInvoke("git_push", {
        projectPath: projectRoot,
        repoPath,
        branch: selectedBranch || null,
      });
      if (!isCancelled()) {
        refresh();
        await loadBranches();
      }
    } catch (e) {
      if (!isCancelled()) setError(String(e));
    } finally {
      if (!isCancelled()) setPushing(false);
    }
  };

  return (
    <div className="git-history-root" style={gitHistoryRootStyle(width)}>
      {/* Header */}
      <div className="git-history-header">
        <div className="git-history-titlebar">
          <span className="git-history-title">{t("git.history")}</span>

          <button
            type="button"
            onClick={handlePull}
            disabled={pulling}
            title={t("git.pull")}
            className="git-history-sync-btn"
          >
            {t("git.pull")} ↓{remoteCounts.behind}
          </button>
          <button
            type="button"
            onClick={handlePush}
            disabled={pushing}
            title={t("git.push")}
            className="git-history-sync-btn"
            data-busy={pushing}
          >
            {pushing ? (
              <>
                <Loader2 size={11} className="git-history-spin" />
                {t("git.pushing")}
              </>
            ) : (
              <>
                {t("git.push")} ↑{remoteCounts.ahead}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => refresh()}
            title={t("common.refresh")}
            className="git-history-icon-btn"
          >
            <RefreshCw size={13} />
          </button>
        </div>

        {/* Branch selector */}
        <div ref={branchDropRef} className="git-history-branch-wrap">
          <button
            type="button"
            onClick={() => setBranchOpen((o) => !o)}
            className="git-history-branch-trigger"
            data-open={branchOpen}
            aria-expanded={branchOpen}
          >
            <GitBranchIcon size={11} className="git-history-branch-icon" />
            <span className="git-history-branch-label">{selectedBranch || "…"}</span>
            <ChevronDown size={11} className="git-history-branch-chevron" data-open={branchOpen} />
          </button>

          {branchOpen && (
            <div className="git-history-branch-menu">
              <div className="branch-popover-search">
                <Search size={13} className="git-history-search-icon" />
                <input
                  autoFocus
                  className="branch-popover-search-input"
                  placeholder={t("branch.searchBranches")}
                  value={branchSearch}
                  onChange={(e) => setBranchSearch(e.target.value)}
                />
                {branchSearch && (
                  <button
                    className="branch-popover-clear"
                    onClick={() => setBranchSearch("")}
                    title={t("common.reset")}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              <div className="branch-popover-list">
                {filteredBranches.map((b) => {
                  const active = selectedBranch === b.name;
                  return (
                    <BranchOption
                      key={b.name}
                      name={b.name}
                      current={b.current}
                      active={active}
                      onClick={() => {
                        setSelectedBranch(b.name);
                        setBranchOpen(false);
                      }}
                    />
                  );
                })}
                {filteredBranches.length === 0 && (
                  <div className="branch-popover-empty">{t("branch.noBranchesFound")}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="git-history-search-shell">
        <div className="git-history-search-box">
          <Search size={12} className="git-history-search-icon" />
          <input
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={t("git.searchCommits")}
            className="git-history-search-input"
          />
          <Filter size={12} className="git-history-filter-icon" />
        </div>
      </div>

      {/* Error */}
      {error && <div className="git-history-error">{error}</div>}

      {/* Commit list */}
      <div className="git-history-list" data-has-detail={Boolean(selectedDetail)}>
        {loading && commits.length === 0 && (
          <div className="git-history-state">{t("common.loadingEllipsis")}</div>
        )}
        {commits.map((commit) => {
          const isSelected = commit.hash === selectedHash;
          return (
            <CommitRow
              key={commit.hash}
              commit={commit}
              isSelected={isSelected}
              onClick={() => handleSelectCommit(commit)}
            />
          );
        })}
        {!loading && commits.length === 0 && (
          <div className="git-history-state">{t("git.noCommitsFound")}</div>
        )}
      </div>

      {/* Commit detail */}
      {selectedDetail && (
        <div className="git-history-detail-wrap">
          <CommitDetailPanel
            detail={selectedDetail}
            loading={loadingDetail}
            onFileClick={
              onFileClick
                ? (path) =>
                    onFileClick(selectedDetail.hash, path, `${path} @ ${selectedDetail.short_hash}`)
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}

function CommitRow({
  commit,
  isSelected,
  onClick,
}: {
  commit: GitCommit;
  isSelected: boolean;
  onClick: () => void;
}) {
  const hasBranch = commit.refs.some((r) => !r.startsWith("tag:") && !r.includes("HEAD"));
  const branchNames = commit.refs
    .filter((r) => !r.startsWith("tag:") && !r.includes("HEAD ->"))
    .map((r) => r.trim());

  return (
    <button
      type="button"
      onClick={onClick}
      className="git-history-commit-row"
      data-selected={isSelected}
      aria-pressed={isSelected}
    >
      {/* Dot indicator */}
      <div className="git-history-commit-dot-wrap">
        <div
          className="git-history-commit-dot"
          data-selected={isSelected}
          data-branch={hasBranch}
        />
      </div>

      <div className="git-history-commit-body">
        <div className="git-history-commit-title-row">
          <span className="git-history-commit-message">{commit.message}</span>
          {branchNames.map((ref) => (
            <span key={ref} className="git-history-ref-chip">
              {ref}
            </span>
          ))}
        </div>
        <div className="git-history-commit-meta">
          <span className="git-history-commit-hash">{commit.short_hash}</span>
          <span>{commit.author}</span>
          <span>{commit.date}</span>
        </div>
      </div>
    </button>
  );
}

function BranchOption({
  name,
  current,
  active,
  onClick,
}: {
  name: string;
  current: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="git-history-branch-option"
      data-active={active}
      aria-selected={active}
    >
      <GitBranchIcon size={11} className="git-history-branch-icon" />
      <span className="git-history-branch-name">{name}</span>
      {current && <span className="git-history-branch-head">HEAD</span>}
      {active && <Check size={11} className="git-history-branch-icon" />}
    </button>
  );
}

function CommitDetailPanel({
  detail,
  loading,
  onFileClick,
}: {
  detail: GitCommitDetail;
  loading: boolean;
  onFileClick?: (path: string) => void;
}) {
  const { t } = useI18n();
  const [fileViewMode, setFileViewMode] = useGitFileViewMode();

  if (loading) {
    return <div className="git-history-detail-loading">{t("common.loadingEllipsis")}</div>;
  }

  return (
    <div className="git-history-detail">
      {/* Commit meta */}
      <div className="git-history-detail-meta">
        <div className="git-history-detail-line">
          <GitCommitIcon size={12} className="git-history-commit-icon" />
          <span className="git-history-detail-hash">{detail.short_hash}</span>
          <span className="git-history-detail-muted">{detail.author}</span>
          <span className="git-history-detail-muted git-history-detail-date">{detail.date}</span>
        </div>
        <div className="git-history-detail-message">{detail.message}</div>
        <div className="git-history-detail-stats">
          <div className="git-history-detail-file-count">
            {t(detail.files.length === 1 ? "common.fileChanged" : "common.filesChanged", {
              count: detail.files.length,
            })}{" "}
            <span className="git-history-add">+{detail.total_additions}</span>{" "}
            <span className="git-history-delete">-{detail.total_deletions}</span>
          </div>
          <GitFileViewToggle mode={fileViewMode} onChange={setFileViewMode} />
        </div>
      </div>

      {/* File list */}
      <GitFileBrowser
        entries={detail.files}
        mode={fileViewMode}
        showStats
        onFileClick={onFileClick ? (f) => onFileClick(f.path) : undefined}
      />
    </div>
  );
}
