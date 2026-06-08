import { useEffect, useState } from "react";
import type React from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, RefreshCw } from "lucide-react";
import { useI18n } from "../../i18n";
import type { WslDistroInfo } from "../../types";
import s from "../../styles";
import { APP_SETTINGS_CHANGED_EVENT, type AppSettings } from "./types";

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

export function WslPanel() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [distros, setDistros] = useState<WslDistroInfo[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      invoke<AppSettings>("load_app_settings"),
      invoke<WslDistroInfo[]>("wsl_list_distros").catch(() => []),
    ])
      .then(([loaded, distroList]) => {
        if (cancelled) return;
        setSettings({
          ...loaded,
          wsl: loaded.wsl ?? { enabled: true, default_distro: "", default_shell: "/bin/bash" },
        });
        setDistros(distroList);
      })
      .catch((e) => {
        if (!cancelled) setStatus(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const wsl = settings?.wsl ?? { enabled: true, default_distro: "", default_shell: "/bin/bash" };

  function updateWsl(next: Partial<typeof wsl>) {
    setSettings((prev) =>
      prev ? { ...prev, wsl: { ...wsl, ...next } } : prev,
    );
    setSaved(false);
  }

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    setStatus(null);
    try {
      await invoke<void>("save_app_settings", { settings });
      window.dispatchEvent(new Event(APP_SETTINGS_CHANGED_EVENT));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function checkDefaultDistro() {
    if (!wsl.default_distro) return;
    setChecking(true);
    setStatus(null);
    try {
      const [health, versions] = await Promise.all([
        invoke<{ available: boolean; gitPath: string; error?: string | null }>("wsl_check_distro", {
          distro: wsl.default_distro,
        }),
        invoke<{
          claudePath: string;
          claudeVersion: string;
          codexPath: string;
          codexVersion: string;
        }>("wsl_detect_agent_versions", {
          distro: wsl.default_distro,
          shell: wsl.default_shell,
        }),
      ]);
      setStatus(
        [
          health.available
            ? t("appSettings.wslHealthOk", { git: health.gitPath || t("common.notDetected") })
            : (health.error ?? t("settings.runtimeHealthFailed")),
          `Claude: ${versions.claudeVersion || t("common.notDetected")}`,
          `Codex: ${versions.codexVersion || t("common.notDetected")}`,
        ].join(" · "),
      );
    } catch (e) {
      setStatus(String(e));
    } finally {
      setChecking(false);
    }
  }

  if (loading || !settings) {
    return <div style={{ color: "var(--text-hint)", fontSize: 13 }}>{t("common.loading")}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <input
          type="checkbox"
          checked={wsl.enabled}
          onChange={(e) => updateWsl({ enabled: e.currentTarget.checked })}
        />
        {t("appSettings.wslEnabled")}
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <label style={{ fontSize: 12, fontWeight: 600 }}>{t("appSettings.wslDefaultDistro")}</label>
        <input
          list="nezha-wsl-distros"
          style={inputStyle}
          value={wsl.default_distro}
          onChange={(e) => updateWsl({ default_distro: e.currentTarget.value })}
          placeholder={distros.find((d) => d.isDefault)?.name ?? "Ubuntu"}
        />
        <datalist id="nezha-wsl-distros">
          {distros.map((distro) => (
            <option key={distro.name} value={distro.name}>
              {`${distro.name} · ${distro.state} · WSL${distro.version}`}
            </option>
          ))}
        </datalist>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <label style={{ fontSize: 12, fontWeight: 600 }}>{t("appSettings.wslDefaultShell")}</label>
        <input
          style={inputStyle}
          value={wsl.default_shell}
          onChange={(e) => updateWsl({ default_shell: e.currentTarget.value })}
          placeholder="/bin/bash"
        />
      </div>

      {status && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{status}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button
          type="button"
          style={s.modalCancelBtn}
          onClick={checkDefaultDistro}
          disabled={checking || !wsl.default_distro}
        >
          <RefreshCw size={12} className={checking ? "spin" : undefined} />
          {t("appSettings.wslCheckDefault")}
        </button>
        {saved && (
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
            <Check size={12} /> {t("common.saved")}
          </span>
        )}
        <button type="button" style={s.modalSaveBtn} onClick={saveSettings} disabled={saving}>
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </div>
  );
}
