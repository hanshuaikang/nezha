import type React from "react";
import { useEffect, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import * as Select from "@radix-ui/react-select";
import { invoke } from "@tauri-apps/api/core";
import { useI18n, type AppLanguage } from "../../i18n";
import {
  normalizeTaskDisplayWindow,
  TASK_DISPLAY_WINDOW_VALUES,
  type TaskDisplayWindow,
} from "../../types";
import s from "../../styles";
import type { AppSettings } from "./types";

export function GeneralPanel({
  taskDisplayWindow,
  onTaskDisplayWindowChange,
}: {
  taskDisplayWindow: TaskDisplayWindow;
  onTaskDisplayWindowChange: (window: TaskDisplayWindow) => void;
}) {
  const { language, setLanguage, t } = useI18n();
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [savingWindowSize, setSavingWindowSize] = useState(false);

  useEffect(() => {
    invoke<AppSettings>("load_app_settings").then(setAppSettings).catch(() => {});
  }, []);

  async function handleCustomWindowSizeToggle(enabled: boolean) {
    setSavingWindowSize(true);
    try {
      const updated = await invoke<AppSettings>("save_window_size", { enabled });
      setAppSettings(updated);
    } finally {
      setSavingWindowSize(false);
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: 5,
    display: "block",
  };

  const fieldStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 5,
  };

  const hintStyle: React.CSSProperties = {
    fontSize: 11,
    color: "var(--text-hint)",
    marginTop: 3,
  };

  const selectTriggerStyle: React.CSSProperties = {
    ...s.settingsSelectTrigger,
    width: 220,
  };

  const languageOptions: Array<{ value: AppLanguage; label: string }> = [
    { value: "en", label: t("language.english") },
    { value: "zh", label: t("language.chinese") },
  ];
  const selectedLanguageLabel =
    languageOptions.find((option) => option.value === language)?.label ?? language;
  const taskDisplayWindowOptions = TASK_DISPLAY_WINDOW_VALUES.map((value) => ({
    value,
    label:
      value === "all"
        ? t("appSettings.taskDisplayAll")
        : t("appSettings.taskDisplayRecentDays", { days: value }),
  }));
  const selectedTaskDisplayWindowLabel =
    taskDisplayWindowOptions.find((option) => option.value === taskDisplayWindow)?.label ??
    t("appSettings.taskDisplayRecentDays", { days: 3 });

  return (
    <div
      style={{
        ...s.settingsBody,
        display: "flex",
        flexDirection: "column",
        gap: 0,
        padding: "20px",
      }}
    >
      <div style={fieldStyle}>
        <label style={labelStyle}>{t("appSettings.appLanguage")}</label>
        <Select.Root value={language} onValueChange={(value) => setLanguage(value as AppLanguage)}>
          <Select.Trigger aria-label={t("appSettings.appLanguage")} style={selectTriggerStyle}>
            <Select.Value>{selectedLanguageLabel}</Select.Value>
            <Select.Icon>
              <ChevronDown size={13} strokeWidth={2.2} color="var(--text-hint)" />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content position="popper" sideOffset={4} style={s.settingsSelectContent}>
              <Select.Viewport style={s.settingsSelectViewport}>
                {languageOptions.map((option) => {
                  const selected = option.value === language;

                  return (
                    <Select.Item
                      key={option.value}
                      value={option.value}
                      className="radix-select-item"
                      style={selected ? s.settingsSelectOptionSelected : s.settingsSelectOption}
                    >
                      <Select.ItemText>{option.label}</Select.ItemText>
                      <Select.ItemIndicator style={s.settingsSelectIndicator}>
                        <Check size={13} style={s.settingsSelectCheck} />
                      </Select.ItemIndicator>
                    </Select.Item>
                  );
                })}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
        <span style={hintStyle}>{t("appSettings.languageHint")}</span>
      </div>

      <div style={{ ...fieldStyle, marginTop: 18 }}>
        <label style={labelStyle}>{t("appSettings.taskDisplayWindow")}</label>
        <Select.Root
          value={String(taskDisplayWindow)}
          onValueChange={(value) => onTaskDisplayWindowChange(normalizeTaskDisplayWindow(value))}
        >
          <Select.Trigger
            aria-label={t("appSettings.taskDisplayWindow")}
            style={selectTriggerStyle}
          >
            <Select.Value>{selectedTaskDisplayWindowLabel}</Select.Value>
            <Select.Icon>
              <ChevronDown size={13} strokeWidth={2.2} color="var(--text-hint)" />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content position="popper" sideOffset={4} style={s.settingsSelectContent}>
              <Select.Viewport style={s.settingsSelectViewport}>
                {taskDisplayWindowOptions.map((option) => {
                  const optionValue = String(option.value);
                  const selected = option.value === taskDisplayWindow;

                  return (
                    <Select.Item
                      key={optionValue}
                      value={optionValue}
                      className="radix-select-item"
                      style={selected ? s.settingsSelectOptionSelected : s.settingsSelectOption}
                    >
                      <Select.ItemText>{option.label}</Select.ItemText>
                      <Select.ItemIndicator style={s.settingsSelectIndicator}>
                        <Check size={13} style={s.settingsSelectCheck} />
                      </Select.ItemIndicator>
                    </Select.Item>
                  );
                })}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
        <span style={hintStyle}>{t("appSettings.taskDisplayWindowHint")}</span>
      </div>

      <div style={{ ...fieldStyle, marginTop: 18 }}>
        <label style={labelStyle}>{t("appSettings.customWindowSize")}</label>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            disabled={savingWindowSize || appSettings === null}
            onClick={() =>
              appSettings && handleCustomWindowSizeToggle(!appSettings.custom_window_size)
            }
            style={{
              flexShrink: 0,
              width: 48,
              height: 28,
              borderRadius: 999,
              border: "none",
              padding: 3,
              background: appSettings?.custom_window_size
                ? "var(--primary-action-bg)"
                : "var(--border-medium)",
              boxShadow: appSettings?.custom_window_size
                ? "0 0 0 4px var(--control-active-bg)"
                : "inset 0 0 0 1px var(--border-dim)",
              cursor: savingWindowSize || appSettings === null ? "default" : "pointer",
              transition: "background 0.12s, box-shadow 0.12s",
              opacity: savingWindowSize ? 0.6 : 1,
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                background: "var(--control-knob-bg)",
                transform: appSettings?.custom_window_size ? "translateX(20px)" : "translateX(0)",
                transition: "transform 0.12s ease",
              }}
            />
          </button>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            {appSettings?.custom_window_size
              ? t("appSettings.customWindowSizeEnabled")
              : t("appSettings.customWindowSizeDisabled")}
          </span>
        </div>
        <span style={hintStyle}>{t("appSettings.customWindowSizeHint")}</span>
      </div>
    </div>
  );
}
