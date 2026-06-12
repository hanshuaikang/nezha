import type React from "react";
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
      1024,
    ),
    maxCount: normalizePositiveInteger(
      settings.terminal_attachment_max_count,
      DEFAULT_TERMINAL_ATTACHMENT_MAX_COUNT,
      10_000,
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
    const maxSizeMb = normalizePositiveInteger(maxSizeText, attachmentSettings.maxSizeMb, 1024);
    if (maxSizeMb === attachmentSettings.maxSizeMb) {
      setMaxSizeText(String(maxSizeMb));
      return;
    }
    void persistAttachmentSettings({ ...attachmentSettings, maxSizeMb });
  }

  function commitMaxCount() {
    const maxCount = normalizePositiveInteger(maxCountText, attachmentSettings.maxCount, 10_000);
    if (maxCount === attachmentSettings.maxCount) {
      setMaxCountText(String(maxCount));
      return;
    }
    void persistAttachmentSettings({ ...attachmentSettings, maxCount });
  }

  return (
    <>
      <div style={{ ...fieldStyle, marginTop: 18 }}>
        <label style={labelStyle}>{t("appSettings.attachmentPaste")}</label>
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
          style={{
            ...s.settingToggle,
            opacity: attachmentSaving ? 0.65 : 1,
            cursor: attachmentSaving ? "default" : "pointer",
          }}
        >
          <span style={s.settingToggleLabel}>{t("appSettings.attachmentPasteToggle")}</span>
          <span
            style={{
              ...s.settingToggleTrack,
              background: attachmentSettings.enabled
                ? "var(--primary-action-bg)"
                : "var(--border-medium)",
            }}
          >
            <span
              style={{
                ...s.settingToggleKnob,
                transform: attachmentSettings.enabled ? "translateX(16px)" : "translateX(0)",
              }}
            />
          </span>
        </button>
        <span style={hintStyle}>{t("appSettings.attachmentPasteHint")}</span>
      </div>

      <div style={{ ...fieldStyle, marginTop: 18 }}>
        <label style={labelStyle}>{t("appSettings.attachmentMaxSize")}</label>
        <div style={s.settingsFlexRow}>
          <input
            type="number"
            min={1}
            max={1024}
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
            style={{ ...s.modalInput, width: 110 }}
          />
          <span style={s.settingsUnitText}>M</span>
        </div>
      </div>

      <div style={{ ...fieldStyle, marginTop: 18 }}>
        <label style={labelStyle}>{t("appSettings.attachmentMaxCount")}</label>
        <input
          type="number"
          min={1}
          max={10000}
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
          style={{ ...s.modalInput, width: 110 }}
        />
        <span style={hintStyle}>{t("appSettings.attachmentMaxCountHint")}</span>
      </div>

      {attachmentError ? (
        <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 12 }}>
          {attachmentError}
        </div>
      ) : null}
    </>
  );
}
