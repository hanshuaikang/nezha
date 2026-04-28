import { useEffect, useState } from "react";
import type React from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, ChevronDown } from "lucide-react";
import * as Select from "@radix-ui/react-select";
import { useI18n } from "../../i18n";
import { APP_PLATFORM } from "../../platform";
import {
  DEFAULT_SEND_SHORTCUT,
  getNewlineShortcutKeys,
  getSendShortcutKeys,
  normalizeSendShortcut,
  type SendShortcut,
} from "../../shortcuts";
import s from "../../styles";
import { renderShortcutKeys } from "./shared";
import { APP_SETTINGS_CHANGED_EVENT, type AppSettings } from "./types";

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
      const savedSettings = await invoke<AppSettings>("save_send_shortcut", {
        sendShortcut,
      });
      setSettings({
        ...savedSettings,
        send_shortcut: normalizeSendShortcut(savedSettings.send_shortcut),
      });
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

  const shortcutOptions: Array<{ value: SendShortcut; keys: string[]; ariaLabel: string }> = [
    {
      value: "mod_enter",
      keys: getSendShortcutKeys("mod_enter", APP_PLATFORM),
      ariaLabel: t("appSettings.sendShortcutModEnter"),
    },
    {
      value: "enter",
      keys: getSendShortcutKeys("enter", APP_PLATFORM),
      ariaLabel: t("appSettings.sendShortcutEnter"),
    },
  ];
  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: 5,
    display: "block",
  };
  const sendShortcutKeys = getSendShortcutKeys(settings.send_shortcut, APP_PLATFORM);
  const newlineShortcutKeys = getNewlineShortcutKeys(settings.send_shortcut, APP_PLATFORM);
  const shortcutHintKeyStyle: React.CSSProperties = {
    fontSize: "inherit",
    lineHeight: "inherit",
    fontWeight: 600,
    color: "var(--text-hint)",
  };

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
              <Select.Value />
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
                      <Select.ItemText>{renderShortcutKeys(option.keys)}</Select.ItemText>
                      <Select.ItemIndicator style={{ marginLeft: "auto", display: "flex" }}>
                        <Check size={13} color="var(--accent)" />
                      </Select.ItemIndicator>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              color: "var(--text-hint)",
              fontSize: 11.5,
              lineHeight: 1,
              whiteSpace: "nowrap",
              marginTop: 2,
            }}
          >
            {renderShortcutKeys(sendShortcutKeys, shortcutHintKeyStyle)}
            <span style={{ display: "inline-flex", alignItems: "center", lineHeight: 1 }}>
              {t("newTask.send")}
            </span>
            <span style={{ opacity: 0.55 }}>/</span>
            {renderShortcutKeys(newlineShortcutKeys, shortcutHintKeyStyle)}
            <span style={{ display: "inline-flex", alignItems: "center", lineHeight: 1 }}>
              {t("newTask.newLine")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
