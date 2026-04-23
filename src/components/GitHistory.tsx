import { useState, useEffect, useCallback, useRef } from "react";
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
} from "lucide-react";
import { getGitStatusColor } from "../utils";

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
  projectPath: string;
  onCommitSelect: (hash: string, message: string) => void;
  onFileClick?: (hash: string, filePath: string, label: string) => void;
  width?: number;
}

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

function fileDir(path: string): string {
  const parts = path.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}

export function GitHistory({ projectPath, onCommitSelect, onFileClick, width = 280 }: Props) {
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [remoteCounts, setRemoteCounts] = useState<GitRemoteCounts>({
    ahead: 0,
    behind: 0,
    branch: "",
  });
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
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
  const branchDropRef = useRef<HTMLDivElement>(null);

  const { safeInvoke, isCancelled } = useCancellableInvoke();

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
    try {
      const list = await safeInvoke<GitBranchInfo[]>("git_list_branches", { projectPath });
      if (list === null) return; // Component unmounted
      setBranches(list);
      // Set initial branch to current if not yet set
      setSelectedBranch((prev) => {
        if (prev) return prev;
        return list.find((b) => b.current)?.name ?? "";
      });
    } catch {
      // ignore
    }
  }, [projectPath, safeInvoke]);

  const refresh = useCallback(
    async (query?: string, branch?: string) => {
      setLoading(true);
      setError(null);
      const activeBranch = branch ?? selectedBranch;
      try {
        const [log, remote] = await Promise.all([
          safeInvoke<GitCommit[]>("git_log", {
            projectPath,
            limit: 50,
            search: query ?? searchQuery,
            branch: activeBranch || null,
          }),
          safeInvoke<GitRemoteCounts>("git_remote_counts", {
            projectPath,
            branch: activeBranch || null,
          }).catch(() => ({ ahead: 0, behind: 0, branch: "" })),
        ]);
        if (log === null) return; // Component unmounted
        setCommits(log);
        setRemoteCounts((remote as GitRemoteCounts) ?? { ahead: 0, behind: 0, branch: "" });
      } catch (e) {
        if (!isCancelled()) setError(String(e));
      } finally {
        if (!isCancelled()) setLoading(false);
      }
    },
    [projectPath, searchQuery, selectedBranch, safeInvoke, isCancelled],
  );

  useEffect(() => {
    setSelectedBranch("");
    loadBranches();
    setSelectedHash(null);
    setSelectedDetail(null);
  }, [projectPath, loadBranches]);

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
      setSelectedHash(commit.hash);
      onCommitSelect(commit.hash, commit.message);
      setLoadingDetail(true);
      try {
        const detail = await safeInvoke<GitCommitDetail>("git_commit_detail", {
          projectPath,
          commitHash: commit.hash,
        });
        if (detail === null) return; // Component unmounted
        setSelectedDetail(detail);
      } catch {
        if (!isCancelled()) setSelectedDetail(null);
      } finally {
        if (!isCancelled()) setLoadingDetail(false);
      }
    },
    [projectPath, onCommitSelect, safeInvoke, isCancelled],
  );

  const handlePull = async () => {
    setPulling(true);
    setError(null);
    try {
      await safeInvoke("git_pull", { projectPath });
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
      await safeInvoke("git_push", { projectPath, branch: selectedBranch || null });
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
    <div
      style={{
        width,
        flexShrink: 0,
        background: "var(--bg-sidebar)",
        borderLeft: "1px solid var(--border-dim)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          borderBottom: "1px solid var(--border-dim)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            height: 48,
            display: "flex",
            alignItems: "center",
            padding: "0 10px",
            gap: 4,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 650, color: "var(--text-primary)", flex: 1 }}>
            History
          </span>

          <button
            onClick={handlePull}
            disabled={pulling}
            title="Pull"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              padding: "3px 7px",
              background: "none",
              border: "1px solid var(--border-dim)",
              borderRadius: 5,
              fontSize: 11.5,
              color: "var(--text-muted)",
              cursor: pulling ? "not-allowed" : "pointer",
              opacity: pulling ? 0.6 : 1,
            }}
          >
            Pull ↓{remoteCounts.behind}
          </button>
          <button
            onClick={handlePush}
            disabled={pushing}
            title="Push"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              padding: "3px 7px",
              background: pushing ? "var(--primary-action-bg)" : "none",
              border: `1px solid ${pushing ? "var(--primary-action-bg)" : "var(--border-dim)"}`,
              borderRadius: 5,
              fontSize: 11.5,
              color: pushing ? "var(--primary-action-fg)" : "var(--text-muted)",
              cursor: pushing ? "not-allowed" : "pointer",
              transition: "all 0.15s",
            }}
          >
            {pushing ? (
              <>
                <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />
                Pushing…
              </>
            ) : (
              <>Push ↑{remoteCounts.ahead}</>
            )}
          </button>
          <button
            onClick={() => refresh()}
            title="Refresh"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              borderRadius: 4,
              color: "var(--text-hint)",
              display: "flex",
              alignItems: "center",
            }}
          >
            <RefreshCw size={13} />
          </button>
        </div>

        {/* Branch selector */}
        <div ref={branchDropRef} style={{ padding: "0 10px 8px", position: "relative" }}>
          <button
            onClick={() => setBranchOpen((o) => !o)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              width: "100%",
              padding: "5px 8px",
              background: branchOpen ? "var(--bg-hover)" : "transparent",
              border: "1px solid var(--border-dim)",
              borderRadius: 6,
              cursor: "pointer",
              color: "var(--text-primary)",
              fontSize: 12,
              transition: "background 0.1s",
            }}
          >
            <GitBranchIcon size={11} color="var(--accent)" style={{ flexShrink: 0 }} />
            <span
              style={{
                flex: 1,
                textAlign: "left",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontWeight: 500,
              }}
            >
              {selectedBranch || "…"}
            </span>
            <ChevronDown
              size={11}
              color="var(--text-hint)"
              style={{
                flexShrink: 0,
                transition: "transform 0.15s",
                transform: branchOpen ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </button>

          {branchOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% - 2px)",
                left: 10,
                right: 10,
                background: "var(--bg-card)",
                border: "1px solid var(--border-dim)",
                borderRadius: 7,
                boxShadow: "var(--shadow-popover)",
                zIndex: 200,
                overflow: "hidden",
                maxHeight: 220,
                overflowY: "auto",
              }}
            >
              {branches.map((b) => {
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
            </div>
          )}
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: "8px 10px 4px", flexShrink: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 9px",
            background: "var(--bg-card)",
            border: "1px solid var(--border-dim)",
            borderRadius: 6,
          }}
        >
          <Search size={12} color="var(--text-hint)" />
          <input
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search commits"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--text-primary)",
              fontSize: 12,
            }}
          />
          <Filter size={12} color="var(--text-hint)" />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            margin: "0 10px 4px",
            padding: "6px 10px",
            background: "var(--danger-surface)",
            border: "1px solid var(--danger-border)",
            borderRadius: 6,
            fontSize: 11.5,
            color: "var(--danger-fg)",
          }}
        >
          {error}
        </div>
      )}

      {/* Commit list */}
      <div
        style={{
          flex: selectedDetail ? "0 0 auto" : 1,
          overflowY: "auto",
          maxHeight: selectedDetail ? "50%" : undefined,
        }}
      >
        {loading && commits.length === 0 && (
          <div
            style={{
              padding: "20px 16px",
              fontSize: 12,
              color: "var(--text-hint)",
              textAlign: "center",
            }}
          >
            Loading…
          </div>
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
          <div
            style={{
              padding: "20px 16px",
              fontSize: 12,
              color: "var(--text-hint)",
              textAlign: "center",
            }}
          >
            No commits found
          </div>
        )}
      </div>

      {/* Commit detail */}
      {selectedDetail && (
        <div
          style={{
            borderTop: "1px solid var(--border-dim)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            flex: 1,
          }}
        >
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
  const [hovered, setHovered] = useState(false);
  const hasBranch = commit.refs.some((r) => !r.startsWith("tag:") && !r.includes("HEAD"));
  const branchNames = commit.refs
    .filter((r) => !r.startsWith("tag:") && !r.includes("HEAD ->"))
    .map((r) => r.trim());

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "7px 12px",
        cursor: "pointer",
        background: isSelected
          ? "var(--bg-selected, var(--bg-hover))"
          : hovered
            ? "var(--bg-hover)"
            : "transparent",
        transition: "background 0.1s",
        borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
      }}
    >
      {/* Dot indicator */}
      <div style={{ flexShrink: 0, marginTop: 3 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: isSelected
              ? "var(--accent)"
              : hasBranch
                ? "var(--accent)"
                : "var(--text-hint)",
            border: isSelected
              ? "none"
              : `2px solid ${hasBranch ? "var(--accent)" : "var(--border-medium)"}`,
          }}
        />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 500,
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              minWidth: 0,
            }}
          >
            {commit.message}
          </span>
          {branchNames.map((ref) => (
            <span
              key={ref}
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                padding: "1px 6px",
                borderRadius: 4,
                background: "var(--accent)",
                color: "var(--fg-on-accent)",
                flexShrink: 0,
                whiteSpace: "nowrap",
              }}
            >
              {ref}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 10.5, color: "var(--text-hint)", fontFamily: "monospace" }}>
            {commit.short_hash}
          </span>
          <span style={{ fontSize: 10.5, color: "var(--text-hint)" }}>{commit.author}</span>
          <span style={{ fontSize: 10.5, color: "var(--text-hint)" }}>{commit.date}</span>
        </div>
      </div>
    </div>
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
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        cursor: "pointer",
        background: hovered || active ? "var(--bg-hover)" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <GitBranchIcon
        size={11}
        color={active ? "var(--accent)" : "var(--text-hint)"}
        style={{ flexShrink: 0 }}
      />
      <span
        style={{
          flex: 1,
          fontSize: 12,
          color: active ? "var(--accent)" : "var(--text-primary)",
          fontWeight: active ? 600 : 400,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </span>
      {current && (
        <span style={{ fontSize: 10, color: "var(--text-hint)", flexShrink: 0 }}>HEAD</span>
      )}
      {active && <Check size={11} color="var(--accent)" style={{ flexShrink: 0 }} />}
    </div>
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
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  if (loading) {
    return <div style={{ padding: 16, fontSize: 12, color: "var(--text-hint)" }}>Loading…</div>;
  }

  return (
    <div style={{ overflowY: "auto", flex: 1 }}>
      {/* Commit meta */}
      <div style={{ padding: "10px 12px 8px", borderBottom: "1px solid var(--border-dim)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <GitCommitIcon size={12} color="var(--text-hint)" />
          <span style={{ fontSize: 11, color: "var(--text-hint)", fontFamily: "monospace" }}>
            {detail.short_hash}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-hint)" }}>{detail.author}</span>
          <span style={{ fontSize: 11, color: "var(--text-hint)", marginLeft: "auto" }}>
            {detail.date}
          </span>
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: "var(--text-primary)",
            fontWeight: 500,
            lineHeight: 1.4,
            marginBottom: 4,
          }}
        >
          {detail.message}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-hint)" }}>
          {detail.files.length} file{detail.files.length !== 1 ? "s" : ""} changed{" "}
          <span style={{ color: "var(--diff-add-fg)" }}>+{detail.total_additions}</span>{" "}
          <span style={{ color: "var(--diff-delete-fg)" }}>-{detail.total_deletions}</span>
        </div>
      </div>

      {/* File list */}
      {detail.files.map((f) => {
        const color = getGitStatusColor(f.status);
        const name = fileName(f.path);
        const dir = fileDir(f.path);
        const clickable = !!onFileClick;
        const hovered = hoveredPath === f.path;
        return (
          <div
            key={f.path}
            onClick={clickable ? () => onFileClick(f.path) : undefined}
            onMouseEnter={clickable ? () => setHoveredPath(f.path) : undefined}
            onMouseLeave={clickable ? () => setHoveredPath(null) : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 12px",
              cursor: clickable ? "pointer" : "default",
              background: hovered ? "var(--bg-hover)" : "transparent",
              transition: "background 0.1s",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color,
                flexShrink: 0,
                width: 12,
                textAlign: "center",
              }}
            >
              {f.status}
            </span>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
              <span
                style={{
                  fontSize: 12,
                  color: hovered ? "var(--accent)" : "var(--text-primary)",
                  transition: "color 0.1s",
                }}
              >
                {name}
              </span>
              {dir && (
                <span style={{ fontSize: 11, color: "var(--text-hint)", marginLeft: 5 }}>
                  {dir}
                </span>
              )}
            </span>
            <span style={{ fontSize: 10.5, color: "var(--diff-add-fg)", flexShrink: 0 }}>
              +{f.additions}
            </span>
            <span style={{ fontSize: 10.5, color: "var(--diff-delete-fg)", flexShrink: 0 }}>
              -{f.deletions}
            </span>
          </div>
        );
      })}
    </div>
  );
}
