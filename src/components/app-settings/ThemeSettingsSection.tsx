import { type KeyboardEvent } from "react";
import { Check, Monitor } from "lucide-react";
import type { ThemeMode } from "../../types";
import { useI18n } from "../../i18n";
import { appSettingsSectionStyle, appSettingsSectionTitleStyle } from "./sectionStyles";
import { ThemePreview } from "./ThemePreview";

interface ThemeSettingsSectionProps {
  themeMode: ThemeMode;
  systemPrefersDark: boolean;
  onThemeModeChange: (mode: ThemeMode) => void;
}

export function ThemeSettingsSection({
  themeMode,
  systemPrefersDark,
  onThemeModeChange,
}: ThemeSettingsSectionProps) {
  const { t } = useI18n();
  const manualThemeModes: Array<Extract<ThemeMode, "dark" | "light">> = ["dark", "light"];
  const currentModeLabel = systemPrefersDark ? t("theme.dark") : t("theme.light");
  const manualModeLabel = themeMode === "dark" ? t("theme.dark") : t("theme.light");
  const selectedLabel =
    themeMode === "system"
      ? t("theme.followingSystem", { mode: currentModeLabel })
      : t("theme.manual", { mode: manualModeLabel });

  function handleSystemThemeToggle() {
    onThemeModeChange(themeMode === "system" ? "light" : "system");
  }

  function handleManualThemeKeyDown(
    mode: Extract<ThemeMode, "dark" | "light">,
    event: KeyboardEvent<HTMLButtonElement>,
  ) {
    const currentIndex = manualThemeModes.indexOf(mode);
    if (currentIndex === -1) return;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      onThemeModeChange(manualThemeModes[(currentIndex + 1) % manualThemeModes.length]);
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      onThemeModeChange(
        manualThemeModes[(currentIndex - 1 + manualThemeModes.length) % manualThemeModes.length],
      );
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      onThemeModeChange(manualThemeModes[0]);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      onThemeModeChange(manualThemeModes[manualThemeModes.length - 1]);
    }
  }

  function renderThemeOption({
    mode,
    title,
    description,
    previewBackground,
    previewBorder,
    previewAccent,
  }: {
    mode: Extract<ThemeMode, "dark" | "light">;
    title: string;
    description: string;
    previewBackground: string;
    previewBorder: string;
    previewAccent: string;
  }) {
    const selected = themeMode === mode;

    return (
      <button
        type="button"
        onClick={() => onThemeModeChange(mode)}
        onKeyDown={(event) => handleManualThemeKeyDown(mode, event)}
        role="radio"
        aria-checked={selected}
        aria-label={title}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: 10,
          padding: 14,
          borderRadius: 12,
          border: `1px solid ${selected ? "var(--control-active-fg)" : "var(--border-medium)"}`,
          background: selected ? "var(--control-active-bg)" : "var(--bg-subtle)",
          cursor: "pointer",
          textAlign: "left",
          boxShadow: selected ? "0 0 0 1px var(--control-active-bg)" : "none",
          transition: "border-color 0.12s, background 0.12s, box-shadow 0.12s",
        }}
      >
        <ThemePreview
          mode={mode}
          previewBackground={previewBackground}
          previewBorder={previewBorder}
          previewAccent={previewAccent}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              {title}
            </span>
            {selected && <Check size={14} color="var(--accent)" />}
          </div>
          <span style={{ fontSize: 11.5, color: "var(--text-hint)", lineHeight: 1.45 }}>
            {description}
          </span>
        </div>
      </button>
    );
  }

  return (
    <section style={appSettingsSectionStyle}>
      <h3 style={appSettingsSectionTitleStyle}>{t("appSettings.theme")}</h3>
      <button
        type="button"
        onClick={handleSystemThemeToggle}
        role="switch"
        aria-checked={themeMode === "system"}
        aria-label={t("theme.followSystemAria")}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          padding: "16px 18px",
          borderRadius: 12,
          border: `1px solid ${themeMode === "system" ? "var(--control-active-fg)" : "var(--border-dim)"}`,
          background: themeMode === "system" ? "var(--control-active-bg)" : "var(--bg-subtle)",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div
            style={{
              flexShrink: 0,
              width: 48,
              height: 28,
              borderRadius: 999,
              border: "none",
              padding: 3,
              background:
                themeMode === "system" ? "var(--primary-action-bg)" : "var(--border-medium)",
              boxShadow:
                themeMode === "system"
                  ? "0 0 0 4px var(--control-active-bg)"
                  : "inset 0 0 0 1px var(--border-dim)",
              transition: "background 0.12s, box-shadow 0.12s",
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                background: "var(--control-knob-bg)",
                color: themeMode === "system" ? "var(--accent)" : "var(--text-secondary)",
                transform: themeMode === "system" ? "translateX(20px)" : "translateX(0)",
                transition: "transform 0.12s ease",
              }}
            >
              <Monitor size={12} />
            </div>
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            {t("theme.followSystem")}
          </span>
        </div>
        <div
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            borderRadius: 999,
            background: "var(--bg-card)",
            border: "1px solid var(--border-medium)",
            color: "var(--text-secondary)",
            fontSize: 11.5,
            fontWeight: 600,
          }}
        >
          {themeMode === "system" && <Check size={13} color="var(--accent)" />}
          {selectedLabel}
        </div>
      </button>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
          {t("theme.manualTheme")}
        </div>
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}
          role="radiogroup"
          aria-label={t("theme.manualThemeAria")}
        >
          {renderThemeOption({
            mode: "dark",
            title: t("theme.dark"),
            description: t("theme.darkDescription"),
            previewBackground: "#11151d",
            previewBorder: "rgba(255,255,255,0.08)",
            previewAccent: "#f1f4fb",
          })}
          {renderThemeOption({
            mode: "light",
            title: t("theme.light"),
            description: t("theme.lightDescription"),
            previewBackground: "#f5f7fb",
            previewBorder: "rgba(23,27,36,0.08)",
            previewAccent: "#171b24",
          })}
        </div>
      </div>
    </section>
  );
}
