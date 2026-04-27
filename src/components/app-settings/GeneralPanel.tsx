import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, ChevronDown, RefreshCw } from "lucide-react";
import * as Select from "@radix-ui/react-select";
import { useI18n, type AppLanguage } from "../../i18n";
import { DEFAULT_SEND_SHORTCUT, normalizeSendShortcut } from "../../shortcuts";
import s from "../../styles";
import { APP_SETTINGS_CHANGED_EVENT, type AgentVersions, type AppSettings } from "./types";
import { getAgentExecutablePlaceholder } from "./shared";

const AUTO_VERSION_DETECT_DELAY_MS = 350;

export function GeneralPanel() {
  const { language, setLanguage, t } = useI18n();
  const [settings, setSettings] = useState<AppSettings>({
    claude_path: "",
    codex_path: "",
    send_shortcut: DEFAULT_SEND_SHORTCUT,
  });
  const [original, setOriginal] = useState<AppSettings>({
    claude_path: "",
    codex_path: "",
    send_shortcut: DEFAULT_SEND_SHORTCUT,
  });
  const [versions, setVersions] = useState<AgentVersions>({
    claude_version: "",
    codex_version: "",
  });
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [detectingPaths, setDetectingPaths] = useState(false);
  const [refreshingVersions, setRefreshingVersions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didAutoLoadVersionsRef = useRef(false);
  const versionRequestIdRef = useRef(0);

  const loadVersions = useCallback(async (nextSettings: AppSettings) => {
    const requestId = versionRequestIdRef.current + 1;
    versionRequestIdRef.current = requestId;
    setRefreshingVersions(true);
    try {
      const detected = await invoke<AgentVersions>("detect_agent_versions_for_settings", {
        settings: nextSettings,
      });
      if (versionRequestIdRef.current === requestId) {
        setVersions(detected);
      }
    } catch (e) {
      if (versionRequestIdRef.current === requestId) {
        setError(String(e));
      }
    } finally {
      if (versionRequestIdRef.current === requestId) {
        setRefreshingVersions(false);
      }
    }
  }, []);

  useEffect(() => {
    invoke<AppSettings>("load_app_settings")
      .then((loadedSettings) => {
        setSettings(loadedSettings);
        setOriginal(loadedSettings);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingSettings(false));
  }, []);

  useEffect(() => {
    if (loadingSettings || error || didAutoLoadVersionsRef.current) return;
    const timer = window.setTimeout(() => {
      didAutoLoadVersionsRef.current = true;
      void loadVersions(settings);
    }, AUTO_VERSION_DETECT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [error, loadVersions, loadingSettings, settings]);

  async function handleDetect() {
    setDetectingPaths(true);
    setError(null);
    try {
      const detected = await invoke<AppSettings>("detect_agent_paths");
      const nextSettings = {
        ...settings,
        claude_path: detected.claude_path,
        codex_path: detected.codex_path,
        send_shortcut: normalizeSendShortcut(detected.send_shortcut),
      };
      setSettings(nextSettings);
      await loadVersions(nextSettings);
    } catch (e) {
      setError(String(e));
    } finally {
      setDetectingPaths(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const latest = await invoke<AppSettings>("load_app_settings");
      const nextSettings = {
        ...latest,
        claude_path: settings.claude_path,
        codex_path: settings.codex_path,
        send_shortcut: normalizeSendShortcut(latest.send_shortcut),
      };
      await invoke("save_app_settings", { settings: nextSettings });
      setSettings(nextSettings);
      setOriginal(nextSettings);
      window.dispatchEvent(new Event(APP_SETTINGS_CHANGED_EVENT));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const isDirty =
    settings.claude_path !== original.claude_path || settings.codex_path !== original.codex_path;

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "7px 10px",
    background: "var(--bg-input)",
    border: "1px solid var(--border-medium)",
    borderRadius: 7,
    color: "var(--text-primary)",
    fontSize: 12.5,
    fontFamily: "var(--font-mono)",
    outline: "none",
    boxSizing: "border-box",
  };

  const pathInputStyle: React.CSSProperties = {
    ...inputStyle,
    opacity: loadingSettings ? 0.65 : 1,
    cursor: loadingSettings ? "wait" : "text",
  };

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
    marginBottom: 18,
  };

  const hintStyle: React.CSSProperties = {
    fontSize: 11,
    color: "var(--text-hint)",
    marginTop: 3,
  };

  const languageOptions: Array<{ value: AppLanguage; label: string }> = [
    { value: "en", label: t("language.english") },
    { value: "zh", label: t("language.chinese") },
  ];
  const selectedLanguageLabel =
    languageOptions.find((option) => option.value === language)?.label ?? language;

  function clearVersions() {
    versionRequestIdRef.current += 1;
    setRefreshingVersions(false);
    setVersions({ claude_version: "", codex_version: "" });
  }

  return (
    <>
      <div
        style={{
          ...s.settingsBody,
          display: "flex",
          flexDirection: "column",
          gap: 0,
          padding: "20px 20px 14px",
        }}
      >
        {error && (
          <div style={{ color: "var(--danger)", fontSize: 12.5, marginBottom: 14 }}>{error}</div>
        )}

        <div style={{ ...fieldStyle, marginBottom: 20 }}>
          <label style={labelStyle}>{t("appSettings.appLanguage")}</label>
          <Select.Root
            value={language}
            onValueChange={(value) => setLanguage(value as AppLanguage)}
          >
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
          <span style={hintStyle}>{t("appSettings.languageHint")}</span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 18,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            {t("appSettings.agentPaths")}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {loadingSettings && (
              <span style={{ color: "var(--text-hint)", fontSize: 12 }}>{t("common.loading")}</span>
            )}
            <button
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 10px",
                background: "none",
                border: "1px solid var(--border-medium)",
                borderRadius: 6,
                fontSize: 12,
                color: "var(--text-secondary)",
                cursor: detectingPaths ? "default" : "pointer",
                opacity: detectingPaths ? 0.6 : 1,
              }}
              onClick={handleDetect}
              disabled={detectingPaths}
            >
              <RefreshCw size={12} className={detectingPaths ? "spin" : undefined} />
              {detectingPaths ? t("appSettings.detecting") : t("appSettings.autoDetect")}
            </button>
            <button
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 10px",
                background: "none",
                border: "1px solid var(--border-medium)",
                borderRadius: 6,
                fontSize: 12,
                color: "var(--text-secondary)",
                cursor: refreshingVersions ? "default" : "pointer",
                opacity: refreshingVersions ? 0.6 : 1,
              }}
              onClick={() => loadVersions(settings)}
              disabled={refreshingVersions}
            >
              <RefreshCw size={12} className={refreshingVersions ? "spin" : undefined} />
              {refreshingVersions ? t("appSettings.refreshing") : t("appSettings.refreshVersions")}
            </button>
          </div>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>{t("appSettings.claudePath")}</label>
          <input
            style={pathInputStyle}
            value={settings.claude_path}
            onChange={(e) => {
              clearVersions();
              setSettings((prev) => ({ ...prev, claude_path: e.target.value }));
            }}
            placeholder={getAgentExecutablePlaceholder("claude")}
            disabled={loadingSettings}
            spellCheck={false}
          />
          <span style={hintStyle}>{t("appSettings.claudePathHint")}</span>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>{t("appSettings.codexPath")}</label>
          <input
            style={pathInputStyle}
            value={settings.codex_path}
            onChange={(e) => {
              clearVersions();
              setSettings((prev) => ({ ...prev, codex_path: e.target.value }));
            }}
            placeholder={getAgentExecutablePlaceholder("codex")}
            disabled={loadingSettings}
            spellCheck={false}
          />
          <span style={hintStyle}>{t("appSettings.codexPathHint")}</span>
        </div>

        <div style={{ ...fieldStyle, marginBottom: 0 }}>
          <label style={labelStyle}>{t("appSettings.installedVersions")}</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-hint)", marginBottom: 4 }}>
                Claude Code
              </div>
              <input
                style={inputStyle}
                value={versions.claude_version}
                readOnly
                placeholder={t("common.notDetected")}
                spellCheck={false}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-hint)", marginBottom: 4 }}>Codex</div>
              <input
                style={inputStyle}
                value={versions.codex_version}
                readOnly
                placeholder={t("common.notDetected")}
                spellCheck={false}
              />
            </div>
          </div>
          <span style={hintStyle}>{t("appSettings.versionsHint")}</span>
        </div>
      </div>

      <div style={s.settingsFooter}>
        {saved && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              color: "var(--success)",
              marginRight: "auto",
            }}
          >
            <Check size={12} /> {t("common.saved")}
          </span>
        )}
        <button
          style={{ ...s.modalSaveBtn, opacity: saving || !isDirty ? 0.5 : 1 }}
          onClick={handleSave}
          disabled={loadingSettings || saving || !isDirty}
        >
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </>
  );
}
