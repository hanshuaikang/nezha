import { useCallback, useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { FolderOpen, RotateCcw } from "lucide-react";
import { useI18n } from "../../i18n";
import type { Project, SkillHubConfig, SetSkillHubResult } from "../../types";
import { SKILL_HUB_CHANGED_EVENT } from "./types";
import s from "../../styles";

export function SkillsPanel() {
  const { t } = useI18n();
  const [config, setConfig] = useState<SkillHubConfig | null>(null);
  const [hubProjectName, setHubProjectName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<SkillHubConfig>("get_skill_hub_config")
      .then((cfg) => setConfig(cfg ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!config?.hubProjectId) {
      setHubProjectName(null);
      return;
    }
    invoke<Project[]>("load_projects")
      .then((projects) => {
        if (cancelled) return;
        const hub = projects.find((p) => p.id === config.hubProjectId);
        setHubProjectName(hub?.name ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [config?.hubProjectId]);

  const handlePick = useCallback(async () => {
    setError(null);
    const selected = await openDialog({ directory: true, multiple: false });
    if (!selected) return;
    setBusy(true);
    try {
      const result = await invoke<SetSkillHubResult>("set_skill_hub_path", {
        path: selected as string,
      });
      setConfig(result.config);
      setHubProjectName(result.project.name);
      window.dispatchEvent(
        new CustomEvent(SKILL_HUB_CHANGED_EVENT, {
          detail: { projects: result.projects },
        }),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const handleClear = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await invoke("clear_skill_hub");
      setConfig(null);
      setHubProjectName(null);
      window.dispatchEvent(new CustomEvent(SKILL_HUB_CHANGED_EVENT));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const hubPath = config?.hubPath ?? "";

  return (
    <div style={s.skillsPanelBody}>
      <div style={s.skillsPanelField}>
        <label style={s.skillsPanelLabel}>{t("skill.settings.hubPath")}</label>
        <div style={s.skillsPanelPathRow}>
          <div style={s.skillsPanelPathBox}>
            {hubPath ? (
              <span style={s.skillsPanelPathText}>{hubPath}</span>
            ) : (
              <span style={s.skillsPanelPathEmpty}>{t("skill.settings.notConfigured")}</span>
            )}
          </div>
          <button
            type="button"
            style={s.skillsPanelPickBtn}
            onClick={handlePick}
            disabled={busy}
          >
            <FolderOpen size={13} strokeWidth={2} />
            {t("skill.settings.choose")}
          </button>
          {hubPath ? (
            <button
              type="button"
              style={s.skillsPanelClearBtn}
              onClick={handleClear}
              disabled={busy}
              title={t("skill.settings.reset")}
            >
              <RotateCcw size={13} strokeWidth={2} />
            </button>
          ) : null}
        </div>
        <span style={s.skillsPanelHint}>{t("skill.settings.hubPathHint")}</span>
      </div>

      {hubProjectName ? (
        <div style={s.skillsPanelMetaRow}>
          <span style={s.skillsPanelMetaLabel}>{t("skill.settings.hubProject")}</span>
          <span style={s.skillsPanelMetaValue}>{hubProjectName}</span>
        </div>
      ) : null}

      {error ? <div style={s.skillsPanelError}>{error}</div> : null}
    </div>
  );
}
