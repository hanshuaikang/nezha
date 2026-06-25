import { useEffect, useState } from "react";
import { Settings, Moon, Sun } from "lucide-react";
import type {
  ThemeMode,
  ThemeVariant,
  TerminalFontSize,
  TerminalScrollback,
  TaskDisplayWindow,
  FontFamily,
} from "../types";
import { AppSettingsDialog } from "./AppSettingsDialog";
import { OPEN_APP_SETTINGS_EVENT } from "./app-settings/types";
import { NotificationBell } from "./NotificationBell";
import { ENABLE_USAGE_INSIGHTS } from "../platform";
import { UsagePopover } from "./UsagePopover";
import { useI18n } from "../i18n";
import s from "../styles";

export function SidebarFooterActions({
  themeVariant,
  themeMode,
  systemPrefersDark,
  onThemeModeChange,
  onToggleTheme,
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
  themeVariant: ThemeVariant;
  themeMode: ThemeMode;
  systemPrefersDark: boolean;
  onThemeModeChange: (mode: ThemeMode) => void;
  onToggleTheme: () => void;
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
  const [showAppSettings, setShowAppSettings] = useState(false);
  const isDark = themeVariant === "dark" || themeVariant === "midnight";

  useEffect(() => {
    const open = () => setShowAppSettings(true);
    window.addEventListener(OPEN_APP_SETTINGS_EVENT, open);
    return () => window.removeEventListener(OPEN_APP_SETTINGS_EVENT, open);
  }, []);

  return (
    <>
      <div style={s.sidebarFooterActions}>
        <NotificationBell />
        <button
          style={s.sidebarIconBtn}
          title={t("appSettings.title")}
          onClick={() => setShowAppSettings(true)}
        >
          <Settings size={14} strokeWidth={1.6} color="var(--text-hint)" />
        </button>
        <button
          style={s.sidebarIconBtn}
          title={isDark ? t("theme.switchToLight") : t("theme.switchToDark")}
          onClick={onToggleTheme}
        >
          {isDark ? (
            <Sun size={14} strokeWidth={1.8} color="var(--text-hint)" />
          ) : (
            <Moon size={14} strokeWidth={1.8} color="var(--text-hint)" />
          )}
        </button>
        {ENABLE_USAGE_INSIGHTS ? <UsagePopover /> : null}
      </div>

      {showAppSettings && (
        <AppSettingsDialog
          themeVariant={themeVariant}
          themeMode={themeMode}
          systemPrefersDark={systemPrefersDark}
          onThemeModeChange={onThemeModeChange}
          terminalFontSize={terminalFontSize}
          onTerminalFontSizeChange={onTerminalFontSizeChange}
          taskDisplayWindow={taskDisplayWindow}
          onTaskDisplayWindowChange={onTaskDisplayWindowChange}
          attentionBadge={attentionBadge}
          onAttentionBadgeChange={onAttentionBadgeChange}
          terminalScrollback={terminalScrollback}
          onTerminalScrollbackChange={onTerminalScrollbackChange}
          uiFontFamily={uiFontFamily}
          onUiFontFamilyChange={onUiFontFamilyChange}
          monoFontFamily={monoFontFamily}
          onMonoFontFamilyChange={onMonoFontFamilyChange}
          onClose={() => setShowAppSettings(false)}
        />
      )}
    </>
  );
}
