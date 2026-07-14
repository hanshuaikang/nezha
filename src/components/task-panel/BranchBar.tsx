import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Search, Plus, ChevronDown, X, Tag, Check, GitFork, GitBranch } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import * as Popover from "@radix-ui/react-popover";
import { useI18n } from "../../i18n";
import s from "../../styles";

interface GitBranchInfo {
  name: string;
  current: boolean;
  remote: string | null;
}

function BranchDialog({
  projectRoot,
  repoPath,
  branches,
  onClose,
  onCreated,
}: {
  projectRoot: string;
  repoPath: string;
  branches: GitBranchInfo[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const currentBranch = branches.find((b) => b.current);
  const [branchName, setBranchName] = useState("");
  const [fromBranch, setFromBranch] = useState(currentBranch?.name ?? "");
  const [branchSearch, setBranchSearch] = useState("");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [splitMenuOpen, setSplitMenuOpen] = useState(false);
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

  const handleCreate = useCallback(
    async (checkout: boolean) => {
      const name = branchName.trim();
      if (!name) return;
      setLoading(true);
      setError("");
      try {
        await invoke("git_create_branch", {
          projectPath: projectRoot,
          repoPath,
          branchName: name,
          fromBranch,
          checkout,
        });
        onCreated();
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [branchName, fromBranch, projectRoot, repoPath, onCreated],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && branchName.trim() && !loading) handleCreate(true);
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
        <div style={s.branchDialogHeader}>
          <div style={s.branchDialogHeaderTitle}>
            <GitBranch size={16} strokeWidth={2} color="var(--text-hint)" />
            <span style={s.branchDialogTitle}>{t("branch.createBranch")}</span>
          </div>
          <button style={s.modalCloseBtn} onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <div>
          <label style={s.branchDialogLabel}>
            <Tag size={12} strokeWidth={2} color="var(--text-hint)" />
            {t("branch.branchName")}
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
          <label style={s.branchDialogLabel}>
            <GitFork size={12} strokeWidth={2} color="var(--text-hint)" />
            {t("branch.basedOn")}
          </label>
          <Popover.Root open={popoverOpen} onOpenChange={setPopoverOpen}>
            <Popover.Trigger asChild>
              <button className="radix-select-trigger">
                <span style={s.branchDialogSelectValue}>
                  {fromBranch || t("branch.selectBranch")}
                </span>
                <ChevronDown
                  size={13}
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
                {/* Search input */}
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
                      <div className="branch-popover-group-label">{t("branch.local")}</div>
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
                            style={s.flexShrinkIcon}
                          />
                          <span className="branch-popover-item-name">
                            {b.name}
                            {b.current ? t("branch.current") : ""}
                          </span>
                          {fromBranch === b.name && (
                            <Check
                              size={12}
                              strokeWidth={2.5}
                              color="var(--accent)"
                              style={s.repoSelectorCheck}
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
                            style={s.flexShrinkIcon}
                          />
                          <span className="branch-popover-item-name">{b.name}</span>
                          {fromBranch === b.name && (
                            <Check
                              size={12}
                              strokeWidth={2.5}
                              color="var(--accent)"
                              style={s.repoSelectorCheck}
                            />
                          )}
                        </button>
                      ))}
                    </div>
                  ))}
                  {localBranches.length === 0 && Object.keys(remoteGroups).length === 0 && (
                    <div className="branch-popover-empty">{t("branch.noBranchesFound")}</div>
                  )}
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>

        {error && <div style={s.branchDialogError}>{error}</div>}

        <div style={s.branchDialogActions}>
          <button style={s.modalCancelBtn} onClick={onClose}>
            {t("common.cancel")}
          </button>
          <Popover.Root open={splitMenuOpen} onOpenChange={setSplitMenuOpen}>
            <Popover.Trigger asChild>
              <button
                style={
                  !branchName.trim() || loading
                    ? s.modalSaveSelectTriggerDisabled
                    : s.modalSaveSelectTrigger
                }
                disabled={!branchName.trim() || loading}
              >
                <span>{loading ? t("branch.creating") : t("branch.createAndSwitch")}</span>
                <ChevronDown size={12} strokeWidth={2.5} style={s.dimChevronIconStrong} />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                side="bottom"
                align="end"
                sideOffset={6}
                avoidCollisions={false}
                style={s.toolbarMenuContent}
              >
                <Popover.Close asChild>
                  <button className="branch-popover-item" onClick={() => handleCreate(true)}>
                    <GitFork size={13} strokeWidth={2} color="var(--text-muted)" />
                    {t("branch.createAndSwitch")}
                  </button>
                </Popover.Close>
                <Popover.Close asChild>
                  <button className="branch-popover-item" onClick={() => handleCreate(false)}>
                    <Plus size={13} strokeWidth={2} color="var(--text-muted)" />
                    {t("branch.createOnly")}
                  </button>
                </Popover.Close>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      </div>
    </div>
  );
}

export function BranchBar({
  projectRoot,
  repoPath,
  active = true,
}: {
  projectRoot: string;
  repoPath: string;
  active?: boolean;
}) {
  const { t } = useI18n();
  const [showDialog, setShowDialog] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [switching, setSwitching] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState("");
  const repoKey = `${projectRoot}\0${repoPath}`;
  const activeRepoKeyRef = useRef(repoKey);
  activeRepoKeyRef.current = repoKey;
  const [branchState, setBranchState] = useState<{
    repoKey: string;
    branches: GitBranchInfo[];
  }>({ repoKey: "", branches: [] });
  const branches = useMemo(
    () => (branchState.repoKey === repoKey ? branchState.branches : []),
    [branchState, repoKey],
  );

  // 防止 focus / 轮询 / 切换分支 等多源触发同时打出多次 IPC 请求。
  // 只复用同一 repoKey 的请求；切仓后旧响应必须丢弃，不能覆盖新仓库的分支列表。
  const inflightRef = useRef<{
    repoKey: string;
    requestId: symbol;
    promise: Promise<void>;
  } | null>(null);
  const fetchBranches = useCallback(async () => {
    if (inflightRef.current?.repoKey === repoKey) return inflightRef.current.promise;
    const requestId = Symbol(repoKey);
    const p = (async () => {
      try {
        const result = await invoke<GitBranchInfo[]>("git_list_branches", {
          projectPath: projectRoot,
          repoPath,
        });
        if (activeRepoKeyRef.current === repoKey) {
          setBranchState({ repoKey, branches: result });
        }
      } catch {
        // not a git repo or git not available
      } finally {
        if (inflightRef.current?.requestId === requestId) {
          inflightRef.current = null;
        }
      }
    })();
    inflightRef.current = { repoKey, requestId, promise: p };
    return p;
  }, [projectRoot, repoPath, repoKey]);

  useEffect(() => {
    setPickerOpen(false);
    setSearch("");
    setSwitchError("");
    setSwitching(null);
  }, [repoKey]);

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
        projectPath: projectRoot,
        repoPath,
        branchName: branch.name,
        isRemote: branch.remote !== null,
      });
      const staleFetch = inflightRef.current;
      if (staleFetch) {
        await staleFetch.promise;
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
          <button
            type="button"
            style={pickerOpen ? s.branchBarOpen : s.branchBar}
            title={t("branch.switchBranch")}
            aria-label={t("branch.switchBranch")}
          >
            <GitBranch
              size={12}
              strokeWidth={2}
              color="var(--text-muted)"
              style={s.flexShrinkIcon}
            />
            <span style={s.branchBarName}>{currentBranch?.name ?? t("branch.detachedHead")}</span>
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
            {/* Search */}
            <div className="branch-popover-search">
              <Search size={13} strokeWidth={2} color="var(--text-hint)" style={s.flexShrinkIcon} />
              <input
                className="branch-popover-search-input"
                placeholder={t("branch.switchToBranch")}
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
                  <div className="branch-popover-group-label">{t("branch.local")}</div>
                  {localBranches.map((b) => (
                    <button
                      key={b.name}
                      className="branch-popover-item"
                      onClick={() => handleSwitch(b)}
                      disabled={!!switching}
                      style={
                        switching && switching !== b.name
                          ? s.branchPopoverItemDim
                          : s.branchPopoverItemNormal
                      }
                    >
                      <GitBranch
                        size={12}
                        strokeWidth={2}
                        color="var(--text-hint)"
                        style={s.flexShrinkIcon}
                      />
                      <span className="branch-popover-item-name">{b.name}</span>
                      {b.current && (
                        <Check
                          size={12}
                          strokeWidth={2.5}
                          color="var(--accent)"
                          style={s.repoSelectorCheck}
                        />
                      )}
                      {switching === b.name && <span style={s.branchSwitchIndicator}>…</span>}
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
                      style={
                        switching && switching !== b.name
                          ? s.branchPopoverItemDim
                          : s.branchPopoverItemNormal
                      }
                    >
                      <GitBranch
                        size={12}
                        strokeWidth={2}
                        color="var(--text-hint)"
                        style={s.flexShrinkIcon}
                      />
                      <span className="branch-popover-item-name">{b.name}</span>
                      {switching === b.name && <span style={s.branchSwitchIndicator}>…</span>}
                    </button>
                  ))}
                </div>
              ))}
              {localBranches.length === 0 && Object.keys(remoteGroups).length === 0 && (
                <div className="branch-popover-empty">{t("branch.noBranchesFound")}</div>
              )}
            </div>

            {switchError && <div style={s.branchSwitchError}>{switchError}</div>}

            {/* Footer: new branch */}
            <div className="branch-popover-separator" />
            <button
              className="branch-popover-item"
              style={s.branchNewItem}
              onClick={() => {
                setPickerOpen(false);
                setSearch("");
                setShowDialog(true);
              }}
            >
              <Plus size={12} strokeWidth={2.5} color="var(--accent)" style={s.flexShrinkIcon} />
              <span style={s.branchNewItemLabel}>{t("branch.newBranch")}</span>
            </button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {showDialog && (
        <BranchDialog
          projectRoot={projectRoot}
          repoPath={repoPath}
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
