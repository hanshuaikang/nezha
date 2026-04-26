import type { ReactNode } from "react";
import { IconButton } from "./IconButton";
import { Folder, Search, GitBranch, History, Settings, Terminal } from "lucide-react";
import { useI18n } from "../i18n";

export function RightToolbar({
  activePanel,
  onToggle,
  terminalActive,
  onToggleTerminal,
  onOpenSettings,
}: {
  activePanel: "files" | "git-changes" | "git-history" | null;
  onToggle: (panel: "files" | "git-changes" | "git-history") => void;
  terminalActive: boolean;
  onToggleTerminal: () => void;
  onOpenSettings: () => void;
}) {
  const { t } = useI18n();
  const buttons: Array<{
    key: "files" | "git-changes" | "git-history";
    icon: ReactNode;
    title: string;
  }> = [
    { key: "files", icon: <Folder size={17} />, title: t("toolbar.fileExplorer") },
    { key: "git-changes", icon: <GitBranch size={17} />, title: t("toolbar.gitChanges") },
    { key: "git-history", icon: <History size={17} />, title: t("toolbar.gitHistory") },
  ];

  const placeholders = [{ icon: <Search size={17} />, title: t("toolbar.searchComingSoon") }];

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

      {placeholders.map((p, i) => (
        <IconButton key={i} icon={p.icon} title={p.title} disabled />
      ))}

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
