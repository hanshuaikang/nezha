import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Search, Plus, ChevronDown, X, Tag, Check, GitFork, GitBranch } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import * as Popover from "@radix-ui/react-popover";
import s from "../../styles";

interface GitBranchInfo {
  name: string;
  current: boolean;
  remote: string | null;
}

function BranchDialog({
  projectPath,
  branches,
  onClose,
  onCreated,
}: {
  projectPath: string;
  branches: GitBranchInfo[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const currentBranch = branches.find((b) => b.current);
  const [branchName, setBranchName] = useState("");
  const [fromBranch, setFromBranch] = useState(currentBranch?.name ?? "");
  const [branchSearch, setBranchSearch] = useState("");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const filteredBranches = useMemo(() => {
    const q = branchSearch.toLowerCase();
    return branches.filter((b) => !q || b.name.toLowerCase().includes(q));
  }, [branches, branchSearch]);

  const localBranches = filteredBranches.filter((b) => b.remote === null);
  const remoteGroups = filteredBranches
    .filter((b) => b.remote !== null)
    .reduce<Record<string, GitBranchInfo[]>>((acc, b) => {
      const key = b.remote!;
      if (!acc[key]) acc[key] = [];
      acc[key].push(b);
      return acc;
    }, {});

  const handleSelect = (name: string) => {
    setFromBranch(name);
    setPopoverOpen(false);
    setBranchSearch("");
  };

  const handleCreate = useCallback(async () => {
    const name = branchName.trim();
    if (!name) return;
    setLoading(true);
    setError("");
    try {
      await invoke("git_create_branch", {
        projectPath,
        branchName: name,
        fromBranch,
      });
      onCreated();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [branchName, fromBranch, projectPath, onCreated]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && branchName.trim() && !loading) handleCreate();
    if (e.key === "Escape") onClose();
  };

  return (
    <div
      style={s.modalOverlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={s.branchDialogBox} onKeyDown={handleKeyDown}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <GitBranch size={16} strokeWidth={2} color="var(--accent)" />
            <span style={s.branchDialogTitle}>Create Branch</span>
          </div>
          <button style={s.modalCloseBtn} onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <div>
          <label style={{ ...s.modalLabel, display: "flex", alignItems: "center", gap: 5 }}>
            <Tag size={12} strokeWidth={2} color="var(--text-hint)" />
            Branch name
          </label>
          <input
            style={s.branchInput}
            placeholder="feature/my-branch"
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <label style={{ ...s.modalLabel, display: "flex", alignItems: "center", gap: 5 }}>
            <GitFork size={12} strokeWidth={2} color="var(--text-hint)" />
            Based on
          </label>
          <Popover.Root open={popoverOpen} onOpenChange={setPopoverOpen}>
            <Popover.Trigger asChild>
              <button className="radix-select-trigger" style={{ width: "100%" }}>
                <span
                  style={{
                    flex: 1,
                    textAlign: "left",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {fromBranch || "Select branch…"}
                </span>
                <ChevronDown
                  size={13}
                  strokeWidth={2}
                  color="var(--text-hint)"
                  style={{ flexShrink: 0 }}
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
                {/* Search input */}
                <div className="branch-popover-search">
                  <Search
                    size={13}
                    strokeWidth={2}
                    color="var(--text-hint)"
                    style={{ flexShrink: 0 }}
                  />
                  <input
                    className="branch-popover-search-input"
                    placeholder="Search branches…"
                    value={branchSearch}
                    onChange={(e) => setBranchSearch(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    autoFocus
                  />
                  {branchSearch && (
                    <button className="branch-popover-clear" onClick={() => setBranchSearch("")}>
                      <X size={11} />
                    </button>
                  )}
                </div>
                <div className="branch-popover-list">
                  {localBranches.length > 0 && (
                    <>
                      <div className="branch-popover-group-label">Local</div>
                      {localBranches.map((b) => (
                        <button
                          key={b.name}
                          className="branch-popover-item"
                          onClick={() => handleSelect(b.name)}
                        >
                          <GitBranch
                            size={12}
                            strokeWidth={2}
                            color="var(--text-hint)"
                            style={{ flexShrink: 0 }}
                          />
                          <span className="branch-popover-item-name">
                            {b.name}
                            {b.current ? " (current)" : ""}
                          </span>
                          {fromBranch === b.name && (
                            <Check
                              size={12}
                              strokeWidth={2.5}
                              color="var(--accent)"
                              style={{ flexShrink: 0, marginLeft: "auto" }}
                            />
                          )}
                        </button>
                      ))}
                    </>
                  )}
                  {Object.entries(remoteGroups).map(([remote, bs]) => (
                    <div key={remote}>
                      <div className="branch-popover-separator" />
                      <div className="branch-popover-group-label">{remote}</div>
                      {bs.map((b) => (
                        <button
                          key={b.name}
                          className="branch-popover-item"
                          onClick={() => handleSelect(b.name)}
                        >
                          <GitBranch
                            size={12}
                            strokeWidth={2}
                            color="var(--text-hint)"
                            style={{ flexShrink: 0 }}
                          />
                          <span className="branch-popover-item-name">{b.name}</span>
                          {fromBranch === b.name && (
                            <Check
                              size={12}
                              strokeWidth={2.5}
                              color="var(--accent)"
                              style={{ flexShrink: 0, marginLeft: "auto" }}
                            />
                          )}
                        </button>
                      ))}
                    </div>
                  ))}
                  {localBranches.length === 0 && Object.keys(remoteGroups).length === 0 && (
                    <div
                      style={{
                        padding: "12px 10px",
                        fontSize: 12,
                        color: "var(--text-hint)",
                        textAlign: "center",
                      }}
                    >
                      No branches found
                    </div>
                  )}
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>

        {error && <div style={s.branchDialogError}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button style={s.modalCancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            style={{
              ...s.modalSaveBtn,
              opacity: !branchName.trim() || loading ? 0.5 : 1,
              cursor: !branchName.trim() || loading ? "default" : "pointer",
            }}
            disabled={!branchName.trim() || loading}
            onClick={handleCreate}
          >
            {loading ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function BranchBar({
  projectPath,
  active = true,
}: {
  projectPath: string;
  active?: boolean;
}) {
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [switching, setSwitching] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState("");

  // 防止 focus / 轮询 / 切换分支 等多源触发同时打出多次 IPC 请求。
  // 已有未完成的请求时直接复用，避免后端 git 命令并发堵塞 Tokio worker。
  const inflightRef = useRef<Promise<void> | null>(null);
  const fetchBranches = useCallback(async () => {
    if (inflightRef.current) return inflightRef.current;
    const p = (async () => {
      try {
        const result = await invoke<GitBranchInfo[]>("git_list_branches", { projectPath });
        setBranches(result);
      } catch {
        // not a git repo or git not available
      } finally {
        inflightRef.current = null;
      }
    })();
    inflightRef.current = p;
    return p;
  }, [projectPath]);

  useEffect(() => {
    if (!active) return;
    fetchBranches();
  }, [active, fetchBranches]);

  // 检测外部分支切换：窗口获焦时刷新 + 10 秒轮询兜底
  // 仅当前可见项目才注册监听/轮询，避免后台项目叠加 IPC 打爆 Tokio worker
  useEffect(() => {
    if (!active) return;
    const onFocus = () => fetchBranches();
    window.addEventListener("focus", onFocus);
    const timer = setInterval(fetchBranches, 10_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(timer);
    };
  }, [active, fetchBranches]);

  const currentBranch = branches.find((b) => b.current);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return branches.filter((b) => !q || b.name.toLowerCase().includes(q));
  }, [branches, search]);

  const localBranches = filtered.filter((b) => b.remote === null);
  const remoteGroups = filtered
    .filter((b) => b.remote !== null)
    .reduce<Record<string, GitBranchInfo[]>>((acc, b) => {
      const key = b.remote!;
      if (!acc[key]) acc[key] = [];
      acc[key].push(b);
      return acc;
    }, {});

  if (branches.length === 0) return null;

  const handleSwitch = async (branch: GitBranchInfo) => {
    if (branch.current || switching) return;
    setSwitching(branch.name);
    setSwitchError("");
    try {
      await invoke("git_checkout_branch", {
        projectPath,
        branchName: branch.name,
        isRemote: branch.remote !== null,
      });
      const staleFetch = inflightRef.current;
      if (staleFetch) {
        await staleFetch;
      }
      await fetchBranches();
      setPickerOpen(false);
      setSearch("");
    } catch (e) {
      setSwitchError(String(e));
    } finally {
      setSwitching(null);
    }
  };

  return (
    <>
      <Popover.Root
        open={pickerOpen}
        onOpenChange={(open) => {
          setPickerOpen(open);
          if (!open) {
            setSearch("");
            setSwitchError("");
          }
        }}
      >
        <Popover.Trigger asChild>
          <div
            style={{
              ...s.branchBar,
              background: pickerOpen ? "var(--bg-hover)" : "var(--bg-card)",
              cursor: "pointer",
            }}
            title="Switch branch"
          >
            <GitBranch
              size={12}
              strokeWidth={2}
              color="var(--text-muted)"
              style={{ flexShrink: 0 }}
            />
            <span style={s.branchBarName}>{currentBranch?.name ?? "detached HEAD"}</span>
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
            {/* Search */}
            <div className="branch-popover-search">
              <Search
                size={13}
                strokeWidth={2}
                color="var(--text-hint)"
                style={{ flexShrink: 0 }}
              />
              <input
                className="branch-popover-search-input"
                placeholder="Switch to branch…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                autoFocus
              />
              {search && (
                <button className="branch-popover-clear" onClick={() => setSearch("")}>
                  <X size={11} />
                </button>
              )}
            </div>

            {/* Branch list */}
            <div className="branch-popover-list">
              {localBranches.length > 0 && (
                <>
                  <div className="branch-popover-group-label">Local</div>
                  {localBranches.map((b) => (
                    <button
                      key={b.name}
                      className="branch-popover-item"
                      onClick={() => handleSwitch(b)}
                      disabled={!!switching}
                      style={{ opacity: switching && switching !== b.name ? 0.5 : 1 }}
                    >
                      <GitBranch
                        size={12}
                        strokeWidth={2}
                        color="var(--text-hint)"
                        style={{ flexShrink: 0 }}
                      />
                      <span className="branch-popover-item-name">{b.name}</span>
                      {b.current && (
                        <Check
                          size={12}
                          strokeWidth={2.5}
                          color="var(--accent)"
                          style={{ flexShrink: 0, marginLeft: "auto" }}
                        />
                      )}
                      {switching === b.name && (
                        <span
                          style={{ fontSize: 10, color: "var(--text-hint)", marginLeft: "auto" }}
                        >
                          …
                        </span>
                      )}
                    </button>
                  ))}
                </>
              )}
              {Object.entries(remoteGroups).map(([remote, bs]) => (
                <div key={remote}>
                  <div className="branch-popover-separator" />
                  <div className="branch-popover-group-label">{remote}</div>
                  {bs.map((b) => (
                    <button
                      key={b.name}
                      className="branch-popover-item"
                      onClick={() => handleSwitch(b)}
                      disabled={!!switching}
                      style={{ opacity: switching && switching !== b.name ? 0.5 : 1 }}
                    >
                      <GitBranch
                        size={12}
                        strokeWidth={2}
                        color="var(--text-hint)"
                        style={{ flexShrink: 0 }}
                      />
                      <span className="branch-popover-item-name">{b.name}</span>
                      {switching === b.name && (
                        <span
                          style={{ fontSize: 10, color: "var(--text-hint)", marginLeft: "auto" }}
                        >
                          …
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
              {localBranches.length === 0 && Object.keys(remoteGroups).length === 0 && (
                <div
                  style={{
                    padding: "12px 10px",
                    fontSize: 12,
                    color: "var(--text-hint)",
                    textAlign: "center",
                  }}
                >
                  No branches found
                </div>
              )}
            </div>

            {switchError && (
              <div
                style={{
                  padding: "6px 10px",
                  fontSize: 11,
                  color: "var(--danger)",
                  borderTop: "1px solid var(--border)",
                }}
              >
                {switchError}
              </div>
            )}

            {/* Footer: new branch */}
            <div className="branch-popover-separator" />
            <button
              className="branch-popover-item"
              style={{ gap: 6 }}
              onClick={() => {
                setPickerOpen(false);
                setSearch("");
                setShowDialog(true);
              }}
            >
              <Plus size={12} strokeWidth={2.5} color="var(--accent)" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "var(--accent)" }}>New branch…</span>
            </button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {showDialog && (
        <BranchDialog
          projectPath={projectPath}
          branches={branches}
          onClose={() => setShowDialog(false)}
          onCreated={() => {
            fetchBranches();
            setShowDialog(false);
          }}
        />
      )}
    </>
  );
}
