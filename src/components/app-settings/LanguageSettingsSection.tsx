import { Check, ChevronDown } from "lucide-react";
import * as Select from "@radix-ui/react-select";
import { useI18n, type AppLanguage } from "../../i18n";
import {
  appSettingsHintStyle,
  appSettingsLabelStyle,
  appSettingsSectionStyle,
  appSettingsSectionTitleStyle,
} from "./sectionStyles";

export function LanguageSettingsSection() {
  const { language, setLanguage, t } = useI18n();
  const languageOptions: Array<{ value: AppLanguage; label: string }> = [
    { value: "en", label: t("language.english") },
    { value: "zh", label: t("language.chinese") },
  ];
  const selectedLanguageLabel =
    languageOptions.find((option) => option.value === language)?.label ?? language;

  return (
    <section style={appSettingsSectionStyle}>
      <h3 style={appSettingsSectionTitleStyle}>{t("appSettings.general")}</h3>
      <div>
        <label style={appSettingsLabelStyle}>{t("appSettings.appLanguage")}</label>
        <Select.Root value={language} onValueChange={(value) => setLanguage(value as AppLanguage)}>
          <Select.Trigger
            aria-label={t("appSettings.appLanguage")}
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
              fontFamily: "var(--font-ui)",
              cursor: "pointer",
              outline: "none",
            }}
          >
            <Select.Value>{selectedLanguageLabel}</Select.Value>
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
                {languageOptions.map((option) => (
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
                      cursor: "pointer",
                      outline: "none",
                    }}
                  >
                    <Select.ItemText>{option.label}</Select.ItemText>
                    <Select.ItemIndicator style={{ marginLeft: "auto", display: "flex" }}>
                      <Check size={13} color="var(--accent)" />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
        <div style={appSettingsHintStyle}>{t("appSettings.languageHint")}</div>
      </div>
    </section>
  );
}
