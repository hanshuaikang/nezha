import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, ChevronDown, RotateCcw } from "lucide-react";
import * as Select from "@radix-ui/react-select";
import { useI18n } from "../../i18n";
import { APP_PLATFORM } from "../../platform";
import {
  DEFAULT_SEND_SHORTCUT,
  DEFAULT_SHIFT_ENTER_NEWLINE,
  formatShortcutLabel,
  formatShortcutRangeLabel,
  getDefaultShortcutBindings,
  getShortcutBinding,
  getShortcutConflictActions,
  getShortcutKeys,
  getFixedShortcutSignatures,
  getAltEnterNewlineKeys,
  getNewlineShortcutKeys,
  getSendShortcutKeys,
  getSendShortcutSignatures,
  getShiftEnterNewlineKeys,
  normalizeSendShortcut,
  normalizeShiftEnterNewline,
  normalizeShortcutBindings,
  shortcutBindingSignatures,
  type ShortcutAction,
  type ShortcutBinding,
  type ShortcutModifiers,
} from "../../shortcuts";
import s from "../../styles";
import { renderShortcutKeys } from "./shared";
import { APP_SETTINGS_CHANGED_EVENT, type AppSettings } from "./types";

interface ShortcutOption {
  value: string;
  keys: string[];
  ariaLabel: string;
}

const SHORTCUT_ACTIONS: ShortcutAction[] = [
  "switch_project_slot",
  "switch_task_slot",
  "new_task",
  "open_project_switcher",
];

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
    shortcuts: normalizeShortcutBindings(loaded.shortcuts, APP_PLATFORM),
  };
}

function modifiersFromEvent(event: KeyboardEvent): ShortcutModifiers {
  return {
    meta: event.metaKey || undefined,
    ctrl: event.ctrlKey || undefined,
    alt: event.altKey || undefined,
    shift: event.shiftKey || undefined,
  };
}

function hasModifier(modifiers: ShortcutModifiers): boolean {
  return !!(modifiers.meta || modifiers.ctrl || modifiers.alt || modifiers.shift);
}

function isModifierOnlyKey(code: string): boolean {
  return (
    code === "MetaLeft" ||
    code === "MetaRight" ||
    code === "ControlLeft" ||
    code === "ControlRight" ||
    code === "AltLeft" ||
    code === "AltRight" ||
    code === "ShiftLeft" ||
    code === "ShiftRight"
  );
}

function isSlotAction(action: ShortcutAction): boolean {
  return action === "switch_project_slot" || action === "switch_task_slot";
}

function isSlotRecordCode(code: string): boolean {
  return /^Digit[1-9]$/.test(code) || /^Numpad[1-9]$/.test(code);
}

function recordBindingFromEvent(
  action: ShortcutAction,
  event: KeyboardEvent,
): { binding?: ShortcutBinding; errorKey?: string } {
  const code = event.code;
  if (!code || isModifierOnlyKey(code)) return {};

  const modifiers = modifiersFromEvent(event);
  if (!hasModifier(modifiers)) return { errorKey: "appSettings.shortcutRecordNeedsModifier" };

  if (isSlotAction(action)) {
    if (!isSlotRecordCode(code)) return { errorKey: "appSettings.shortcutRecordNeedsDigit" };
    return {
      binding: {
        action,
        key: "Digit1",
        modifiers,
        slotRange: [1, 9],
        enabled: true,
      },
    };
  }

  return {
    binding: {
      action,
      key: code,
      modifiers,
      enabled: true,
    },
  };
}

function upsertBinding(bindings: ShortcutBinding[], next: ShortcutBinding): ShortcutBinding[] {
  const defaults = getDefaultShortcutBindings(APP_PLATFORM);
  const source = bindings.length > 0 ? bindings : defaults;
  const updated = source.map((binding) => (binding.action === next.action ? next : binding));
  return normalizeShortcutBindings(updated, APP_PLATFORM);
}

function actionLabelKey(action: ShortcutAction): string {
  return `appSettings.shortcutAction.${action}`;
}

function actionHintKey(action: ShortcutAction): string {
  return `appSettings.shortcutHint.${action}`;
}

function actionName(t: (key: string) => string, action: ShortcutAction) {
  return t(actionLabelKey(action));
}

function bindingHasSignature(binding: ShortcutBinding, signatures: Set<string>): boolean {
  return shortcutBindingSignatures(binding).some((signature) => signatures.has(signature));
}

export function ShortcutsPanel() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<AppSettings>({
    claude_path: "",
    codex_path: "",
    send_shortcut: DEFAULT_SEND_SHORTCUT,
    terminal_shift_enter_newline: DEFAULT_SHIFT_ENTER_NEWLINE,
    shortcuts: getDefaultShortcutBindings(APP_PLATFORM),
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recordingAction, setRecordingAction] = useState<ShortcutAction | null>(null);
  const [recordErrorKey, setRecordErrorKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<AppSettings>("load_app_settings")
      .then((loaded) => setSettings(normalizeSettings(loaded)))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!recordingAction) return;
    const handleRecord = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setRecordingAction(null);
        setRecordErrorKey(null);
        return;
      }

      const result = recordBindingFromEvent(recordingAction, event);
      if (result.errorKey) {
        setRecordErrorKey(result.errorKey);
        return;
      }
      if (!result.binding) return;

      setSettings((prev) => {
        const shortcuts = upsertBinding(prev.shortcuts ?? [], result.binding!);
        void persistShortcuts(shortcuts);
        return { ...prev, shortcuts };
      });
      setRecordingAction(null);
      setRecordErrorKey(null);
    };
    window.addEventListener("keydown", handleRecord, true);
    return () => window.removeEventListener("keydown", handleRecord, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingAction]);

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

  async function persistShortcuts(shortcuts: ShortcutBinding[]) {
    await persist("save_shortcuts", { shortcuts });
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

  function handleShortcutToggle(action: ShortcutAction) {
    const current = getShortcutBinding(settings.shortcuts ?? [], action);
    if (!current) return;
    const shortcuts = upsertBinding(settings.shortcuts ?? [], { ...current, enabled: !current.enabled });
    setSettings((prev) => ({ ...prev, shortcuts }));
    void persistShortcuts(shortcuts);
  }

  function handleShortcutReset(action: ShortcutAction) {
    const defaults = getDefaultShortcutBindings(APP_PLATFORM);
    const replacement = defaults.find((binding) => binding.action === action);
    if (!replacement) return;
    const shortcuts = upsertBinding(settings.shortcuts ?? [], replacement);
    setSettings((prev) => ({ ...prev, shortcuts }));
    void persistShortcuts(shortcuts);
  }

  const shortcuts = settings.shortcuts ?? getDefaultShortcutBindings(APP_PLATFORM);
  const conflictActions = useMemo(() => getShortcutConflictActions(shortcuts), [shortcuts]);
  const sendConflictSignatures = useMemo(
    () => new Set(getSendShortcutSignatures(settings.send_shortcut, APP_PLATFORM)),
    [settings.send_shortcut],
  );
  const fixedConflictSignatures = useMemo(
    () => new Set(getFixedShortcutSignatures(APP_PLATFORM)),
    [],
  );

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

          <div style={s.shortcutActionGroup}>
            <div style={s.shortcutActionGroupTitle}>{t("appSettings.navigationShortcuts")}</div>
            {SHORTCUT_ACTIONS.map((action) => {
              const binding =
                getShortcutBinding(shortcuts, action) ??
                getShortcutBinding(getDefaultShortcutBindings(APP_PLATFORM), action)!;
              const conflicts = conflictActions.get(action);
              const conflictText =
                conflicts && conflicts.size > 0
                  ? Array.from(conflicts)
                      .map((other) => actionName(t, other))
                      .join(", ")
                  : "";
              const label = binding.slotRange
                ? formatShortcutRangeLabel(binding, APP_PLATFORM)
                : formatShortcutLabel(binding, APP_PLATFORM);
              const displayKeys = binding.slotRange
                ? getShortcutKeys(binding, APP_PLATFORM, binding.slotRange[0])
                : getShortcutKeys(binding, APP_PLATFORM);
              const hasSendConflict = bindingHasSignature(binding, sendConflictSignatures);
              const hasFixedConflict = bindingHasSignature(binding, fixedConflictSignatures);

              return (
                <div key={action} style={s.shortcutActionRow}>
                  <div style={s.shortcutActionMain}>
                    <div style={s.shortcutActionTitle}>{actionName(t, action)}</div>
                    <div style={s.shortcutActionHint}>{t(actionHintKey(action))}</div>
                    {APP_PLATFORM === "macos" &&
                      action === "switch_task_slot" &&
                      binding.modifiers.ctrl && (
                        <div style={s.shortcutActionWarning}>
                          {t("appSettings.shortcutMacCtrlDigitWarning")}
                        </div>
                      )}
                    {conflictText && (
                      <div style={s.shortcutActionWarning}>
                        {t("appSettings.shortcutConflict", { action: conflictText })}
                      </div>
                    )}
                    {hasSendConflict && (
                      <div style={s.shortcutActionWarning}>
                        {t("appSettings.shortcutSendConflict")}
                      </div>
                    )}
                    {hasFixedConflict && (
                      <div style={s.shortcutActionWarning}>
                        {t("appSettings.shortcutFixedConflict")}
                      </div>
                    )}
                  </div>
                  <div style={s.shortcutActionControls}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={binding.enabled}
                      disabled={saving}
                      onClick={() => handleShortcutToggle(action)}
                      style={binding.enabled ? s.shortcutMiniSwitchOn : s.shortcutMiniSwitch}
                    >
                      <span style={binding.enabled ? s.shortcutMiniSwitchThumbOn : s.shortcutMiniSwitchThumb} />
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setRecordErrorKey(null);
                        setRecordingAction(action);
                      }}
                      title={label}
                      style={
                        recordingAction === action
                          ? { ...s.shortcutRecordBtn, ...s.shortcutRecordBtnActive }
                          : s.shortcutRecordBtn
                      }
                    >
                      {recordingAction === action
                        ? t("appSettings.shortcutRecording")
                        : renderShortcutKeys(displayKeys, s.shortcutHintKey)}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      title={t("common.reset")}
                      aria-label={t("common.reset")}
                      onClick={() => handleShortcutReset(action)}
                      style={s.shortcutResetBtn}
                    >
                      <RotateCcw size={12} strokeWidth={2.1} />
                    </button>
                  </div>
                  {recordingAction === action && (
                    <div style={s.shortcutRecordHint}>
                      {recordErrorKey ? t(recordErrorKey) : t("appSettings.shortcutRecordHint")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
