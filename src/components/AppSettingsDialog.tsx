import { Fragment, useState } from "react";
import { X, Keyboard, Monitor, Info, Settings as SettingsIcon } from "lucide-react";
import type { ThemeMode, TerminalFontSize } from "../types";
import { useI18n } from "../i18n";
import s from "../styles";
import claudeLogo from "../assets/claude.svg";
import chatgptLogo from "../assets/chatgpt.svg";
import { AboutPanel } from "./app-settings/AboutPanel";
import { AgentConfigPanel } from "./app-settings/AgentConfigPanel";
import { GeneralPanel } from "./app-settings/GeneralPanel";
import { ShortcutsPanel } from "./app-settings/ShortcutsPanel";
import { ThemePanel } from "./app-settings/ThemePanel";
import { getAgentSettingsFilePath } from "./app-settings/shared";
import type {
  AgentKey,
  AppSettingsNavItem,
  NavKey,
  NavSection,
} from "./app-settings/types";

const NAV_ITEMS: AppSettingsNavItem[] = [
  { key: "general", labelKey: "appSettings.general", section: "application", icon: SettingsIcon },
  { key: "theme", labelKey: "appSettings.theme", section: "application", icon: Monitor },
  { key: "shortcuts", labelKey: "appSettings.shortcuts", section: "application", icon: Keyboard },
  {
    key: "claude",
    labelKey: "Claude Code",
    section: "agents",
    logo: claudeLogo,
    filePath: getAgentSettingsFilePath("claude"),
    lang: "json",
  },
  {
    key: "codex",
    labelKey: "Codex",
    section: "agents",
    logo: chatgptLogo,
    filePath: getAgentSettingsFilePath("codex"),
    lang: "toml",
  },
  { key: "about", labelKey: "appSettings.about", section: "about", icon: Info },
];

const SECTION_ORDER: NavSection[] = ["application", "agents", "about"];

const SECTION_LABEL_KEY: Record<NavSection, string> = {
  application: "appSettings.section.application",
  agents: "appSettings.section.agents",
  about: "appSettings.section.about",
};

function NavItemIcon({ item, size }: { item: AppSettingsNavItem; size: number }) {
  if (item.logo) {
    return (
      <img
        src={item.logo}
        style={{ width: size, height: size, opacity: item.key === "codex" ? 0.7 : 1 }}
      />
    );
  }
  if (item.icon) {
    const Icon = item.icon;
    return <Icon size={size} strokeWidth={1.8} color="var(--text-secondary)" />;
  }
  return null;
}

export function AppSettingsDialog({
  onClose,
  isDark,
  themeMode,
  systemPrefersDark,
  onThemeModeChange,
  terminalFontSize,
  onTerminalFontSizeChange,
}: {
  onClose: () => void;
  isDark: boolean;
  themeMode: ThemeMode;
  systemPrefersDark: boolean;
  onThemeModeChange: (mode: ThemeMode) => void;
  terminalFontSize: TerminalFontSize;
  onTerminalFontSizeChange: (size: TerminalFontSize) => void;
}) {
  const { t } = useI18n();
  const [activeNav, setActiveNav] = useState<NavKey>("general");

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  const activeItem = NAV_ITEMS.find((n) => n.key === activeNav)!;
  const activeLabel = t(activeItem.labelKey);

  const sectionGroups = SECTION_ORDER.map((section) => ({
    section,
    items: NAV_ITEMS.filter((item) => item.section === section),
  })).filter((group) => group.items.length > 0);

  return (
    <div style={s.modalOverlay} onClick={handleOverlayClick}>
      <div style={s.modalBox}>
        <div style={s.settingsNav}>
          <div style={s.settingsNavTitle}>{t("appSettings.title")}</div>
          {sectionGroups.map((group, groupIndex) => (
            <Fragment key={group.section}>
              <div
                style={{
                  ...s.settingsNavSectionLabel,
                  ...(groupIndex === 0 ? s.settingsNavSectionLabelFirst : null),
                }}
              >
                {t(SECTION_LABEL_KEY[group.section])}
              </div>
              {group.items.map((item) => (
                <button
                  key={item.key}
                  style={{
                    ...s.settingsNavItem,
                    background: activeNav === item.key ? "var(--bg-hover)" : "none",
                    color:
                      activeNav === item.key ? "var(--text-primary)" : "var(--text-secondary)",
                    fontWeight: activeNav === item.key ? 600 : 500,
                  }}
                  onClick={() => setActiveNav(item.key)}
                >
                  <NavItemIcon item={item} size={14} />
                  {t(item.labelKey)}
                </button>
              ))}
            </Fragment>
          ))}
        </div>

        <div style={s.settingsContent}>
          <div style={s.settingsContentHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <NavItemIcon item={activeItem} size={16} />
              <span style={s.settingsContentTitle}>{activeLabel}</span>
            </div>
            <button style={s.modalCloseBtn} onClick={onClose} title={t("common.close")}>
              <X size={16} strokeWidth={2} />
            </button>
          </div>

          {activeNav === "general" ? (
            <GeneralPanel key="general" />
          ) : activeNav === "theme" ? (
            <ThemePanel
              key="theme"
              themeMode={themeMode}
              systemPrefersDark={systemPrefersDark}
              onThemeModeChange={onThemeModeChange}
              terminalFontSize={terminalFontSize}
              onTerminalFontSizeChange={onTerminalFontSizeChange}
            />
          ) : activeNav === "shortcuts" ? (
            <ShortcutsPanel key="shortcuts" />
          ) : activeNav === "about" ? (
            <AboutPanel key="about" />
          ) : (
            <AgentConfigPanel
              key={activeNav}
              agentKey={activeNav as AgentKey}
              filePath={activeItem.filePath!}
              lang={activeItem.lang!}
              isDark={isDark}
            />
          )}
        </div>
      </div>
    </div>
  );
}
