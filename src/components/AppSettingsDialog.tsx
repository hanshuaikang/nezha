import { useState } from "react";
import { Info, Settings, UserCog, X } from "lucide-react";
import type { ThemeMode } from "../types";
import { useI18n } from "../i18n";
import s from "../styles";
import { AboutPanel } from "./app-settings/AboutPanel";
import { AgentSettingsPanel } from "./app-settings/AgentSettingsPanel";
import { ApplicationSettingsPanel } from "./app-settings/ApplicationSettingsPanel";
import { APP_SETTINGS_NAV_ITEMS } from "./app-settings/navigation";
import type { NavKey } from "./app-settings/types";

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
  const [activeNav, setActiveNav] = useState<NavKey>("app");

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  const activeItem = APP_SETTINGS_NAV_ITEMS.find((n) => n.key === activeNav)!;
  const activeLabel = t(activeItem.labelKey);

  function renderNavIcon(key: NavKey, size: number, color?: string) {
    if (key === "agents") {
      return <UserCog size={size} strokeWidth={1.8} color={color} />;
    }
    if (key === "about") {
      return <Info size={size} strokeWidth={1.8} color={color} />;
    }
    return <Settings size={size} strokeWidth={1.8} color={color} />;
  }

  return (
    <div style={s.modalOverlay} onClick={handleOverlayClick}>
      <div style={s.modalBox}>
        <div style={s.settingsNav}>
          <div style={s.settingsNavTitle}>{t("appSettings.title")}</div>
          {APP_SETTINGS_NAV_ITEMS.map((item) => (
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
              {renderNavIcon(item.key, 14)}
              {t(item.labelKey)}
            </button>
          ))}
        </div>

        <div style={s.settingsContent}>
          <div style={s.settingsContentHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {renderNavIcon(activeItem.key, 16, "var(--text-secondary)")}
              <span style={s.settingsContentTitle}>{activeLabel}</span>
            </div>
            <button style={s.modalCloseBtn} onClick={onClose} title={t("common.close")}>
              <X size={16} strokeWidth={2} />
            </button>
          </div>

          {activeNav === "app" ? (
            <ApplicationSettingsPanel
              key="app"
              themeMode={themeMode}
              systemPrefersDark={systemPrefersDark}
              onThemeModeChange={onThemeModeChange}
            />
          ) : activeNav === "agents" ? (
            <AgentSettingsPanel key="agents" isDark={isDark} />
          ) : activeNav === "about" ? (
            <AboutPanel key="about" />
          ) : null}
        </div>
      </div>
    </div>
  );
}
