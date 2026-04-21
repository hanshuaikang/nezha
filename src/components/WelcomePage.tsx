import { useState, useMemo } from "react";
import { Search, FolderOpen, GitBranch, Layers, Plus, Trash2, BarChart2 } from "lucide-react";
import type { Project, ThemeMode } from "../types";
import { ENABLE_USAGE_INSIGHTS } from "../platform";
import { getAvatarGradient, shortenPath } from "../utils";
import { ProjectAvatar } from "./ProjectAvatar";
import { SidebarFooterActions } from "./SidebarFooterActions";
import { AnalyticsDashboard } from "./AnalyticsDashboard";
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

function WelcomeEmpty({ hasProjects, onOpen }: { hasProjects: boolean; onOpen: () => void }) {
  return (
    <div style={s.emptyState}>
      <div style={{ marginBottom: 14, opacity: 0.4 }}>
        <FolderOpen size={40} strokeWidth={1.2} color="var(--text-hint)" />
      </div>
      <div
        style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}
      >
        {hasProjects ? "No matching projects" : "No projects yet"}
      </div>
      {!hasProjects && (
        <>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 20 }}>
            Open a local Git repository to get started
          </div>
          <button style={s.emptyOpenBtn} onClick={onOpen}>
            <FolderOpen size={14} strokeWidth={2} />
            Open project folder...
          </button>
        </>
      )}
    </div>
  );
}

export function WelcomePage({
  projects,
  onOpen,
  onProjectClick,
  onDeleteProject,
  isDark,
  themeMode,
  systemPrefersDark,
  onThemeModeChange,
  onToggleTheme,
}: {
  projects: Project[];
  onOpen: () => void;
  onProjectClick: (p: Project) => void;
  onDeleteProject: (projectId: string) => void;
  isDark: boolean;
  themeMode: ThemeMode;
  systemPrefersDark: boolean;
  onThemeModeChange: (mode: ThemeMode) => void;
  onToggleTheme: () => void;
}) {
  const [query, setQuery] = useState("");
  const [hov, setHov] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [view, setView] = useState<"projects" | "analytics">("projects");

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
              <div style={s.sidebarBrandMeta}>Agent Workspace</div>
            </div>
          </div>

          <nav style={s.sidebarNav}>
            <div style={s.sidebarSectionTitle}>Workspace</div>
            <SidebarItem
              icon={<Layers size={15} />}
              label="Projects"
              active={view === "projects"}
              onClick={() => setView("projects")}
            />
            {ENABLE_USAGE_INSIGHTS ? (
              <SidebarItem
                icon={<BarChart2 size={15} />}
                label="Analytics"
                active={view === "analytics"}
                onClick={() => setView("analytics")}
              />
            ) : null}
          </nav>

          <div style={s.sidebarFooter}>
            <SidebarFooterActions
              isDark={isDark}
              themeMode={themeMode}
              systemPrefersDark={systemPrefersDark}
              onThemeModeChange={onThemeModeChange}
              onToggleTheme={onToggleTheme}
            />
          </div>
        </div>

        {ENABLE_USAGE_INSIGHTS && view === "analytics" ? (
          <AnalyticsDashboard projects={projects} />
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
                  placeholder="Search projects"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  autoFocus
                />
              </div>

              <div style={s.actionRow}>
                <button style={s.primaryActionBtn} onClick={onOpen}>
                  <Plus size={14} strokeWidth={2.3} />
                  <span>Open project</span>
                </button>
              </div>
            </div>

            <div style={s.projectSectionHeader}>
              <div>
                <div style={s.projectSectionTitle}>Projects</div>
                <div style={s.projectSectionCaption}>
                  {query.trim()
                    ? `${filtered.length} result${filtered.length !== 1 ? "s" : ""} found`
                    : `${projects.length} project${projects.length !== 1 ? "s" : ""}`}
                </div>
              </div>
            </div>

            <div style={s.projectList}>
              {filtered.length === 0 ? (
                <WelcomeEmpty hasProjects={projects.length > 0} onOpen={onOpen} />
              ) : (
                filtered.map((p) => {
                  const [from] = getAvatarGradient(p.name);
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
                    >
                      <ProjectAvatar
                        name={p.name}
                        size={34}
                        style={{ boxShadow: hov === p.id ? `0 10px 18px ${from}26` : "none" }}
                      />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={s.projectName}>{p.name}</div>
                        <div style={s.projectMeta}>{shortenPath(p.path)}</div>
                      </div>

                      {p.branch ? (
                        <span style={s.branchBadge}>
                          <GitBranch size={10} strokeWidth={2} />
                          {p.branch}
                        </span>
                      ) : (
                        <span style={s.projectTag}>LOCAL</span>
                      )}

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
                        title="Delete project"
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
    </div>
  );
}
