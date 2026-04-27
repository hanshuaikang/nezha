import type { ThemeMode } from "../../types";
import s from "../../styles";
import { LanguageSettingsSection } from "./LanguageSettingsSection";
import { ShortcutSettingsSection } from "./ShortcutSettingsSection";
import { ThemeSettingsSection } from "./ThemeSettingsSection";

interface ApplicationSettingsPanelProps {
  themeMode: ThemeMode;
  systemPrefersDark: boolean;
  onThemeModeChange: (mode: ThemeMode) => void;
}

export function ApplicationSettingsPanel({
  themeMode,
  systemPrefersDark,
  onThemeModeChange,
}: ApplicationSettingsPanelProps) {
  return (
    <div
      style={{
        ...s.settingsBody,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        padding: "20px",
      }}
    >
      <LanguageSettingsSection />
      <ThemeSettingsSection
        themeMode={themeMode}
        systemPrefersDark={systemPrefersDark}
        onThemeModeChange={onThemeModeChange}
      />
      <ShortcutSettingsSection />
    </div>
  );
}
