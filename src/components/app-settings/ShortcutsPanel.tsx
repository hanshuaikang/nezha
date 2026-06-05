import { useEffect, useState } from "react";
import type React from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, ChevronDown } from "lucide-react";
import * as Select from "@radix-ui/react-select";
import { useI18n } from "../../i18n";
import { APP_PLATFORM } from "../../platform";
import {
  DEFAULT_SEND_SHORTCUT,
  DEFAULT_TERMINAL_NEWLINE_SHORTCUT,
  getNewlineShortcutKeys,
  getSendShortcutKeys,
  getTerminalNewlineShortcutKeys,
  getTerminalNewlineShortcutLabel,
  normalizeSendShortcut,
  normalizeTerminalNewlineShortcut,
} from "../../shortcuts";
import s from "../../styles";
import { renderShortcutKeys } from "./shared";
import { APP_SETTINGS_CHANGED_EVENT, type AppSettings } from "./types";

interface ShortcutOption {
  value: string;
  keys: string[];
  ariaLabel: string;
}

function ShortcutSelect({
  label,
  value,
  options,
  onValueChange,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  options: ShortcutOption[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
  hint?: React.ReactNode;
}) {
  const selected = options.find((option) => option.value === value);
  return (
    <div style={s.shortcutField}>
      <label style={s.shortcutFieldLabel}>{label}</label>
      <Select.Root value={value} onValueChange={onValueChange} disabled={disabled}>
        <Select.Trigger aria-label={label} style={s.shortcutSelectTrigger}>
          <Select.Value>{selected ? renderShortcutKeys(selected.keys) : null}</Select.Value>
          <Select.Icon>
            <ChevronDown size={13} strokeWidth={2.2} color="var(--text-hint)" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content position="popper" sideOffset={4} style={s.settingsSelectContent}>
            <Select.Viewport style={s.settingsSelectViewport}>
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  aria-label={option.ariaLabel}
                  className="radix-select-item"
                  style={
                    option.value === value
                      ? s.settingsSelectOptionSelected
                      : s.settingsSelectOption
                  }
                >
                  <Select.ItemText>{renderShortcutKeys(option.keys)}</Select.ItemText>
                  <Select.ItemIndicator style={s.settingsSelectIndicator}>
                    <Check size={13} style={s.settingsSelectCheck} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      {hint ? <div style={s.shortcutHint}>{hint}</div> : null}
    </div>
  );
}

function normalizeSettings(loaded: AppSettings): AppSettings {
  return {
    ...loaded,
    send_shortcut: normalizeSendShortcut(loaded.send_shortcut),
    terminal_newline_shortcut: normalizeTerminalNewlineShortcut(loaded.terminal_newline_shortcut),
  };
}

export function ShortcutsPanel() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<AppSettings>({
    claude_path: "",
    codex_path: "",
    send_shortcut: DEFAULT_SEND_SHORTCUT,
    terminal_newline_shortcut: DEFAULT_TERMINAL_NEWLINE_SHORTCUT,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<AppSettings>("load_app_settings")
      .then((loaded) => setSettings(normalizeSettings(loaded)))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function persist(command: string, payload: Record<string, string>) {
    const previousSettings = settings;
    setSaving(true);
    setError(null);
    try {
      const saved = await invoke<AppSettings>(command, payload);
      setSettings(normalizeSettings(saved));
      window.dispatchEvent(new Event(APP_SETTINGS_CHANGED_EVENT));
    } catch (e) {
      setError(String(e));
      try {
        const persisted = await invoke<AppSettings>("load_app_settings");
        setSettings(normalizeSettings(persisted));
      } catch {
        setSettings(previousSettings);
      }
    } finally {
      setSaving(false);
    }
  }

  function handleSendShortcutChange(value: string) {
    const sendShortcut = normalizeSendShortcut(value);
    setSettings((prev) => ({ ...prev, send_shortcut: sendShortcut }));
    void persist("save_send_shortcut", { sendShortcut });
  }

  function handleTerminalNewlineChange(value: string) {
    const terminalNewlineShortcut = normalizeTerminalNewlineShortcut(value);
    setSettings((prev) => ({ ...prev, terminal_newline_shortcut: terminalNewlineShortcut }));
    void persist("save_terminal_newline_shortcut", { terminalNewlineShortcut });
  }

  const sendShortcutOptions: ShortcutOption[] = [
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
  const terminalNewlineOptions: ShortcutOption[] = [
    {
      value: "alt_enter",
      keys: getTerminalNewlineShortcutKeys("alt_enter", APP_PLATFORM),
      ariaLabel: t("appSettings.terminalNewlineAltEnter"),
    },
    {
      value: "shift_enter",
      keys: getTerminalNewlineShortcutKeys("shift_enter", APP_PLATFORM),
      ariaLabel: t("appSettings.terminalNewlineShiftEnter"),
    },
  ];

  const sendShortcutKeys = getSendShortcutKeys(settings.send_shortcut, APP_PLATFORM);
  const newlineShortcutKeys = getNewlineShortcutKeys(settings.send_shortcut, APP_PLATFORM);
  const terminalNewlineLabel = getTerminalNewlineShortcutLabel(
    settings.terminal_newline_shortcut,
    APP_PLATFORM,
  );

  const sendHint = (
    <>
      {renderShortcutKeys(sendShortcutKeys, s.shortcutHintKey)}
      <span>{t("newTask.send")}</span>
      <span style={s.shortcutHintSep}>/</span>
      {renderShortcutKeys(newlineShortcutKeys, s.shortcutHintKey)}
      <span>{t("newTask.newLine")}</span>
    </>
  );

  return (
    <div style={s.shortcutsPanelBody}>
      {error && <div style={s.shortcutsPanelError}>{error}</div>}

      {loading ? (
        <div style={s.shortcutsPanelLoading}>{t("common.loading")}</div>
      ) : (
        <div style={s.shortcutsPanelGroups}>
          <ShortcutSelect
            label={t("appSettings.sendMessage")}
            value={settings.send_shortcut}
            options={sendShortcutOptions}
            onValueChange={handleSendShortcutChange}
            disabled={saving}
            hint={sendHint}
          />
          <ShortcutSelect
            label={t("appSettings.terminalNewline")}
            value={settings.terminal_newline_shortcut}
            options={terminalNewlineOptions}
            onValueChange={handleTerminalNewlineChange}
            disabled={saving}
            hint={t("appSettings.terminalNewlineHint", { shortcut: terminalNewlineLabel })}
          />
        </div>
      )}
    </div>
  );
}
