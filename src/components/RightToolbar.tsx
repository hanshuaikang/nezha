import type { ReactNode } from "react";
import { IconButton } from "./IconButton";
import { Folder, Search, GitBranch, History, Settings, Terminal } from "lucide-react";
import { useI18n } from "../i18n";
import type { RightPanel } from "../hooks/useProjectPanels";

export function RightToolbar({
  activePanel,
  onToggle,
  terminalActive,
  onToggleTerminal,
  onOpenSearch,
  onOpenSettings,
}: {
  activePanel: RightPanel;
  onToggle: (panel: Exclude<RightPanel, null>) => void;
  terminalActive: boolean;
  onToggleTerminal: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
}) {
  const { t } = useI18n();
  const buttons: Array<{
    key: Exclude<RightPanel, null>;
    icon: ReactNode;
    title: string;
  }> = [
    { key: "files", icon: <Folder size={17} />, title: t("toolbar.fileExplorer") },
    { key: "git-changes", icon: <GitBranch size={17} />, title: t("toolbar.gitChanges") },
    { key: "git-history", icon: <History size={17} />, title: t("toolbar.gitHistory") },
  ];

  const footerItems = [
    { icon: <Settings size={17} />, title: t("settings.title"), disabled: false, onClick: onOpenSettings },
  ];

  return (
    <div
      style={{
        width: 44,
        flexShrink: 0,
        background: "var(--bg-sidebar)",
        borderLeft: "1px solid var(--border-dim)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 6,
        paddingBottom: 8,
        gap: 2,
        overflow: "hidden",
      }}
    >
      {buttons.map((btn) => (
        <IconButton
          key={btn.key}
          icon={btn.icon}
          title={btn.title}
          active={activePanel === btn.key}
          onClick={() => onToggle(btn.key)}
        />
      ))}

      <IconButton
        icon={<Terminal size={17} />}
        title={t("terminal.title")}
        active={terminalActive}
        onClick={onToggleTerminal}
      />

      <div style={{ width: 20, height: 1, background: "var(--border-dim)", margin: "4px 0" }} />

      <IconButton icon={<Search size={17} />} title={t("toolbar.search")} onClick={onOpenSearch} />

      <div style={{ flex: 1 }} />

      {footerItems.map((item, i) => (
        <IconButton
          key={i}
          icon={item.icon}
          title={item.title}
          disabled={item.disabled}
          onClick={item.onClick}
        />
      ))}
    </div>
  );
}
