import { useEffect, useMemo, useRef, useState } from "react";
import { PinOff, Search } from "lucide-react";
import type { Project } from "../../types";
import { ProjectAvatar } from "../ProjectAvatar";
import { useI18n } from "../../i18n";
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
      const target = e.target as Node;
      if (!drawerRef.current || drawerRef.current.contains(target)) return;
      // 展开/收起按钮在抽屉外:mousedown 若在此处先 onClose,随后按钮 click 的
      // setDrawerOpen((v) => !v) 会把刚关掉的抽屉再次打开,表现为"收不起来"。
      // 点在该按钮上时跳过 outside-close,关闭交给按钮自己的 onClick。
      if (target instanceof Element && target.closest("[data-rail-drawer-toggle]")) return;
      onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div ref={drawerRef} className="rail-drawer">
      <div className="rail-drawer-header">
        <div className="rail-drawer-title">{t("welcome.projects")}</div>
        <div className="rail-drawer-search">
          <Search size={13} strokeWidth={2} className="rail-drawer-search-icon" />
          <input
            autoFocus
            className="rail-drawer-search-input"
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
          />
        </div>
      </div>
      <div className="rail-drawer-list">
        {filteredProjects.length === 0 && (
          <div className="rail-drawer-empty">{t("welcome.noMatchingProjects")}</div>
        )}
        {filteredProjects.map((project) => {
          const activity = getProjectActivity(activityByProjectId, project.id);
          const isActive = project.id === activeProjectId;
          return (
            <button
              key={project.id}
              className="rail-drawer-item"
              data-active={isActive}
              onClick={() => {
                onSwitch(project);
                onClose();
              }}
            >
              <div className="rail-drawer-item-avatar rail-indicator-host" data-surface="panel">
                <ProjectAvatar name={project.name} size={28} />
                <AttentionIndicator
                  status={activity.status}
                  count={activity.attentionCount}
                  showBadge={showBadge}
                />
              </div>
              <span className="rail-drawer-item-name">{project.name}</span>
              {project.hiddenFromRail && (
                <PinOff size={12} strokeWidth={2} className="rail-drawer-item-hidden" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
