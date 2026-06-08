import { useEffect, useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as RadixSelect from "@radix-ui/react-select";
import {
  Search,
  FolderOpen,
  GitBranch,
  Layers,
  Plus,
  Trash2,
  Clock,
  Blocks,
  Pin,
  PinOff,
  ChevronDown,
  Check,
  RefreshCw,
} from "lucide-react";
import type {
  Project,
  Task,
  ThemeMode,
  ThemeVariant,
  TerminalFontSize,
  TaskDisplayWindow,
  FontFamily,
  SkillHubConfig,
  WslDistroInfo,
  WslProjectValidation,
} from "../types";
import { getAvatarGradient, shortenPath } from "../utils";
import {
  getProjectDisplayPath,
  getProjectRuntimeLabel,
  getProjectRuntimeTitle,
} from "../projectRuntime";
import { ProjectAvatar } from "./ProjectAvatar";
import { SidebarFooterActions } from "./SidebarFooterActions";
import { OPEN_APP_SETTINGS_EVENT } from "./app-settings/types";
import { TimelineView } from "./TimelineView";
import { SkillHubView } from "./skill-hub/SkillHubView";
import { useI18n, pluralKey } from "../i18n";
import s from "../styles";

function SidebarItem({
  icon,
  label,
  active,
  meta,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  meta?: string;
  onClick?: () => void;
}) {
  return (
    <div
      style={{
        ...s.sidebarItem,
        background: active ? "var(--bg-selected)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-muted)",
      }}
      onClick={onClick}
    >
      <span style={{ display: "flex", alignItems: "center" }}>{icon}</span>
      <span style={{ marginLeft: 10, fontSize: 13, fontWeight: active ? 600 : 500 }}>{label}</span>
      {meta && <span style={s.sidebarItemMeta}>{meta}</span>}
    </div>
  );
}

function deriveLinuxProjectName(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  if (!trimmed) return path;
  const parts = trimmed.split("/");
  return parts[parts.length - 1] || path;
}

function RuntimeSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: WslDistroInfo[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.name === value);

  return (
    <RadixSelect.Root value={value} onValueChange={onChange} open={open} onOpenChange={setOpen}>
      <RadixSelect.Trigger aria-label="WSL distro" style={s.settingsSelectTrigger}>
        <RadixSelect.Value>
          {current ? `${current.name} - ${current.state} - WSL${current.version}` : value}
        </RadixSelect.Value>
        <RadixSelect.Icon asChild>
          <ChevronDown size={13} style={open ? s.settingsSelectIconOpen : s.settingsSelectIcon} />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content position="popper" sideOffset={4} style={s.settingsSelectContent}>
          <RadixSelect.Viewport style={s.settingsSelectViewport}>
            {options.map((option) => {
              const selected = option.name === value;
              return (
                <RadixSelect.Item
                  key={option.name}
                  value={option.name}
                  className="radix-select-item"
                  style={selected ? s.settingsSelectOptionSelected : s.settingsSelectOption}
                >
                  <RadixSelect.ItemText>
                    {option.name} - {option.state} - WSL{option.version}
                  </RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator style={s.settingsSelectIndicator}>
                    <Check size={13} style={s.settingsSelectCheck} />
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              );
            })}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

function WslProjectDialog({
  onCreate,
  onClose,
}: {
  onCreate: (project: Project) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [distros, setDistros] = useState<WslDistroInfo[]>([]);
  const [distro, setDistro] = useState("");
  const [linuxPath, setLinuxPath] = useState("");
  const [validation, setValidation] = useState<WslProjectValidation | null>(null);
  const [loadingDistros, setLoadingDistros] = useState(true);
  const [validating, setValidating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<WslDistroInfo[]>("wsl_list_distros")
      .then((items) => {
        setDistros(items);
        setDistro(items.find((item) => item.isDefault)?.name ?? items[0]?.name ?? "");
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingDistros(false));
  }, []);

  async function validateProjectPath(): Promise<WslProjectValidation | null> {
    if (!distro || !linuxPath.trim()) {
      setError(t("welcome.wslMissingInput"));
      return null;
    }
    setValidating(true);
    setError(null);
    setValidation(null);
    try {
      const result = await invoke<WslProjectValidation>("wsl_validate_project_path", {
        distro,
        linuxPath: linuxPath.trim(),
      });
      setValidation(result);
      if (result.error) setError(result.error);
      return result;
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setValidating(false);
    }
  }

  function validate() {
    void validateProjectPath();
  }

  async function createProject() {
    let result = validation;
    if (!result) {
      result = await validateProjectPath();
    }
    const canonicalPath = result?.canonicalPath || linuxPath.trim();
    if (!distro || !canonicalPath || !result?.exists || !result.writable) {
      setError(t("welcome.wslValidateBeforeCreate"));
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const uncPath = await invoke<string>("wsl_to_unc_path", { distro, linuxPath: canonicalPath });
      onCreate({
        id: `${Date.now()}`,
        name: deriveLinuxProjectName(canonicalPath),
        path: uncPath,
        lastOpenedAt: Date.now(),
        runtime: {
          kind: "wsl",
          distro,
          linuxPath: canonicalPath,
          uncPath,
          shell: "/bin/bash",
        },
      });
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={s.modalOverlay} onMouseDown={onClose}>
      <div
        style={{
          width: "min(520px, calc(100vw - 48px))",
          background: "var(--bg-card)",
          border: "1px solid var(--border-medium)",
          borderRadius: 12,
          boxShadow: "var(--shadow-popover)",
          padding: 20,
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
              {t("welcome.openWslProject")}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)" }}>
              {t("welcome.openWslProjectHint")}
            </div>
          </div>
          <button style={s.modalCloseBtn} onClick={onClose} aria-label={t("common.close")}>
            ×
          </button>
        </div>

        <div style={s.modalField}>
          <label style={s.modalLabel}>{t("welcome.wslDistro")}</label>
          {loadingDistros ? (
            <div style={{ fontSize: 13, color: "var(--text-hint)" }}>{t("welcome.wslLoadingDistros")}</div>
          ) : distros.length > 0 ? (
            <RuntimeSelect
              value={distro}
              options={distros}
              onChange={(value) => {
                setDistro(value);
                setValidation(null);
              }}
            />
          ) : (
            <input
              style={s.modalInput}
              value={distro}
              onChange={(event) => {
                setDistro(event.target.value);
                setValidation(null);
              }}
              placeholder="Ubuntu"
            />
          )}
        </div>

        <div style={s.modalField}>
          <label style={s.modalLabel}>{t("welcome.wslLinuxPath")}</label>
          <input
            style={s.modalInput}
            value={linuxPath}
            onChange={(event) => {
              setLinuxPath(event.target.value);
              setValidation(null);
            }}
            placeholder="/home/me/project"
          />
        </div>

        {validation && (
          <div
            style={{
              padding: "10px 12px",
              border: "1px solid var(--border-dim)",
              borderRadius: 8,
              background: "var(--bg-subtle)",
              fontSize: 12.5,
              color: "var(--text-secondary)",
              marginBottom: 12,
              lineHeight: 1.7,
            }}
          >
            <div>{validation.exists ? t("welcome.wslPathExists") : t("welcome.wslPathMissing")}</div>
            <div>{validation.writable ? t("welcome.wslPathWritable") : t("welcome.wslPathNotWritable")}</div>
            <div>{validation.gitDetected ? t("welcome.wslGitDetected") : t("welcome.wslGitMissing")}</div>
            {validation.canonicalPath && <div>{validation.canonicalPath}</div>}
          </div>
        )}

        {error && (
          <div style={{ color: "var(--danger)", fontSize: 12.5, marginBottom: 12 }}>{error}</div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button style={s.modalCancelBtn} onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button style={s.modalCancelBtn} onClick={validate} disabled={validating || loadingDistros}>
            <RefreshCw size={13} strokeWidth={2} />
            {validating ? t("welcome.wslValidating") : t("welcome.wslValidate")}
          </button>
          <button style={s.modalSaveBtn} onClick={createProject} disabled={validating || creating || loadingDistros}>
            {creating ? t("welcome.wslCreating") : t("welcome.wslCreateProject")}
          </button>
        </div>
      </div>
    </div>
  );
}

function WelcomeEmpty({ hasProjects, onOpen }: { hasProjects: boolean; onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <div style={s.emptyState}>
      <div style={{ marginBottom: 14, opacity: 0.4 }}>
        <FolderOpen size={40} strokeWidth={1.2} color="var(--text-hint)" />
      </div>
      <div
        style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}
      >
        {hasProjects ? t("welcome.noMatchingProjects") : t("welcome.noProjectsYet")}
      </div>
      {!hasProjects && (
        <>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 20 }}>
            {t("welcome.openLocalRepo")}
          </div>
          <button style={s.emptyOpenBtn} onClick={onOpen}>
            <FolderOpen size={14} strokeWidth={2} />
            {t("welcome.openProjectFolder")}
          </button>
        </>
      )}
    </div>
  );
}

export function WelcomePage({
  projects,
  allProjects,
  tasks,
  onOpen,
  onOpenWslProject,
  onProjectClick,
  onDeleteProject,
  onToggleProjectHidden,
  themeVariant,
  themeMode,
  systemPrefersDark,
  onThemeModeChange,
  onToggleTheme,
  terminalFontSize,
  onTerminalFontSizeChange,
  taskDisplayWindow,
  onTaskDisplayWindowChange,
  attentionBadge,
  onAttentionBadgeChange,
  uiFontFamily,
  onUiFontFamilyChange,
  monoFontFamily,
  onMonoFontFamilyChange,
  skillHubConfig,
  onEnterSkillHub,
}: {
  projects: Project[];
  allProjects: Project[];
  tasks: Task[];
  onOpen: () => void;
  onOpenWslProject: (project: Project) => void;
  onProjectClick: (p: Project) => void;
  onDeleteProject: (projectId: string) => void;
  onToggleProjectHidden: (projectId: string) => void;
  themeVariant: ThemeVariant;
  themeMode: ThemeMode;
  systemPrefersDark: boolean;
  onThemeModeChange: (mode: ThemeMode) => void;
  onToggleTheme: () => void;
  terminalFontSize: TerminalFontSize;
  onTerminalFontSizeChange: (size: TerminalFontSize) => void;
  taskDisplayWindow: TaskDisplayWindow;
  onTaskDisplayWindowChange: (window: TaskDisplayWindow) => void;
  attentionBadge: boolean;
  onAttentionBadgeChange: (enabled: boolean) => void;
  uiFontFamily: FontFamily;
  onUiFontFamilyChange: (family: FontFamily) => void;
  monoFontFamily: FontFamily;
  onMonoFontFamilyChange: (family: FontFamily) => void;
  skillHubConfig: SkillHubConfig | null;
  onEnterSkillHub: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [hov, setHov] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [view, setView] = useState<"projects" | "timeline" | "skills">("projects");
  const [showWslDialog, setShowWslDialog] = useState(false);

  const filtered = useMemo(() => {
    if (!query.trim()) return projects;
    const q = query.toLowerCase();
    return projects.filter((p) => {
      const displayPath = getProjectDisplayPath(p);
      const runtimeLabel = getProjectRuntimeLabel(p);
      return [p.name, p.path, displayPath, runtimeLabel].some((value) =>
        value.toLowerCase().includes(q),
      );
    });
  }, [projects, query]);

  return (
    <div style={s.welcomeBody}>
      <div style={s.welcomeMain}>
        <div style={s.sidebar}>
          <div style={s.sidebarBrand}>
            <div style={s.sidebarBrandIcon}>
              <span style={s.sidebarBrandBadge}>NZ</span>
            </div>
            <div>
              <div style={s.sidebarBrandTitle}>Nezha</div>
              <div style={s.sidebarBrandMeta}>{t("welcome.agentWorkspace")}</div>
            </div>
          </div>

          <nav style={s.sidebarNav}>
            <div style={s.sidebarSectionTitle}>{t("welcome.workspace")}</div>
            <SidebarItem
              icon={<Layers size={15} />}
              label={t("welcome.projects")}
              active={view === "projects"}
              onClick={() => setView("projects")}
            />
            <SidebarItem
              icon={<Clock size={15} />}
              label={t("welcome.timeline")}
              active={view === "timeline"}
              onClick={() => setView("timeline")}
            />
            <SidebarItem
              icon={<Blocks size={15} />}
              label={t("welcome.skillHub")}
              active={view === "skills"}
              onClick={() => setView("skills")}
            />
          </nav>

          <div style={s.sidebarFooter}>
            <SidebarFooterActions
              themeVariant={themeVariant}
              themeMode={themeMode}
              systemPrefersDark={systemPrefersDark}
              onThemeModeChange={onThemeModeChange}
              onToggleTheme={onToggleTheme}
              terminalFontSize={terminalFontSize}
              onTerminalFontSizeChange={onTerminalFontSizeChange}
              taskDisplayWindow={taskDisplayWindow}
              onTaskDisplayWindowChange={onTaskDisplayWindowChange}
              attentionBadge={attentionBadge}
              onAttentionBadgeChange={onAttentionBadgeChange}
              uiFontFamily={uiFontFamily}
              onUiFontFamilyChange={onUiFontFamilyChange}
              monoFontFamily={monoFontFamily}
              onMonoFontFamilyChange={onMonoFontFamilyChange}
            />
          </div>
        </div>

        {view === "timeline" ? (
          <TimelineView
            projects={allProjects}
            tasks={tasks}
            onTaskClick={(task) => {
              if (task.projectId === skillHubConfig?.hubProjectId) {
                onEnterSkillHub();
                return;
              }
              const project = allProjects.find((p) => p.id === task.projectId);
              if (project) onProjectClick(project);
            }}
          />
        ) : view === "skills" ? (
          <SkillHubView
            config={skillHubConfig}
            allProjects={projects}
            onEnterSkillHub={onEnterSkillHub}
            onOpenAppSettings={() =>
              window.dispatchEvent(new CustomEvent(OPEN_APP_SETTINGS_EVENT))
            }
          />
        ) : (
          <div style={s.welcomePane}>
            <div style={s.searchRow}>
              <div
                style={{
                  ...s.searchBox,
                  borderColor: searchFocused ? "var(--border-focus)" : "var(--border-medium)",
                  boxShadow: searchFocused ? "0 0 0 3px var(--accent-subtle)" : "none",
                }}
              >
                <Search
                  size={15}
                  strokeWidth={1.9}
                  color="var(--text-muted)"
                  style={{ flexShrink: 0 }}
                />
                <input
                  style={s.searchInput}
                  placeholder={t("welcome.searchProjects")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  autoFocus
                />
              </div>

              <div style={s.actionRow}>
                <button style={s.primaryActionBtn} onClick={() => setShowWslDialog(true)}>
                  <FolderOpen size={14} strokeWidth={2.3} />
                  <span>{t("welcome.openWslProject")}</span>
                </button>
                <button style={s.primaryActionBtn} onClick={onOpen}>
                  <Plus size={14} strokeWidth={2.3} />
                  <span>{t("welcome.openLocalProject")}</span>
                </button>
              </div>
            </div>

            <div style={s.projectSectionHeader}>
              <div>
                <div style={s.projectSectionTitle}>{t("welcome.projects")}</div>
                <div style={s.projectSectionCaption}>
                  {query.trim()
                    ? t(pluralKey("welcome.resultCount", "welcome.resultCountPlural", filtered.length), {
                        count: filtered.length,
                      })
                    : t(pluralKey("welcome.projectCount", "welcome.projectCountPlural", projects.length), {
                        count: projects.length,
                      })}
                </div>
              </div>
            </div>

            <div style={s.projectList}>
              {filtered.length === 0 ? (
                <WelcomeEmpty hasProjects={projects.length > 0} onOpen={onOpen} />
              ) : (
                filtered.map((p) => {
                  const [from] = getAvatarGradient(p.name);
                  const displayPath = getProjectDisplayPath(p);
                  const runtimeLabel = getProjectRuntimeLabel(p);
                  return (
                    <button
                      key={p.id}
                      style={{
                        ...s.projectItem,
                        background: hov === p.id ? "var(--bg-hover)" : "transparent",
                        borderColor: hov === p.id ? "var(--border-medium)" : "transparent",
                      }}
                      onMouseEnter={() => setHov(p.id)}
                      onMouseLeave={() => setHov(null)}
                      onClick={() => onProjectClick(p)}
                      title={getProjectRuntimeTitle(p)}
                    >
                      <ProjectAvatar
                        name={p.name}
                        size={34}
                        style={{ boxShadow: hov === p.id ? `0 10px 18px ${from}26` : "none" }}
                      />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={s.projectName}>{p.name}</div>
                        <div style={{ ...s.projectMeta, marginTop: 3 }}>{runtimeLabel}</div>
                        <div style={s.projectMeta}>{shortenPath(displayPath)}</div>
                      </div>

                      {p.branch ? (
                        <span style={s.branchBadge}>
                          <GitBranch size={10} strokeWidth={2} />
                          {p.branch}
                        </span>
                      ) : (
                        <span style={s.projectTag}>{runtimeLabel}</span>
                      )}

                      <span
                        role="button"
                        tabIndex={0}
                        style={{
                          ...s.projectPinBtn,
                          ...(p.hiddenFromRail
                            ? s.projectPinBtnHidden
                            : s.projectPinBtnPinned),
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleProjectHidden(p.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          e.preventDefault();
                          e.stopPropagation();
                          onToggleProjectHidden(p.id);
                        }}
                        title={
                          p.hiddenFromRail
                            ? t("welcome.pinToRail")
                            : t("welcome.unpinFromRail")
                        }
                      >
                        {p.hiddenFromRail ? (
                          <PinOff size={11} strokeWidth={2} />
                        ) : (
                          <Pin size={11} strokeWidth={2} />
                        )}
                        {p.hiddenFromRail
                          ? t("welcome.notPinnedToRail")
                          : t("welcome.pinnedToRail")}
                      </span>

                      <button
                        style={{
                          marginLeft: 8,
                          padding: "4px 6px",
                          background: "transparent",
                          border: "none",
                          borderRadius: 6,
                          cursor: "pointer",
                          color: "var(--text-muted)",
                          display: "flex",
                          alignItems: "center",
                          opacity: hov === p.id ? 1 : 0,
                          transition: "opacity 0.15s, color 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.color =
                            "var(--danger)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteProject(p.id);
                        }}
                        title={t("welcome.deleteProject")}
                      >
                        <Trash2 size={14} strokeWidth={1.8} />
                      </button>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
      {showWslDialog && (
        <WslProjectDialog
          onCreate={onOpenWslProject}
          onClose={() => setShowWslDialog(false)}
        />
      )}
    </div>
  );
}
