import { useEffect, useRef, useState } from "react";
import type React from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, ChevronDown, RotateCcw } from "lucide-react";
import * as Select from "@radix-ui/react-select";
import { useI18n } from "../../i18n";
import { APP_PLATFORM } from "../../platform";
import type { AppPlatform } from "../../platform";
import {
  DEFAULT_SEND_SHORTCUT,
  GLOBAL_SHORTCUTS,
  applyKeybindings,
  getNewlineShortcutKeys,
  getSendShortcutKeys,
  getShortcutKeys,
  normalizeSendShortcut,
  serializeKeybinding,
  type Keybindings,
  type SendShortcut,
  type ShortcutDef,
  type ShortcutGroup,
} from "../../shortcuts";
import s from "../../styles";
import { renderShortcutKeys } from "./shared";
import { APP_SETTINGS_CHANGED_EVENT, type AppSettings } from "./types";

const GROUP_ORDER: ShortcutGroup[] = ["task", "panel", "editor", "terminal"];

interface ExtraShortcutRow {
  labelKey: string;
  keys: (platform: AppPlatform) => string[];
}

const EXTRA_SHORTCUTS: Partial<Record<ShortcutGroup, ExtraShortcutRow[]>> = {
  terminal: [
    {
      labelKey: "shortcut.smartCopy",
      keys: (p) => (p === "macos" ? ["⌘", "C"] : ["Ctrl", "C"]),
    },
  ],
};

export function ShortcutsPanel() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<AppSettings>({
    claude_path: "",
    codex_path: "",
    send_shortcut: DEFAULT_SEND_SHORTCUT,
    font_family: "",
    font_size: 0,
    keybindings: {},
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const recordingRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    invoke<AppSettings>("load_app_settings")
      .then((loadedSettings) => {
        setSettings({
          ...loadedSettings,
          send_shortcut: normalizeSendShortcut(loadedSettings.send_shortcut),
          keybindings: loadedSettings.keybindings ?? {},
        });
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!recordingId) return;
    recordingRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (["Meta", "Control", "Shift", "Alt"].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setRecordingId(null);
        return;
      }

      const binding = serializeKeybinding(e, APP_PLATFORM);
      const next = { ...settings.keybindings, [recordingId!]: binding };
      setRecordingId(null);
      saveKeybindings(next);
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recordingId, settings.keybindings]);

  async function saveKeybindings(keybindings: Keybindings) {
    setSaving(true);
    setError(null);
    try {
      const saved = await invoke<AppSettings>("save_keybindings", { keybindings });
      setSettings({
        ...saved,
        send_shortcut: normalizeSendShortcut(saved.send_shortcut),
        keybindings: saved.keybindings ?? {},
      });
      window.dispatchEvent(new Event(APP_SETTINGS_CHANGED_EVENT));
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  function handleResetBinding(id: string) {
    const next = { ...settings.keybindings };
    delete next[id];
    saveKeybindings(next);
  }

  async function handleShortcutChange(value: string) {
    const sendShortcut = normalizeSendShortcut(value);
    const previousSettings = settings;
    setSettings((prev) => ({ ...prev, send_shortcut: sendShortcut }));
    setSaving(true);
    setError(null);
    try {
      const savedSettings = await invoke<AppSettings>("save_send_shortcut", { sendShortcut });
      setSettings({
        ...savedSettings,
        send_shortcut: normalizeSendShortcut(savedSettings.send_shortcut),
        keybindings: savedSettings.keybindings ?? {},
      });
      window.dispatchEvent(new Event(APP_SETTINGS_CHANGED_EVENT));
    } catch (e) {
      setError(String(e));
      try {
        const persistedSettings = await invoke<AppSettings>("load_app_settings");
        setSettings({
          ...persistedSettings,
          send_shortcut: normalizeSendShortcut(persistedSettings.send_shortcut),
          keybindings: persistedSettings.keybindings ?? {},
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

  const effectiveShortcuts = applyKeybindings(GLOBAL_SHORTCUTS, settings.keybindings);

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

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "4px 0",
    fontSize: 12.5,
    color: "var(--text-secondary)",
  };

  const kbdStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 22,
    height: 22,
    padding: "0 5px",
    borderRadius: 4,
    border: "1px solid var(--border-medium)",
    background: "var(--bg-input)",
    color: "var(--text-primary)",
    fontSize: 11,
    fontFamily: "inherit",
    lineHeight: 1,
    whiteSpace: "nowrap",
  };

  const kbdGroupStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
  };

  function renderKbd(keys: string[]) {
    return (
      <span style={kbdGroupStyle}>
        {keys.map((key, i) => (
          <kbd key={`${key}-${i}`} style={kbdStyle}>{key}</kbd>
        ))}
      </span>
    );
  }

  function renderEditableRow(sc: ShortcutDef) {
    const isRecording = recordingId === sc.id;
    const isCustom = sc.id in settings.keybindings;

    return (
      <div key={sc.id} style={rowStyle}>
        <span>{t(sc.labelKey)}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {isCustom && (
            <button
              type="button"
              onClick={() => handleResetBinding(sc.id)}
              title={t("shortcut.reset")}
              style={{
                background: "none",
                border: "none",
                padding: 2,
                cursor: "pointer",
                color: "var(--text-muted)",
                display: "inline-flex",
                alignItems: "center",
                opacity: 0.6,
              }}
            >
              <RotateCcw size={11} />
            </button>
          )}
          <button
            ref={isRecording ? recordingRef : undefined}
            type="button"
            onClick={() => setRecordingId(isRecording ? null : sc.id)}
            disabled={saving}
            style={{
              background: isRecording ? "var(--accent)" : "none",
              border: isRecording
                ? "1px solid var(--accent)"
                : "1px solid transparent",
              borderRadius: 4,
              padding: "2px 4px",
              cursor: "pointer",
              outline: "none",
              color: isRecording ? "var(--bg-primary)" : "inherit",
              fontSize: 11,
              minWidth: 60,
              textAlign: "center",
            }}
            title={isRecording ? t("shortcut.pressKeys") : t("shortcut.clickToEdit")}
          >
            {isRecording ? (
              <span style={{ fontSize: 10.5, fontWeight: 600 }}>{t("shortcut.pressKeys")}</span>
            ) : (
              renderKbd(getShortcutKeys(sc, APP_PLATFORM))
            )}
          </button>
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        ...s.settingsBody,
        display: "flex",
        flexDirection: "column",
        gap: 0,
        padding: "20px",
        overflowY: "auto",
      }}
    >
      {error && (
        <div style={{ color: "var(--danger)", fontSize: 12.5, marginBottom: 14 }}>{error}</div>
      )}

      {loading ? (
        <div style={{ color: "var(--text-hint)", fontSize: 13 }}>{t("common.loading")}</div>
      ) : (
        <>
          {/* Send shortcut config */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
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

          {/* Shortcut reference table */}
          <div
            style={{
              borderTop: "1px solid var(--border-dim)",
              paddingTop: 16,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            {GROUP_ORDER.map((group) => {
              const items = effectiveShortcuts.filter((sc) => sc.group === group);
              const extras = EXTRA_SHORTCUTS[group];
              if (items.length === 0 && !extras?.length) return null;
              return (
                <div key={group}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      marginBottom: 6,
                    }}
                  >
                    {t(`shortcut.group.${group}`)}
                  </div>
                  {items.map((sc) => renderEditableRow(sc))}
                  {group === "editor" && (
                    <div style={rowStyle}>
                      <span>{t("shortcut.sendMessage")}</span>
                      {renderKbd(sendShortcutKeys)}
                    </div>
                  )}
                  {extras?.map((ex) => (
                    <div key={ex.labelKey} style={rowStyle}>
                      <span>{t(ex.labelKey)}</span>
                      {renderKbd(ex.keys(APP_PLATFORM))}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
