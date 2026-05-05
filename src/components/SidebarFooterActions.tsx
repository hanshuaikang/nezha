import { useState } from "react";
import { Settings, Moon, Sun } from "lucide-react";
import type { ThemeMode, TerminalFontSize, FontFamily } from "../types";
import { AppSettingsDialog } from "./AppSettingsDialog";
import { NotificationBell } from "./NotificationBell";
import { ENABLE_USAGE_INSIGHTS } from "../platform";
import { UsagePopover } from "./UsagePopover";
import { useI18n } from "../i18n";
import s from "../styles";

export function SidebarFooterActions({
  isDark,
  themeMode,
  systemPrefersDark,
  onThemeModeChange,
  onToggleTheme,
  terminalFontSize,
  onTerminalFontSizeChange,
  uiFontFamily,
  onUiFontFamilyChange,
  monoFontFamily,
  onMonoFontFamilyChange,
}: {
  isDark: boolean;
  themeMode: ThemeMode;
  systemPrefersDark: boolean;
  onThemeModeChange: (mode: ThemeMode) => void;
  onToggleTheme: () => void;
  terminalFontSize: TerminalFontSize;
  onTerminalFontSizeChange: (size: TerminalFontSize) => void;
  uiFontFamily: FontFamily;
  onUiFontFamilyChange: (family: FontFamily) => void;
  monoFontFamily: FontFamily;
  onMonoFontFamilyChange: (family: FontFamily) => void;
}) {
  const { t } = useI18n();
  const [showAppSettings, setShowAppSettings] = useState(false);

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
          isDark={isDark}
          themeMode={themeMode}
          systemPrefersDark={systemPrefersDark}
          onThemeModeChange={onThemeModeChange}
          terminalFontSize={terminalFontSize}
          onTerminalFontSizeChange={onTerminalFontSizeChange}
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
