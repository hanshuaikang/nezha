import { useState } from "react";
import { Settings, Moon, Sun } from "lucide-react";
import type { ThemeMode } from "../types";
import { AppSettingsDialog } from "./AppSettingsDialog";
import { NotificationBell } from "./NotificationBell";
import { ENABLE_USAGE_INSIGHTS } from "../platform";
import { UsagePopover } from "./UsagePopover";
import s from "../styles";

export function SidebarFooterActions({
  isDark,
  themeMode,
  systemPrefersDark,
  onThemeModeChange,
  onToggleTheme,
}: {
  isDark: boolean;
  themeMode: ThemeMode;
  systemPrefersDark: boolean;
  onThemeModeChange: (mode: ThemeMode) => void;
  onToggleTheme: () => void;
}) {
  const [showAppSettings, setShowAppSettings] = useState(false);

  return (
    <>
      <div style={s.sidebarFooterActions}>
        <NotificationBell />
        <button
          style={s.sidebarIconBtn}
          title="App Settings"
          onClick={() => setShowAppSettings(true)}
        >
          <Settings size={14} strokeWidth={1.6} color="var(--text-hint)" />
        </button>
        <button
          style={s.sidebarIconBtn}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
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
          onClose={() => setShowAppSettings(false)}
        />
      )}
    </>
  );
}
