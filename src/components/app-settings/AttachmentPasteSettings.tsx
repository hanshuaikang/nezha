import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../../i18n";
import { APP_PLATFORM } from "../../platform";
import s from "../../styles";
import {
  APP_SETTINGS_CHANGED_EVENT,
  DEFAULT_TERMINAL_ATTACHMENT_MAX_COUNT,
  DEFAULT_TERMINAL_ATTACHMENT_MAX_SIZE_MB,
  DEFAULT_TERMINAL_ATTACHMENT_PASTE_ENABLED,
  TERMINAL_ATTACHMENT_MAX_COUNT_LIMIT,
  TERMINAL_ATTACHMENT_MAX_SIZE_MB_LIMIT,
  type AppSettings,
} from "./types";

interface AttachmentSettingsState {
  enabled: boolean;
  maxSizeMb: number;
  maxCount: number;
}

function normalizePositiveInteger(value: unknown, fallback: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.round(n)));
}

function normalizeAttachmentSettings(settings: Partial<AppSettings>): AttachmentSettingsState {
  return {
    enabled:
      typeof settings.terminal_attachment_paste_enabled === "boolean"
        ? settings.terminal_attachment_paste_enabled
        : DEFAULT_TERMINAL_ATTACHMENT_PASTE_ENABLED,
    maxSizeMb: normalizePositiveInteger(
      settings.terminal_attachment_max_size_mb,
      DEFAULT_TERMINAL_ATTACHMENT_MAX_SIZE_MB,
      TERMINAL_ATTACHMENT_MAX_SIZE_MB_LIMIT,
    ),
    maxCount: normalizePositiveInteger(
      settings.terminal_attachment_max_count,
      DEFAULT_TERMINAL_ATTACHMENT_MAX_COUNT,
      TERMINAL_ATTACHMENT_MAX_COUNT_LIMIT,
    ),
  };
}

export function AttachmentPasteSettings() {
  const { t } = useI18n();
  const [attachmentSettings, setAttachmentSettings] = useState<AttachmentSettingsState>({
    enabled: DEFAULT_TERMINAL_ATTACHMENT_PASTE_ENABLED,
    maxSizeMb: DEFAULT_TERMINAL_ATTACHMENT_MAX_SIZE_MB,
    maxCount: DEFAULT_TERMINAL_ATTACHMENT_MAX_COUNT,
  });
  const [maxSizeText, setMaxSizeText] = useState(String(DEFAULT_TERMINAL_ATTACHMENT_MAX_SIZE_MB));
  const [maxCountText, setMaxCountText] = useState(String(DEFAULT_TERMINAL_ATTACHMENT_MAX_COUNT));
  const [attachmentSaving, setAttachmentSaving] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  useEffect(() => {
    if (APP_PLATFORM !== "macos") return;
    let cancelled = false;
    const load = () => {
      invoke<AppSettings>("load_app_settings")
        .then((loaded) => {
          if (cancelled) return;
          const next = normalizeAttachmentSettings(loaded);
          setAttachmentSettings(next);
          setMaxSizeText(String(next.maxSizeMb));
          setMaxCountText(String(next.maxCount));
          setAttachmentError(null);
        })
        .catch((e) => {
          if (!cancelled) setAttachmentError(String(e));
        });
    };
    load();
    window.addEventListener(APP_SETTINGS_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(APP_SETTINGS_CHANGED_EVENT, load);
    };
  }, []);

  if (APP_PLATFORM !== "macos") {
    return null;
  }

  async function persistAttachmentSettings(next: AttachmentSettingsState) {
    const previous = attachmentSettings;
    setAttachmentSettings(next);
    setMaxSizeText(String(next.maxSizeMb));
    setMaxCountText(String(next.maxCount));
    setAttachmentSaving(true);
    setAttachmentError(null);
    try {
      const saved = await invoke<AppSettings>("save_terminal_attachment_settings", {
        enabled: next.enabled,
        maxSizeMb: next.maxSizeMb,
        maxCount: next.maxCount,
      });
      const normalized = normalizeAttachmentSettings(saved);
      setAttachmentSettings(normalized);
      setMaxSizeText(String(normalized.maxSizeMb));
      setMaxCountText(String(normalized.maxCount));
      window.dispatchEvent(new Event(APP_SETTINGS_CHANGED_EVENT));
    } catch (e) {
      setAttachmentError(String(e));
      setAttachmentSettings(previous);
      setMaxSizeText(String(previous.maxSizeMb));
      setMaxCountText(String(previous.maxCount));
    } finally {
      setAttachmentSaving(false);
    }
  }

  function commitMaxSize() {
    const maxSizeMb = normalizePositiveInteger(
      maxSizeText,
      attachmentSettings.maxSizeMb,
      TERMINAL_ATTACHMENT_MAX_SIZE_MB_LIMIT,
    );
    if (maxSizeMb === attachmentSettings.maxSizeMb) {
      setMaxSizeText(String(maxSizeMb));
      return;
    }
    void persistAttachmentSettings({ ...attachmentSettings, maxSizeMb });
  }

  function commitMaxCount() {
    const maxCount = normalizePositiveInteger(
      maxCountText,
      attachmentSettings.maxCount,
      TERMINAL_ATTACHMENT_MAX_COUNT_LIMIT,
    );
    if (maxCount === attachmentSettings.maxCount) {
      setMaxCountText(String(maxCount));
      return;
    }
    void persistAttachmentSettings({ ...attachmentSettings, maxCount });
  }

  return (
    <>
      <div style={s.settingsFieldSpaced}>
        <label style={s.settingsFieldLabel}>{t("appSettings.attachmentPaste")}</label>
        <button
          type="button"
          role="switch"
          aria-checked={attachmentSettings.enabled}
          aria-label={t("appSettings.attachmentPasteToggle")}
          disabled={attachmentSaving}
          onClick={() =>
            void persistAttachmentSettings({
              ...attachmentSettings,
              enabled: !attachmentSettings.enabled,
            })
          }
          style={attachmentSaving ? s.settingToggleSaving : s.settingToggle}
        >
          <span style={s.settingToggleLabel}>{t("appSettings.attachmentPasteToggle")}</span>
          <span
            style={attachmentSettings.enabled ? s.settingToggleTrackOn : s.settingToggleTrackOff}
          >
            <span
              style={attachmentSettings.enabled ? s.settingToggleKnobOn : s.settingToggleKnobOff}
            />
          </span>
        </button>
        <span style={s.settingsFieldHint}>{t("appSettings.attachmentPasteHint")}</span>
      </div>

      <div style={s.settingsFieldSpaced}>
        <label style={s.settingsFieldLabel}>{t("appSettings.attachmentMaxSize")}</label>
        <div style={s.settingsFlexRow}>
          <input
            type="number"
            min={1}
            max={TERMINAL_ATTACHMENT_MAX_SIZE_MB_LIMIT}
            step={1}
            value={maxSizeText}
            disabled={attachmentSaving}
            onChange={(e) => setMaxSizeText(e.currentTarget.value)}
            onBlur={commitMaxSize}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            style={s.settingsAttachmentNumberInput}
          />
          <span style={s.settingsUnitText}>M</span>
        </div>
      </div>

      <div style={s.settingsFieldSpaced}>
        <label style={s.settingsFieldLabel}>{t("appSettings.attachmentMaxCount")}</label>
        <input
          type="number"
          min={1}
          max={TERMINAL_ATTACHMENT_MAX_COUNT_LIMIT}
          step={1}
          value={maxCountText}
          disabled={attachmentSaving}
          onChange={(e) => setMaxCountText(e.currentTarget.value)}
          onBlur={commitMaxCount}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          style={s.settingsAttachmentNumberInput}
        />
        <span style={s.settingsFieldHint}>{t("appSettings.attachmentMaxCountHint")}</span>
      </div>

      {attachmentError ? <div style={s.settingsFieldError}>{attachmentError}</div> : null}
    </>
  );
}
