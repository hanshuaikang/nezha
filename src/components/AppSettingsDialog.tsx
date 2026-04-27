import { useState } from "react";
import { X, Keyboard, Monitor } from "lucide-react";
import type { ThemeMode } from "../types";
import { useI18n } from "../i18n";
import s from "../styles";
import claudeLogo from "../assets/claude.svg";
import chatgptLogo from "../assets/chatgpt.svg";
import appLogo from "../assets/app-logo.png";
import { AboutPanel } from "./app-settings/AboutPanel";
import { AgentConfigPanel } from "./app-settings/AgentConfigPanel";
import { GeneralPanel } from "./app-settings/GeneralPanel";
import { ShortcutsPanel } from "./app-settings/ShortcutsPanel";
import { ThemePanel } from "./app-settings/ThemePanel";
import { getAgentSettingsFilePath } from "./app-settings/shared";
import type { AgentKey, AppSettingsNavItem, NavKey } from "./app-settings/types";

const NAV_ITEMS: AppSettingsNavItem[] = [
  { key: "general", labelKey: "appSettings.general" },
  { key: "theme", labelKey: "appSettings.theme" },
  { key: "shortcuts", labelKey: "appSettings.shortcuts" },
  { key: "about", labelKey: "appSettings.about", logo: appLogo },
  {
    key: "claude",
    labelKey: "Claude Code",
    logo: claudeLogo,
    filePath: getAgentSettingsFilePath("claude"),
    lang: "json",
  },
  {
    key: "codex",
    labelKey: "Codex",
    logo: chatgptLogo,
    filePath: getAgentSettingsFilePath("codex"),
    lang: "toml",
  },
];

export function AppSettingsDialog({
  onClose,
  isDark,
  themeMode,
  systemPrefersDark,
  onThemeModeChange,
}: {
  onClose: () => void;
  isDark: boolean;
  themeMode: ThemeMode;
  systemPrefersDark: boolean;
  onThemeModeChange: (mode: ThemeMode) => void;
}) {
  const { t } = useI18n();
  const [activeNav, setActiveNav] = useState<NavKey>("general");

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  const activeItem = NAV_ITEMS.find((n) => n.key === activeNav)!;
  const activeLabel = t(activeItem.labelKey);

  return (
    <div style={s.modalOverlay} onClick={handleOverlayClick}>
      <div style={s.modalBox}>
        <div style={s.settingsNav}>
          <div style={s.settingsNavTitle}>{t("appSettings.title")}</div>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              style={{
                ...s.settingsNavItem,
                background: activeNav === item.key ? "var(--bg-hover)" : "none",
                color: activeNav === item.key ? "var(--text-primary)" : "var(--text-secondary)",
                fontWeight: activeNav === item.key ? 600 : 500,
              }}
              onClick={() => setActiveNav(item.key)}
            >
              {item.logo ? (
                <img
                  src={item.logo}
                  style={{ width: 14, height: 14, opacity: item.key === "codex" ? 0.7 : 1 }}
                />
              ) : item.key === "theme" ? (
                <Monitor size={14} strokeWidth={1.8} />
              ) : item.key === "shortcuts" ? (
                <Keyboard size={14} strokeWidth={1.8} />
              ) : (
                <span
                  style={{
                    width: 14,
                    height: 14,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                  }}
                >
                  ⚙
                </span>
              )}
              {t(item.labelKey)}
            </button>
          ))}
        </div>

        <div style={s.settingsContent}>
          <div style={s.settingsContentHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {activeItem.logo ? (
                <img
                  src={activeItem.logo}
                  style={{ width: 16, height: 16, opacity: activeItem.key === "codex" ? 0.7 : 1 }}
                />
              ) : activeItem.key === "theme" ? (
                <Monitor size={16} strokeWidth={1.8} color="var(--text-secondary)" />
              ) : activeItem.key === "shortcuts" ? (
                <Keyboard size={16} strokeWidth={1.8} color="var(--text-secondary)" />
              ) : (
                <span style={{ fontSize: 15 }}>⚙</span>
              )}
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
