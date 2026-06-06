import type React from "react";
import { Check, ChevronDown } from "lucide-react";
import * as Select from "@radix-ui/react-select";
import { useI18n, type AppLanguage } from "../../i18n";
import {
  normalizeTaskDisplayWindow,
  TASK_DISPLAY_WINDOW_VALUES,
  type TaskDisplayWindow,
} from "../../types";
import s from "../../styles";

export function GeneralPanel({
  taskDisplayWindow,
  onTaskDisplayWindowChange,
  attentionBadge,
  onAttentionBadgeChange,
}: {
  taskDisplayWindow: TaskDisplayWindow;
  onTaskDisplayWindowChange: (window: TaskDisplayWindow) => void;
  attentionBadge: boolean;
  onAttentionBadgeChange: (enabled: boolean) => void;
}) {
  const { language, setLanguage, t } = useI18n();

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
        <label style={labelStyle}>{t("appSettings.attentionBadge")}</label>
        <button
          type="button"
          role="switch"
          aria-checked={attentionBadge}
          aria-label={t("appSettings.attentionBadge")}
          onClick={() => onAttentionBadgeChange(!attentionBadge)}
          style={s.settingToggle}
        >
          <span style={s.settingToggleLabel}>{t("appSettings.attentionBadgeToggle")}</span>
          <span
            style={{
              ...s.settingToggleTrack,
              background: attentionBadge ? "var(--primary-action-bg)" : "var(--border-medium)",
            }}
          >
            <span
              style={{
                ...s.settingToggleKnob,
                transform: attentionBadge ? "translateX(16px)" : "translateX(0)",
              }}
            />
          </span>
        </button>
        <span style={hintStyle}>{t("appSettings.attentionBadgeHint")}</span>
      </div>
    </div>
  );
}
