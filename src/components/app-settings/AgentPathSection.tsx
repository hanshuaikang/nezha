import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, RefreshCw } from "lucide-react";
import { useI18n } from "../../i18n";
import { DEFAULT_SEND_SHORTCUT, normalizeSendShortcut } from "../../shortcuts";
import s from "../../styles";
import { APP_SETTINGS_CHANGED_EVENT, type AgentVersions, type AppSettings, type AgentKey } from "./types";
import { getAgentExecutablePlaceholder } from "./shared";

const AUTO_VERSION_DETECT_DELAY_MS = 350;

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

const actionButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  padding: "5px 10px",
  background: "none",
  border: "1px solid var(--border-medium)",
  borderRadius: 6,
  fontSize: 12,
  color: "var(--text-secondary)",
  cursor: "pointer",
};

export function AgentPathSection({ agentKey }: { agentKey: AgentKey }) {
  const { t } = useI18n();
  const pathField: keyof AppSettings = agentKey === "claude" ? "claude_path" : "codex_path";
  const versionField: keyof AgentVersions =
    agentKey === "claude" ? "claude_version" : "codex_version";
  const pathLabel = t(agentKey === "claude" ? "appSettings.claudePath" : "appSettings.codexPath");
  const pathHint = t(agentKey === "claude" ? "appSettings.claudePathHint" : "appSettings.codexPathHint");

  const emptySettings: AppSettings = {
    claude_path: "",
    codex_path: "",
    send_shortcut: DEFAULT_SEND_SHORTCUT,
  };
  const [settings, setSettings] = useState<AppSettings>(emptySettings);
  const [originalSettings, setOriginalSettings] = useState<AppSettings>(emptySettings);
  const [versions, setVersions] = useState<AgentVersions>({
    claude_version: "",
    codex_version: "",
  });
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didAutoLoadRef = useRef(false);
  const versionRequestIdRef = useRef(0);
  const skipNextChangeEventRef = useRef(false);

  const loadVersions = useCallback(async (next: AppSettings) => {
    const requestId = versionRequestIdRef.current + 1;
    versionRequestIdRef.current = requestId;
    setRefreshing(true);
    try {
      const detected = await invoke<AgentVersions>("detect_agent_versions_for_settings", {
        settings: next,
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
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      invoke<AppSettings>("load_app_settings")
        .then((loaded) => {
          if (cancelled) return;
          setSettings(loaded);
          setOriginalSettings(loaded);
        })
        .catch((e) => {
          if (!cancelled) setError(String(e));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    load();
    const handler = () => {
      if (skipNextChangeEventRef.current) {
        skipNextChangeEventRef.current = false;
        return;
      }
      didAutoLoadRef.current = false;
      load();
    };
    window.addEventListener(APP_SETTINGS_CHANGED_EVENT, handler);
    return () => {
      cancelled = true;
      window.removeEventListener(APP_SETTINGS_CHANGED_EVENT, handler);
    };
  }, []);

  useEffect(() => {
    if (loading || error || didAutoLoadRef.current) return;
    const timer = window.setTimeout(() => {
      didAutoLoadRef.current = true;
      void loadVersions(settings);
    }, AUTO_VERSION_DETECT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [error, loadVersions, loading, settings]);

  function clearVersions() {
    versionRequestIdRef.current += 1;
    setRefreshing(false);
    setVersions((prev) => ({ ...prev, [versionField]: "" }));
  }

  async function handleDetect() {
    setDetecting(true);
    setError(null);
    try {
      const detected = await invoke<AppSettings>("detect_agent_paths");
      const nextSettings: AppSettings = {
        ...settings,
        [pathField]: detected[pathField],
        send_shortcut: normalizeSendShortcut(detected.send_shortcut),
      };
      setSettings(nextSettings);
      await loadVersions(nextSettings);
    } catch (e) {
      setError(String(e));
    } finally {
      setDetecting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const next = await invoke<AppSettings>("save_agent_paths", {
        claudePath: settings.claude_path,
        codexPath: settings.codex_path,
      });
      setSettings(next);
      setOriginalSettings(next);
      skipNextChangeEventRef.current = true;
      window.dispatchEvent(new Event(APP_SETTINGS_CHANGED_EVENT));
      await loadVersions(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const isDirty = settings[pathField] !== originalSettings[pathField];
  const versionValue = versions[versionField];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
      {error && <div style={{ color: "var(--danger)", fontSize: 12.5 }}>{error}</div>}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          {t("appSettings.installation")}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {loading && (
            <span style={{ color: "var(--text-hint)", fontSize: 12 }}>{t("common.loading")}</span>
          )}
          <button
            style={{
              ...actionButtonStyle,
              cursor: detecting ? "default" : "pointer",
              opacity: detecting ? 0.6 : 1,
            }}
            onClick={handleDetect}
            disabled={detecting}
          >
            <RefreshCw size={12} className={detecting ? "spin" : undefined} />
            {detecting ? t("appSettings.detecting") : t("appSettings.autoDetect")}
          </button>
          <button
            style={{
              ...actionButtonStyle,
              cursor: refreshing ? "default" : "pointer",
              opacity: refreshing ? 0.6 : 1,
            }}
            onClick={() => loadVersions(settings)}
            disabled={refreshing}
          >
            <RefreshCw size={12} className={refreshing ? "spin" : undefined} />
            {refreshing ? t("appSettings.refreshing") : t("appSettings.refreshVersions")}
          </button>
        </div>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>{pathLabel}</label>
        <input
          style={{
            ...inputStyle,
            opacity: loading ? 0.65 : 1,
            cursor: loading ? "wait" : "text",
          }}
          value={settings[pathField]}
          onChange={(e) => {
            clearVersions();
            setSettings((prev) => ({ ...prev, [pathField]: e.target.value }));
          }}
          placeholder={getAgentExecutablePlaceholder(agentKey)}
          disabled={loading}
          spellCheck={false}
        />
        <span style={hintStyle}>{pathHint}</span>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>{t("appSettings.installedVersions")}</label>
        <input
          style={inputStyle}
          value={versionValue}
          readOnly
          placeholder={t("common.notDetected")}
          spellCheck={false}
        />
        <span style={hintStyle}>{t("appSettings.versionsHint")}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
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
          style={{
            ...s.modalSaveBtn,
            padding: "5px 14px",
            fontSize: 12,
            cursor: saving || !isDirty ? "default" : "pointer",
            opacity: saving || !isDirty ? 0.5 : 1,
          }}
          onClick={handleSave}
          disabled={loading || saving || !isDirty}
        >
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </div>
  );
}
