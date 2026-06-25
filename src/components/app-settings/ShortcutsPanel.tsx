import { useEffect, useState } from "react";
import type React from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, ChevronDown } from "lucide-react";
import * as Select from "@radix-ui/react-select";
import { useI18n } from "../../i18n";
import { APP_PLATFORM } from "../../platform";
import {
  DEFAULT_SEND_SHORTCUT,
  DEFAULT_SHIFT_ENTER_NEWLINE,
  getAltEnterNewlineKeys,
  getNewlineShortcutKeys,
  getSendShortcutKeys,
  getShiftEnterNewlineKeys,
  normalizeSendShortcut,
  normalizeShiftEnterNewline,
} from "../../shortcuts";
import { DEFAULT_TERMINAL_SCROLLBACK } from "../../types";
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
        <Select.Trigger
          aria-label={label}
          style={
            disabled
              ? { ...s.shortcutSelectTrigger, ...s.shortcutSelectTriggerDisabled }
              : s.shortcutSelectTrigger
          }
        >
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
    terminal_shift_enter_newline: normalizeShiftEnterNewline(loaded.terminal_shift_enter_newline),
  };
}

export function ShortcutsPanel() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<AppSettings>({
    claude_path: "",
    codex_path: "",
    send_shortcut: DEFAULT_SEND_SHORTCUT,
    terminal_shift_enter_newline: DEFAULT_SHIFT_ENTER_NEWLINE,
    claude_force_default_tui: true,
    terminal_scrollback: DEFAULT_TERMINAL_SCROLLBACK,
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

  async function persist(command: string, payload: Record<string, unknown>) {
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

  function handleShiftEnterNewlineToggle() {
    const enabled = !settings.terminal_shift_enter_newline;
    setSettings((prev) => ({ ...prev, terminal_shift_enter_newline: enabled }));
    void persist("save_shift_enter_newline", { enabled });
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
  const sendShortcutKeys = getSendShortcutKeys(settings.send_shortcut, APP_PLATFORM);
  const newlineShortcutKeys = getNewlineShortcutKeys(settings.send_shortcut, APP_PLATFORM);
  const shiftEnterEnabled = settings.terminal_shift_enter_newline;

  const terminalNewlineHint = (
    <>
      {renderShortcutKeys(getAltEnterNewlineKeys(APP_PLATFORM), s.shortcutHintKey)}
      <span>{t("appSettings.terminalNewlineAltAlways")}</span>
    </>
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
          <div style={s.shortcutField}>
            <label style={s.shortcutFieldLabel}>{t("appSettings.terminalNewline")}</label>
            <button
              type="button"
              role="switch"
              aria-checked={shiftEnterEnabled}
              aria-label={t("appSettings.terminalNewlineShiftEnter")}
              disabled={saving}
              onClick={handleShiftEnterNewlineToggle}
              style={saving ? { ...s.shortcutToggle, ...s.shortcutToggleDisabled } : s.shortcutToggle}
            >
              <span style={s.shortcutToggleKeys}>{renderShortcutKeys(getShiftEnterNewlineKeys())}</span>
              <span style={shiftEnterEnabled ? s.shortcutSwitchTrackOn : s.shortcutSwitchTrack}>
                <span
                  style={shiftEnterEnabled ? s.shortcutSwitchThumbOn : s.shortcutSwitchThumb}
                />
              </span>
            </button>
            <div style={s.shortcutHint}>{terminalNewlineHint}</div>
          </div>
        </div>
      )}
    </div>
  );
}
