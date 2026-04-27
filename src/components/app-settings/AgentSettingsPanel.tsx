import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, RefreshCw } from "lucide-react";
import { DEFAULT_SEND_SHORTCUT, normalizeSendShortcut } from "../../shortcuts";
import s from "../../styles";
import { AgentConfigPanel } from "./AgentConfigPanel";
import { getAgentExecutablePlaceholder, getAgentSettingsFilePath } from "./shared";
import { APP_SETTINGS_CHANGED_EVENT, type AgentVersions, type AppSettings } from "./types";
import { useI18n } from "../../i18n";

const AUTO_VERSION_DETECT_DELAY_MS = 350;

const sectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  paddingBottom: 20,
  borderBottom: "1px solid var(--border-dim)",
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--text-primary)",
  marginBottom: 2,
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-secondary)",
  marginBottom: 5,
  display: "block",
};

const hintStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--text-hint)",
  marginTop: 3,
};

export function AgentSettingsPanel({ isDark }: { isDark: boolean }) {
  const { t } = useI18n();
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
        const normalized = {
          ...loadedSettings,
          send_shortcut: normalizeSendShortcut(loadedSettings.send_shortcut),
        };
        setSettings(normalized);
        setOriginal(normalized);
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
        send_shortcut: normalizeSendShortcut(settings.send_shortcut),
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

  function clearVersions() {
    versionRequestIdRef.current += 1;
    setRefreshingVersions(false);
    setVersions({ claude_version: "", codex_version: "" });
  }

  const isDirty =
    settings.claude_path !== original.claude_path || settings.codex_path !== original.codex_path;

  const inputStyle: CSSProperties = {
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

  const pathInputStyle: CSSProperties = {
    ...inputStyle,
    opacity: loadingSettings ? 0.65 : 1,
    cursor: loadingSettings ? "wait" : "text",
  };

  return (
    <div
      style={{
        ...s.settingsBody,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        padding: "20px",
      }}
    >
      {error && (
        <div style={{ color: "var(--danger)", fontSize: 12.5, marginBottom: -4 }}>{error}</div>
      )}

      <section style={sectionStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <h3 style={sectionTitleStyle}>{t("appSettings.agentPaths")}</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {loadingSettings && (
              <span style={{ color: "var(--text-hint)", fontSize: 12 }}>
                {t("common.loading")}
              </span>
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
              {refreshingVersions
                ? t("appSettings.refreshing")
                : t("appSettings.refreshVersions")}
            </button>
          </div>
        </div>

        <div>
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
          <div style={hintStyle}>{t("appSettings.claudePathHint")}</div>
        </div>

        <div>
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
          <div style={hintStyle}>{t("appSettings.codexPathHint")}</div>
        </div>

        <div>
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
          <div style={hintStyle}>{t("appSettings.versionsHint")}</div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
          {saved && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                color: "var(--success)",
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
      </section>

      <section style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Claude Code</h3>
        <AgentConfigPanel
          agentKey="claude"
          filePath={getAgentSettingsFilePath("claude")}
          lang="json"
          isDark={isDark}
          embedded
        />
      </section>

      <section style={{ ...sectionStyle, paddingBottom: 0, borderBottom: "none" }}>
        <h3 style={sectionTitleStyle}>Codex</h3>
        <AgentConfigPanel
          agentKey="codex"
          filePath={getAgentSettingsFilePath("codex")}
          lang="toml"
          isDark={isDark}
          embedded
        />
      </section>
    </div>
  );
}
