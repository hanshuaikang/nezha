import { useState } from "react";
import { ChevronsRight, LayoutGrid, Plus } from "lucide-react";
import { useI18n } from "../../i18n";
import { APP_PLATFORM } from "../../platform";
import { getKanbanShortcutLabel } from "../../shortcuts";
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
        title={`${t("kanban.title")} (${getKanbanShortcutLabel(APP_PLATFORM)})`}
        onClick={() => window.dispatchEvent(new CustomEvent(OPEN_KANBAN_VIEW_EVENT))}
        onMouseEnter={() => setKanbanHov(true)}
        onMouseLeave={() => setKanbanHov(false)}
        style={kanbanHov ? s.railKanbanBtnHover : s.railKanbanBtn}
      >
        <LayoutGrid size={14} strokeWidth={2.2} />
      </button>

      <button
        title={t("project.showAllProjects")}
        onClick={onToggleDrawer}
        onMouseEnter={() => setExpandHov(true)}
        onMouseLeave={() => setExpandHov(false)}
        style={
          drawerOpen
            ? s.railExpandBtnOpen
            : expandHov
              ? s.railExpandBtnHover
              : s.railExpandBtn
        }
      >
        <ChevronsRight
          size={14}
          strokeWidth={2.5}
          style={drawerOpen ? s.railExpandIconOpen : s.railExpandIcon}
        />
      </button>

      <button
        title={t("welcome.openProject")}
        onClick={onOpen}
        onMouseEnter={() => setAddHov(true)}
        onMouseLeave={() => setAddHov(false)}
        style={addHov ? s.railAddBtnHover : s.railAddBtn}
      >
        <Plus size={14} strokeWidth={2.5} />
      </button>
    </>
  );
}
