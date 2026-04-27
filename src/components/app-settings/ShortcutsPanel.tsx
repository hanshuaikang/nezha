import { useEffect, useState } from "react";
import type React from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, ChevronDown } from "lucide-react";
import * as Select from "@radix-ui/react-select";
import { useI18n } from "../../i18n";
import { APP_PLATFORM } from "../../platform";
import {
  DEFAULT_SEND_SHORTCUT,
  getSendShortcutLabel,
  normalizeSendShortcut,
  type SendShortcut,
} from "../../shortcuts";
import s from "../../styles";
import { APP_SETTINGS_CHANGED_EVENT, type AppSettings } from "./types";

export function getShortcutKbdStyle(): React.CSSProperties {
  return {
    ...s.kbd,
    display: "inline-flex",
    opacity: 1,
    minWidth: 44,
    height: 24,
    justifyContent: "center",
    fontSize: 12,
  };
}

export function ShortcutsPanel() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<AppSettings>({
    claude_path: "",
    codex_path: "",
    send_shortcut: DEFAULT_SEND_SHORTCUT,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<AppSettings>("load_app_settings")
      .then((loadedSettings) => {
        const normalized = {
          ...loadedSettings,
          send_shortcut: normalizeSendShortcut(loadedSettings.send_shortcut),
        };
        setSettings(normalized);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function handleShortcutChange(value: string) {
    const sendShortcut = normalizeSendShortcut(value);
    const previousSettings = settings;
    setSettings((prev) => ({
      ...prev,
      send_shortcut: sendShortcut,
    }));
    setSaving(true);
    setError(null);
    try {
      const latest = await invoke<AppSettings>("load_app_settings");
      const nextSettings = {
        ...latest,
        send_shortcut: sendShortcut,
      };
      await invoke("save_app_settings", { settings: nextSettings });
      setSettings(nextSettings);
      window.dispatchEvent(new Event(APP_SETTINGS_CHANGED_EVENT));
    } catch (e) {
      setError(String(e));
      try {
        const persistedSettings = await invoke<AppSettings>("load_app_settings");
        setSettings({
          ...persistedSettings,
          send_shortcut: normalizeSendShortcut(persistedSettings.send_shortcut),
        });
      } catch {
        setSettings(previousSettings);
      }
    } finally {
      setSaving(false);
    }
  }

  const shortcutOptions: Array<{ value: SendShortcut; label: string; ariaLabel: string }> = [
    {
      value: "mod_enter",
      label: getSendShortcutLabel("mod_enter", APP_PLATFORM),
      ariaLabel: t("appSettings.sendShortcutModEnter"),
    },
    {
      value: "enter",
      label: getSendShortcutLabel("enter", APP_PLATFORM),
      ariaLabel: t("appSettings.sendShortcutEnter"),
    },
  ];
  const selectedOption =
    shortcutOptions.find((option) => option.value === settings.send_shortcut) ??
    shortcutOptions[0];

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: 5,
    display: "block",
  };

  const kbdStyle = getShortcutKbdStyle();

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
      {error && (
        <div style={{ color: "var(--danger)", fontSize: 12.5, marginBottom: 14 }}>{error}</div>
      )}

      {loading ? (
        <div style={{ color: "var(--text-hint)", fontSize: 13 }}>{t("common.loading")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={labelStyle}>{t("appSettings.sendMessage")}</label>
          <Select.Root
            value={settings.send_shortcut}
            onValueChange={handleShortcutChange}
            disabled={saving}
          >
            <Select.Trigger
              aria-label={t("appSettings.sendMessage")}
              style={{
                width: 112,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "6px 8px",
                background: "var(--bg-input)",
                border: "1px solid var(--border-medium)",
                borderRadius: 7,
                color: "var(--text-primary)",
                cursor: saving ? "default" : "pointer",
                opacity: saving ? 0.65 : 1,
                outline: "none",
              }}
            >
              <kbd style={kbdStyle}>{selectedOption.label}</kbd>
              <Select.Value style={{ display: "none" }} />
              <Select.Icon>
                <ChevronDown size={13} strokeWidth={2.2} color="var(--text-hint)" />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content
                position="popper"
                sideOffset={4}
                style={{
                  minWidth: 112,
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-medium)",
                  borderRadius: 8,
                  boxShadow: "var(--shadow-popover)",
                  padding: 4,
                  zIndex: 3000,
                }}
              >
                <Select.Viewport>
                  {shortcutOptions.map((option) => (
                    <Select.Item
                      key={option.value}
                      value={option.value}
                      aria-label={option.ariaLabel}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 7px",
                        borderRadius: 5,
                        color: "var(--text-primary)",
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
        </div>
      )}
    </div>
  );
}
