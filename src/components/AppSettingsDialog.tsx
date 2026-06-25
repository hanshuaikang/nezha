import { Fragment, useState } from "react";
import {
  X,
  Keyboard,
  Monitor,
  Info,
  Settings as SettingsIcon,
  Type,
  Zap,
  Blocks,
  Heart,
  ExternalLink,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type {
  ThemeMode,
  ThemeVariant,
  TerminalFontSize,
  TerminalScrollback,
  TaskDisplayWindow,
  FontFamily,
} from "../types";
import { useI18n } from "../i18n";
import s from "../styles";
import claudeLogo from "../assets/claude.svg";
import chatgptLogo from "../assets/chatgpt.svg";
import wechatLogo from "../assets/wechat.png";

const WECHAT_GROUP_URL = "https://github.com/hanshuaikang/nezha/issues/66";
import { AboutPanel } from "./app-settings/AboutPanel";
import { ThanksPanel } from "./app-settings/ThanksPanel";
import { AgentConfigPanel } from "./app-settings/AgentConfigPanel";
import { GeneralPanel } from "./app-settings/GeneralPanel";
import { ShortcutsPanel } from "./app-settings/ShortcutsPanel";
import { ThemePanel } from "./app-settings/ThemePanel";
import { FontPanel } from "./app-settings/FontPanel";
import { HooksPanel } from "./app-settings/HooksPanel";
import { SkillsPanel } from "./app-settings/SkillsPanel";
import { getAgentSettingsFilePath } from "./app-settings/shared";
import type { AgentKey, AppSettingsNavItem, NavKey, NavSection } from "./app-settings/types";

const NAV_ITEMS: AppSettingsNavItem[] = [
  { key: "general", labelKey: "appSettings.general", section: "application", icon: SettingsIcon },
  { key: "theme", labelKey: "appSettings.theme", section: "application", icon: Monitor },
  { key: "fonts", labelKey: "appSettings.fonts", section: "application", icon: Type },
  { key: "shortcuts", labelKey: "appSettings.shortcuts", section: "application", icon: Keyboard },
  { key: "hooks", labelKey: "appSettings.hooks", section: "application", icon: Zap },
  { key: "skills", labelKey: "skill.settings.navLabel", section: "application", icon: Blocks },
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
  {
    key: "community",
    labelKey: "appSettings.community",
    section: "community",
    logo: wechatLogo,
    url: WECHAT_GROUP_URL,
  },
  { key: "about", labelKey: "appSettings.about", section: "about", icon: Info },
  {
    key: "thanks",
    labelKey: "appSettings.thanks",
    section: "about",
    icon: Heart,
    iconColor: "#ef4444",
    iconFill: "#ef4444",
  },
];

const SECTION_ORDER: NavSection[] = ["application", "agents", "community", "about"];

const SECTION_LABEL_KEY: Record<NavSection, string> = {
  application: "appSettings.section.application",
  agents: "appSettings.section.agents",
  community: "appSettings.section.community",
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
    return (
      <Icon
        size={size}
        strokeWidth={1.8}
        color={item.iconColor ?? "var(--text-secondary)"}
        fill={item.iconFill ?? "none"}
      />
    );
  }
  return null;
}

export function AppSettingsDialog({
  onClose,
  themeVariant,
  themeMode,
  systemPrefersDark,
  onThemeModeChange,
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
}: {
  onClose: () => void;
  themeVariant: ThemeVariant;
  themeMode: ThemeMode;
  systemPrefersDark: boolean;
  onThemeModeChange: (mode: ThemeMode) => void;
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
                    color: activeNav === item.key ? "var(--text-primary)" : "var(--text-secondary)",
                    fontWeight: activeNav === item.key ? 600 : 500,
                  }}
                  onClick={() => {
                    if (item.url) {
                      openUrl(item.url).catch(() => {});
                    } else {
                      setActiveNav(item.key);
                    }
                  }}
                >
                  <NavItemIcon item={item} size={14} />
                  {t(item.labelKey)}
                  {item.url ? <ExternalLink size={12} style={s.settingsNavExternalIcon} /> : null}
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
            <GeneralPanel
              key="general"
              taskDisplayWindow={taskDisplayWindow}
              onTaskDisplayWindowChange={onTaskDisplayWindowChange}
              attentionBadge={attentionBadge}
              onAttentionBadgeChange={onAttentionBadgeChange}
              terminalScrollback={terminalScrollback}
              onTerminalScrollbackChange={onTerminalScrollbackChange}
            />
          ) : activeNav === "theme" ? (
            <ThemePanel
              key="theme"
              themeMode={themeMode}
              systemPrefersDark={systemPrefersDark}
              onThemeModeChange={onThemeModeChange}
            />
          ) : activeNav === "fonts" ? (
            <FontPanel
              key="fonts"
              terminalFontSize={terminalFontSize}
              onTerminalFontSizeChange={onTerminalFontSizeChange}
              uiFontFamily={uiFontFamily}
              onUiFontFamilyChange={onUiFontFamilyChange}
              monoFontFamily={monoFontFamily}
              onMonoFontFamilyChange={onMonoFontFamilyChange}
            />
          ) : activeNav === "shortcuts" ? (
            <ShortcutsPanel key="shortcuts" />
          ) : activeNav === "hooks" ? (
            <HooksPanel key="hooks" />
          ) : activeNav === "skills" ? (
            <SkillsPanel key="skills" />
          ) : activeNav === "about" ? (
            <AboutPanel key="about" />
          ) : activeNav === "thanks" ? (
            <ThanksPanel key="thanks" />
          ) : (
            <AgentConfigPanel
              key={activeNav}
              agentKey={activeNav as AgentKey}
              filePath={activeItem.filePath!}
              lang={activeItem.lang!}
              themeVariant={themeVariant}
            />
          )}
        </div>
      </div>
    </div>
  );
}
