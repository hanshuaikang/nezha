import { useEffect, useState } from "react";
import type React from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, ChevronDown, Monitor } from "lucide-react";
import * as Select from "@radix-ui/react-select";
import type { ThemeMode } from "../../types";
import { useI18n } from "../../i18n";
import s from "../../styles";
import { APP_SETTINGS_CHANGED_EVENT, type AppSettings } from "./types";

const FONT_FAMILY_DEFAULT = "__default__";

const FONT_FAMILIES = [
  { value: FONT_FAMILY_DEFAULT, label: "" },
  { value: "SF Pro Display", label: "SF Pro Display" },
  { value: "Inter", label: "Inter" },
  { value: "IBM Plex Sans", label: "IBM Plex Sans" },
  { value: "Noto Sans SC", label: "Noto Sans SC" },
  { value: "PingFang SC", label: "PingFang SC" },
  { value: "Helvetica Neue", label: "Helvetica Neue" },
  { value: "Segoe UI", label: "Segoe UI" },
  { value: "system-ui", label: "System UI" },
];

const FONT_SIZES = [0, 10, 11, 12, 13, 14, 15, 16, 18, 20, 24];

const DEFAULT_FONT_STACK =
  '"SF Pro Display", "IBM Plex Sans", "PingFang SC", "Noto Sans SC", sans-serif';

export function applyFontSettings(family: string, size: number) {
  const root = document.documentElement;
  if (family) {
    root.style.setProperty("--font-ui", `"${family}", ${DEFAULT_FONT_STACK}`);
  } else {
    root.style.removeProperty("--font-ui");
  }
  if (size > 0) {
    root.style.setProperty("--app-font-size", `${size}px`);
    root.style.fontSize = `${size}px`;
  } else {
    root.style.removeProperty("--app-font-size");
    root.style.fontSize = "";
  }
}

interface ThemePanelProps {
  themeMode: ThemeMode;
  systemPrefersDark: boolean;
  onThemeModeChange: (mode: ThemeMode) => void;
}

export function ThemePanel({ themeMode, systemPrefersDark, onThemeModeChange }: ThemePanelProps) {
  const { t } = useI18n();
  const [fontFamily, setFontFamily] = useState(FONT_FAMILY_DEFAULT);
  const [fontSize, setFontSize] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    invoke<AppSettings>("load_app_settings").then((loaded) => {
      setFontFamily(loaded.font_family || FONT_FAMILY_DEFAULT);
      setFontSize(loaded.font_size);
    });
  }, []);

  async function handleFontChange(nextFamily: string, nextSize: number) {
    setSaving(true);
    try {
      const realFamily = nextFamily === FONT_FAMILY_DEFAULT ? "" : nextFamily;
      const saved = await invoke<AppSettings>("save_font_settings", {
        fontFamily: realFamily,
        fontSize: nextSize,
      });
      setFontFamily(saved.font_family || FONT_FAMILY_DEFAULT);
      setFontSize(saved.font_size);
      applyFontSettings(saved.font_family, saved.font_size);
      window.dispatchEvent(new Event(APP_SETTINGS_CHANGED_EVENT));
    } finally {
      setSaving(false);
    }
  }

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
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) {
    const currentIndex = manualThemeModes.indexOf(mode);
    if (currentIndex === -1) {
      return;
    }

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      onThemeModeChange(manualThemeModes[(currentIndex + 1) % manualThemeModes.length]);
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      onThemeModeChange(manualThemeModes[(currentIndex - 1 + manualThemeModes.length) % manualThemeModes.length]);
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
        <div
          style={{
            width: "100%",
            height: 106,
            borderRadius: 10,
            border: `1px solid ${previewBorder}`,
            background: previewBackground,
            padding: 8,
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            gap: 7,
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", gap: 5 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: previewAccent,
                opacity: 0.9,
              }}
            />
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: previewAccent,
                opacity: 0.65,
              }}
            />
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: previewAccent,
                opacity: 0.4,
              }}
            />
          </div>
          <div
            style={{
              flex: 1,
              display: "grid",
              gridTemplateColumns: mode === "dark" ? "28px 1fr" : "24px 1fr",
              gap: 7,
            }}
          >
            <div
              style={{
                borderRadius: 7,
                background:
                  mode === "dark"
                    ? "rgba(255,255,255,0.05)"
                    : "rgba(23,27,36,0.06)",
                border:
                  mode === "dark"
                    ? "1px solid rgba(255,255,255,0.06)"
                    : "1px solid rgba(23,27,36,0.06)",
                display: "flex",
                flexDirection: "column",
                gap: 5,
                padding: "7px 5px",
              }}
            >
              <span
                style={{
                  height: 5,
                  borderRadius: 999,
                  background: previewAccent,
                  opacity: mode === "dark" ? 0.55 : 0.3,
                }}
              />
              <span
                style={{
                  height: 5,
                  borderRadius: 999,
                  background: previewAccent,
                  opacity: mode === "dark" ? 0.28 : 0.16,
                }}
              />
              <span
                style={{
                  height: 5,
                  borderRadius: 999,
                  background: previewAccent,
                  opacity: mode === "dark" ? 0.2 : 0.12,
                }}
              />
            </div>
            <div
              style={{
                borderRadius: 8,
                background:
                  mode === "dark"
                    ? "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))"
                    : "linear-gradient(180deg, rgba(23,27,36,0.1), rgba(23,27,36,0.04))",
                border:
                  mode === "dark"
                    ? "1px solid rgba(255,255,255,0.08)"
                    : "1px solid rgba(23,27,36,0.08)",
                padding: 8,
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 34,
                    height: 6,
                    borderRadius: 999,
                    background: previewAccent,
                    opacity: mode === "dark" ? 0.75 : 0.2,
                  }}
                />
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 4,
                    background: mode === "dark" ? "rgba(255,255,255,0.12)" : "#ffffff",
                    border:
                      mode === "dark"
                        ? "1px solid rgba(255,255,255,0.08)"
                        : "1px solid rgba(23,27,36,0.08)",
                  }}
                />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.15fr 0.85fr",
                  gap: 6,
                  flex: 1,
                }}
              >
                <div
                  style={{
                    borderRadius: 6,
                    background: mode === "dark" ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.9)",
                    border:
                      mode === "dark"
                        ? "1px solid rgba(255,255,255,0.06)"
                        : "1px solid rgba(23,27,36,0.06)",
                  }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <span
                    style={{
                      height: 18,
                      borderRadius: 6,
                      background:
                        mode === "dark"
                          ? "rgba(255,255,255,0.09)"
                          : "rgba(255,255,255,0.92)",
                      border:
                        mode === "dark"
                          ? "1px solid rgba(255,255,255,0.06)"
                          : "1px solid rgba(23,27,36,0.06)",
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      borderRadius: 6,
                      background:
                        mode === "dark"
                          ? "rgba(255,255,255,0.05)"
                          : "rgba(255,255,255,0.82)",
                      border:
                        mode === "dark"
                          ? "1px solid rgba(255,255,255,0.05)"
                          : "1px solid rgba(23,27,36,0.05)",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

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
    <div
      style={{
        ...s.settingsBody,
        display: "flex",
        flexDirection: "column",
        gap: 18,
        padding: "20px",
      }}
    >
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
              background: themeMode === "system" ? "var(--primary-action-bg)" : "var(--border-medium)",
              boxShadow:
                themeMode === "system" ? "0 0 0 4px var(--control-active-bg)" : "inset 0 0 0 1px var(--border-dim)",
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
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 3,
              minWidth: 0,
              padding: 0,
              textAlign: "left",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              {t("theme.followSystem")}
            </span>
          </div>
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

      <div
        style={{
          borderTop: "1px solid var(--border-dim)",
          paddingTop: 18,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
          {t("appSettings.fontFamily")}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Select.Root
            value={fontFamily}
            onValueChange={(value) => {
              setFontFamily(value);
              void handleFontChange(value, fontSize);
            }}
            disabled={saving}
          >
            <Select.Trigger
              aria-label={t("appSettings.fontFamily")}
              style={{
                width: 220,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "7px 10px",
                background: "var(--bg-input)",
                border: "1px solid var(--border-medium)",
                borderRadius: 7,
                color: "var(--text-primary)",
                fontSize: 12.5,
                fontFamily: fontFamily !== FONT_FAMILY_DEFAULT ? `"${fontFamily}", var(--font-ui)` : "var(--font-ui)",
                cursor: saving ? "default" : "pointer",
                opacity: saving ? 0.65 : 1,
                outline: "none",
              }}
            >
              <Select.Value>
                {fontFamily === FONT_FAMILY_DEFAULT ? t("appSettings.fontFamilyDefault") : fontFamily}
              </Select.Value>
              <Select.Icon>
                <ChevronDown size={13} strokeWidth={2.2} color="var(--text-hint)" />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content
                position="popper"
                sideOffset={4}
                style={{
                  minWidth: 220,
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-medium)",
                  borderRadius: 8,
                  boxShadow: "var(--shadow-popover)",
                  padding: 4,
                  zIndex: 3000,
                }}
              >
                <Select.Viewport>
                  {FONT_FAMILIES.map((option) => (
                    <Select.Item
                      key={option.value}
                      value={option.value}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "7px 8px",
                        borderRadius: 5,
                        color: "var(--text-primary)",
                        fontSize: 12.5,
                        fontFamily: option.value !== FONT_FAMILY_DEFAULT ? `"${option.value}", var(--font-ui)` : "var(--font-ui)",
                        cursor: "pointer",
                        outline: "none",
                      }}
                    >
                      <Select.ItemText>
                        {option.value === FONT_FAMILY_DEFAULT ? t("appSettings.fontFamilyDefault") : option.value}
                      </Select.ItemText>
                      <Select.ItemIndicator style={{ marginLeft: "auto", display: "flex" }}>
                        <Check size={13} color="var(--accent)" />
                      </Select.ItemIndicator>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
          <span style={{ fontSize: 11, color: "var(--text-hint)" }}>
            {t("appSettings.fontFamilyHint")}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
            {t("appSettings.fontSize")}
          </div>
          <Select.Root
            value={String(fontSize)}
            onValueChange={(value) => {
              const size = Number(value);
              setFontSize(size);
              void handleFontChange(fontFamily, size);
            }}
            disabled={saving}
          >
            <Select.Trigger
              aria-label={t("appSettings.fontSize")}
              style={{
                width: 160,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "7px 10px",
                background: "var(--bg-input)",
                border: "1px solid var(--border-medium)",
                borderRadius: 7,
                color: "var(--text-primary)",
                fontSize: 12.5,
                fontFamily: "var(--font-ui)",
                cursor: saving ? "default" : "pointer",
                opacity: saving ? 0.65 : 1,
                outline: "none",
              }}
            >
              <Select.Value>
                {fontSize === 0 ? t("appSettings.fontSizeDefault") : `${fontSize}px`}
              </Select.Value>
              <Select.Icon>
                <ChevronDown size={13} strokeWidth={2.2} color="var(--text-hint)" />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content
                position="popper"
                sideOffset={4}
                style={{
                  minWidth: 160,
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-medium)",
                  borderRadius: 8,
                  boxShadow: "var(--shadow-popover)",
                  padding: 4,
                  zIndex: 3000,
                }}
              >
                <Select.Viewport>
                  {FONT_SIZES.map((size) => (
                    <Select.Item
                      key={size}
                      value={String(size)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "7px 8px",
                        borderRadius: 5,
                        color: "var(--text-primary)",
                        fontSize: 12.5,
                        cursor: "pointer",
                        outline: "none",
                      }}
                    >
                      <Select.ItemText>
                        {size === 0 ? t("appSettings.fontSizeDefault") : `${size}px`}
                      </Select.ItemText>
                      <Select.ItemIndicator style={{ marginLeft: "auto", display: "flex" }}>
                        <Check size={13} color="var(--accent)" />
                      </Select.ItemIndicator>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
          <span style={{ fontSize: 11, color: "var(--text-hint)" }}>
            {t("appSettings.fontSizeHint")}
          </span>
        </div>
      </div>
    </div>
  );
}
