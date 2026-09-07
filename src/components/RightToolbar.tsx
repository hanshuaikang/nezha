import type { ReactNode } from "react";
import { IconButton } from "./IconButton";
import { Blocks, Folder, Search, GitBranch, History, Settings, Terminal } from "lucide-react";
import { useI18n } from "../i18n";
import type { RightPanel } from "../hooks/useProjectPanels";
import s from "../styles";

export function RightToolbar({
  activePanel,
  onToggle,
  terminalActive,
  onToggleTerminal,
  onOpenSearch,
  onOpenSettings,
  showSkillStore = true,
}: {
  activePanel: RightPanel;
  onToggle: (panel: Exclude<RightPanel, null>) => void;
  terminalActive: boolean;
  onToggleTerminal: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  /** 技能库项目自身不需要「安装到本项目」入口，隐藏该按钮 */
  showSkillStore?: boolean;
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
  if (showSkillStore) {
    buttons.push({ key: "skills", icon: <Blocks size={17} />, title: t("toolbar.skillStore") });
  }

  const footerItems = [
    { icon: <Settings size={17} />, title: t("settings.title"), disabled: false, onClick: onOpenSettings },
  ];

  return (
    <div style={s.rightToolbar}>
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

      <div style={s.rightToolbarDivider} />

      <IconButton icon={<Search size={17} />} title={t("toolbar.search")} onClick={onOpenSearch} />

      <div style={s.rightToolbarSpacer} />

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
