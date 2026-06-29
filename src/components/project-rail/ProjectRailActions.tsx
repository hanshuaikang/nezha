import { useState } from "react";
import { ChevronsRight, LayoutGrid, Plus } from "lucide-react";
import { useI18n } from "../../i18n";
import s from "../../styles";
import { OPEN_KANBAN_VIEW_EVENT } from "../KanbanView";

export function ProjectRailActions({
  drawerOpen,
  onToggleDrawer,
  onOpen,
}: {
  drawerOpen: boolean;
  onToggleDrawer: () => void;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const [addHov, setAddHov] = useState(false);
  const [expandHov, setExpandHov] = useState(false);
  const [kanbanHov, setKanbanHov] = useState(false);

  return (
    <>
      <button
        title={t("kanban.title")}
        onClick={() => window.dispatchEvent(new CustomEvent(OPEN_KANBAN_VIEW_EVENT))}
        onMouseEnter={() => setKanbanHov(true)}
        onMouseLeave={() => setKanbanHov(false)}
        style={{ ...s.railKanbanBtn, ...(kanbanHov ? s.railKanbanBtnHover : null) }}
      >
        <LayoutGrid size={14} strokeWidth={2.2} />
      </button>

      <button
        title={t("project.showAllProjects")}
        onClick={onToggleDrawer}
        onMouseEnter={() => setExpandHov(true)}
        onMouseLeave={() => setExpandHov(false)}
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: drawerOpen ? "var(--accent-subtle)" : expandHov ? "var(--bg-hover)" : "none",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
          color: drawerOpen
            ? "var(--accent)"
            : expandHov
              ? "var(--text-muted)"
              : "var(--text-hint)",
          transition: "background 0.12s, color 0.12s",
        }}
      >
        <ChevronsRight
          size={14}
          strokeWidth={2.5}
          style={{
            transform: drawerOpen ? "rotate(180deg)" : "none",
            transition: "transform 0.18s",
          }}
        />
      </button>

      <button
        title={t("welcome.openProject")}
        onClick={onOpen}
        onMouseEnter={() => setAddHov(true)}
        onMouseLeave={() => setAddHov(false)}
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: addHov ? "var(--bg-hover)" : "var(--bg-card)",
          border: "1px solid var(--border-medium)",
          borderRadius: 8,
          cursor: "pointer",
          color: addHov ? "var(--text-primary)" : "var(--text-muted)",
          transition: "background 0.12s, color 0.12s",
        }}
      >
        <Plus size={14} strokeWidth={2.5} />
      </button>
    </>
  );
}
