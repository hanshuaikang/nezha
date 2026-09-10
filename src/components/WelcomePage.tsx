import { useState, useMemo } from "react";
import { Search, FolderOpen, Layers, Plus, Clock, Blocks } from "lucide-react";
import type {
  Project,
  Task,
  ThemeMode,
  ThemeVariant,
  TerminalFontSize,
  TerminalScrollback,
  TaskDisplayWindow,
  FontFamily,
  SkillHubConfig,
  ProjectAvatarStyle,
} from "../types";
import type { ProjectRenameResult } from "../projectName";
import { SidebarFooterActions } from "./SidebarFooterActions";
import { OPEN_APP_SETTINGS_EVENT } from "./app-settings/types";
import { TimelineView } from "./TimelineView";
import { SkillHubView } from "./skill-hub/SkillHubView";
import { ProjectListItem } from "./welcome/ProjectListItem";
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
    <button
      type="button"
      className="welcome-sidebar-item"
      data-active={Boolean(active)}
      onClick={onClick}
    >
      <span className="welcome-sidebar-item-icon">{icon}</span>
      <span className="welcome-sidebar-item-label">{label}</span>
      {meta && <span style={s.sidebarItemMeta}>{meta}</span>}
    </button>
  );
}

function WelcomeEmpty({ hasProjects, onOpen }: { hasProjects: boolean; onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <div style={s.emptyState}>
      <div className="welcome-empty-icon">
        <FolderOpen size={40} strokeWidth={1.2} color="var(--text-hint)" />
      </div>
      <div className="welcome-empty-title">
        {hasProjects ? t("welcome.noMatchingProjects") : t("welcome.noProjectsYet")}
      </div>
      {!hasProjects && (
        <>
          <div className="welcome-empty-description">{t("welcome.openLocalRepo")}</div>
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
  onProjectClick,
  onDeleteProject,
  onToggleProjectHidden,
  onRenameProject,
  onUpdateProjectAvatar,
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
  terminalScrollback,
  onTerminalScrollbackChange,
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
  onProjectClick: (p: Project) => void;
  onDeleteProject: (projectId: string) => void;
  onToggleProjectHidden: (projectId: string) => void;
  onRenameProject: (projectId: string, name: string) => Promise<ProjectRenameResult>;
  onUpdateProjectAvatar: (projectId: string, avatar: ProjectAvatarStyle | undefined) => void;
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
  terminalScrollback: TerminalScrollback;
  onTerminalScrollbackChange: (value: TerminalScrollback) => void;
  uiFontFamily: FontFamily;
  onUiFontFamilyChange: (family: FontFamily) => void;
  monoFontFamily: FontFamily;
  onMonoFontFamilyChange: (family: FontFamily) => void;
  skillHubConfig: SkillHubConfig | null;
  onEnterSkillHub: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"projects" | "timeline" | "skills">("projects");

  const filtered = useMemo(() => {
    if (!query.trim()) return projects;
    const q = query.toLowerCase();
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q),
    );
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
              terminalScrollback={terminalScrollback}
              onTerminalScrollbackChange={onTerminalScrollbackChange}
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
            onOpenAppSettings={() => window.dispatchEvent(new CustomEvent(OPEN_APP_SETTINGS_EVENT))}
          />
        ) : (
          <div style={s.welcomePane}>
            <div style={s.searchRow}>
              <div className="welcome-search-box">
                <Search
                  size={15}
                  strokeWidth={1.9}
                  color="var(--text-muted)"
                  className="welcome-search-icon"
                />
                <input
                  style={s.searchInput}
                  placeholder={t("welcome.searchProjects")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
              </div>

              <div style={s.actionRow}>
                <button style={s.primaryActionBtn} onClick={onOpen}>
                  <Plus size={14} strokeWidth={2.3} />
                  <span>{t("welcome.openProject")}</span>
                </button>
              </div>
            </div>

            <div style={s.projectSectionHeader}>
              <div>
                <div style={s.projectSectionTitle}>{t("welcome.projects")}</div>
                <div style={s.projectSectionCaption}>
                  {query.trim()
                    ? t(
                        pluralKey(
                          "welcome.resultCount",
                          "welcome.resultCountPlural",
                          filtered.length,
                        ),
                        {
                          count: filtered.length,
                        },
                      )
                    : t(
                        pluralKey(
                          "welcome.projectCount",
                          "welcome.projectCountPlural",
                          projects.length,
                        ),
                        {
                          count: projects.length,
                        },
                      )}
                </div>
              </div>
            </div>

            <div style={s.projectList}>
              {filtered.length === 0 ? (
                <WelcomeEmpty hasProjects={projects.length > 0} onOpen={onOpen} />
              ) : (
                filtered.map((project) => (
                  <ProjectListItem
                    key={project.id}
                    project={project}
                    onOpen={() => onProjectClick(project)}
                    onDelete={() => onDeleteProject(project.id)}
                    onToggleHidden={() => onToggleProjectHidden(project.id)}
                    onRename={(name) => onRenameProject(project.id, name)}
                    onUpdateAvatar={(avatar) => onUpdateProjectAvatar(project.id, avatar)}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
