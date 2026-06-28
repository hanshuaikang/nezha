import { useEffect, useMemo, useRef, useState } from "react";
import { PinOff, Search } from "lucide-react";
import type { Project } from "../../types";
import { ProjectAvatar } from "../ProjectAvatar";
import { useI18n } from "../../i18n";
import s from "../../styles";
import type { ProjectActivity } from "./activity";
import { getProjectActivity } from "./activity";
import { projectMatchesRailSearch } from "./search";
import { AttentionIndicator } from "./RailItem";

export function ProjectDrawer({
  projects,
  activityByProjectId,
  activeProjectId,
  showBadge,
  onSwitch,
  onClose,
}: {
  projects: Project[];
  activityByProjectId: Map<string, ProjectActivity>;
  activeProjectId: string;
  showBadge: boolean;
  onSwitch: (p: Project) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const drawerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => projectMatchesRailSearch(project, query));
  }, [projects, query]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={drawerRef}
      style={{
        position: "absolute",
        left: 52,
        top: 0,
        bottom: 0,
        width: 220,
        background: "var(--bg-panel)",
        borderRight: "1px solid var(--border-dim)",
        display: "flex",
        flexDirection: "column",
        zIndex: 50,
        boxShadow: "var(--shadow-drawer)",
      }}
    >
      <div
        style={{
          padding: "12px 12px 10px",
          borderBottom: "1px solid var(--border-dim)",
        }}
      >
        <div
          style={{
            margin: "0 2px 8px",
            fontSize: 11,
            fontWeight: 700,
            color: "var(--text-hint)",
            letterSpacing: 0.7,
            textTransform: "uppercase",
          }}
        >
          {t("welcome.projects")}
        </div>
        <div
          style={{
            ...s.panelSearchWrap,
            margin: 0,
          }}
        >
          <Search size={13} strokeWidth={2} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              if (query) {
                setQuery("");
              } else {
                onClose();
              }
            }}
            placeholder={t("welcome.searchProjects")}
            style={{ ...s.panelSearchInput, minWidth: 0 }}
          />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px 8px" }}>
        {filteredProjects.length === 0 && (
          <div
            style={{
              padding: "24px 10px",
              textAlign: "center",
              color: "var(--text-hint)",
              fontSize: 12,
            }}
          >
            {t("welcome.noMatchingProjects")}
          </div>
        )}
        {filteredProjects.map((project) => {
          const activity = getProjectActivity(activityByProjectId, project.id);
          const isActive = project.id === activeProjectId;
          return (
            <button
              key={project.id}
              onClick={() => {
                onSwitch(project);
                onClose();
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 8px",
                borderRadius: 8,
                border: "none",
                background: isActive ? "var(--accent-subtle)" : "none",
                cursor: isActive ? "default" : "pointer",
                textAlign: "left",
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => {
                if (!isActive)
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "none";
              }}
            >
              <div style={{ position: "relative", flexShrink: 0 }}>
                <ProjectAvatar name={project.name} size={28} />
                <AttentionIndicator
                  status={activity.status}
                  count={activity.attentionCount}
                  showBadge={showBadge}
                  borderColor="var(--bg-panel)"
                />
              </div>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? "var(--accent)" : "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {project.name}
              </span>
              {project.hiddenFromRail && (
                <PinOff
                  size={12}
                  strokeWidth={2}
                  color="var(--text-hint)"
                  style={s.railHiddenIcon}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
