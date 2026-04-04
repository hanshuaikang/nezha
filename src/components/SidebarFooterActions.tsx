import { useState } from "react";
import { Settings, Moon, Sun } from "lucide-react";
import { AppSettingsDialog } from "./AppSettingsDialog";
import s from "../styles";

export function SidebarFooterActions({
  isDark,
  onToggleTheme,
}: {
  isDark: boolean;
  onToggleTheme: () => void;
}) {
  const [showAppSettings, setShowAppSettings] = useState(false);

  return (
    <>
      <div style={s.sidebarFooterActions}>
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
      </div>

      {showAppSettings && (
        <AppSettingsDialog isDark={isDark} onClose={() => setShowAppSettings(false)} />
      )}
    </>
  );
}
