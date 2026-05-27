import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useI18n } from "../../i18n";
import s from "../../styles";
import { APP_SETTINGS_CHANGED_EVENT, type AppSettings, type EnvVar } from "./types";

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SAVE_DEBOUNCE_MS = 400;

interface EnvVarDraft extends EnvVar {
  uid: string;
  reveal: boolean;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

function toDrafts(vars: EnvVar[]): EnvVarDraft[] {
  return vars.map((entry) => ({ ...entry, uid: uid(), reveal: false }));
}

function draftsToVars(drafts: EnvVarDraft[]): EnvVar[] {
  return drafts.map(({ key, value }) => ({ key: key.trim(), value }));
}

function isValidKey(key: string): boolean {
  return key.length === 0 || ENV_KEY_PATTERN.test(key);
}

function hasDuplicateKey(drafts: EnvVarDraft[], uidValue: string, key: string): boolean {
  const trimmed = key.trim();
  if (!trimmed) return false;
  return drafts.some((entry) => entry.uid !== uidValue && entry.key.trim() === trimmed);
}

export function EnvVarsPanel() {
  const { t } = useI18n();
  const [drafts, setDrafts] = useState<EnvVarDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextChangeEventRef = useRef(false);
  const cancelledRef = useRef(false);
  // 有 pending 防抖保存或 in-flight invoke 时，外部的 settings-changed 事件不应覆盖正在编辑的 drafts
  const dirtyRef = useRef(false);

  const load = useCallback(() => {
    setLoading(true);
    invoke<AppSettings>("load_app_settings")
      .then((settings) => {
        if (cancelledRef.current) return;
        setDrafts(toDrafts(settings.env_vars ?? []));
        setError(null);
      })
      .catch((e) => {
        if (cancelledRef.current) return;
        setError(String(e));
      })
      .finally(() => {
        if (cancelledRef.current) return;
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    load();
    const handler = () => {
      if (skipNextChangeEventRef.current) {
        skipNextChangeEventRef.current = false;
        return;
      }
      // 用户正在编辑且尚未持久化 — 拒绝外部覆盖，避免吃掉未保存的输入
      if (dirtyRef.current) return;
      load();
    };
    window.addEventListener(APP_SETTINGS_CHANGED_EVENT, handler);
    return () => {
      cancelledRef.current = true;
      window.removeEventListener(APP_SETTINGS_CHANGED_EVENT, handler);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, [load]);

  const persist = useCallback(async (next: EnvVarDraft[]) => {
    setSaving(true);
    setError(null);
    try {
      // 仅持久化合法 key；同名 key 保留第一行，让 UI 红边提示与持久化结果一致
      const seen = new Set<string>();
      const payload = draftsToVars(next)
        .filter((entry) => ENV_KEY_PATTERN.test(entry.key))
        .filter((entry) => {
          if (seen.has(entry.key)) return false;
          seen.add(entry.key);
          return true;
        });
      await invoke<AppSettings>("save_env_vars", { envVars: payload });
      if (cancelledRef.current) return;
      dirtyRef.current = false;
      skipNextChangeEventRef.current = true;
      window.dispatchEvent(new Event(APP_SETTINGS_CHANGED_EVENT));
      setSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => {
        if (cancelledRef.current) return;
        setSaved(false);
      }, 1500);
    } catch (e) {
      if (cancelledRef.current) return;
      setError(String(e));
    } finally {
      if (cancelledRef.current) return;
      setSaving(false);
    }
  }, []);

  const scheduleSave = useCallback(
    (next: EnvVarDraft[]) => {
      dirtyRef.current = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        if (cancelledRef.current) return;
        void persist(next);
      }, SAVE_DEBOUNCE_MS);
    },
    [persist],
  );

  function updateDraft(uidValue: string, patch: Partial<EnvVarDraft>) {
    setDrafts((prev) => {
      const next = prev.map((entry) => (entry.uid === uidValue ? { ...entry, ...patch } : entry));
      scheduleSave(next);
      return next;
    });
  }

  function addRow() {
    setDrafts((prev) => [...prev, { uid: uid(), key: "", value: "", reveal: true }]);
  }

  function removeRow(uidValue: string) {
    setDrafts((prev) => {
      const next = prev.filter((entry) => entry.uid !== uidValue);
      scheduleSave(next);
      return next;
    });
  }

  function toggleReveal(uidValue: string) {
    setDrafts((prev) =>
      prev.map((entry) => (entry.uid === uidValue ? { ...entry, reveal: !entry.reveal } : entry)),
    );
  }

  return (
    <div style={s.envVarsBody}>
      <div style={s.envVarsHint}>{t("appSettings.envVarsHint")}</div>

      {loading ? (
        <div style={s.envVarsHint}>{t("common.loading")}</div>
      ) : (
        <>
          <div style={s.envVarsList}>
            {drafts.map((entry) => {
              const keyValid = isValidKey(entry.key);
              const duplicate = hasDuplicateKey(drafts, entry.uid, entry.key);
              const keyHasIssue = !keyValid || duplicate;
              return (
                <div key={entry.uid} style={s.envVarRow}>
                  <input
                    type="text"
                    value={entry.key}
                    placeholder={t("appSettings.envVarsKeyPlaceholder")}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    aria-invalid={keyHasIssue || undefined}
                    title={
                      !keyValid
                        ? t("appSettings.envVarsInvalidKey")
                        : duplicate
                          ? t("appSettings.envVarsDuplicateKey")
                          : undefined
                    }
                    style={keyHasIssue ? s.envVarInputInvalid : s.envVarInput}
                    onChange={(e) => updateDraft(entry.uid, { key: e.target.value })}
                  />
                  <input
                    type={entry.reveal ? "text" : "password"}
                    value={entry.value}
                    placeholder={t("appSettings.envVarsValuePlaceholder")}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    style={s.envVarInput}
                    onChange={(e) => updateDraft(entry.uid, { value: e.target.value })}
                  />
                  <button
                    type="button"
                    style={s.envVarIconBtn}
                    onClick={() => toggleReveal(entry.uid)}
                    title={
                      entry.reveal
                        ? t("appSettings.envVarsHide")
                        : t("appSettings.envVarsShow")
                    }
                    aria-label={
                      entry.reveal
                        ? t("appSettings.envVarsHide")
                        : t("appSettings.envVarsShow")
                    }
                  >
                    {entry.reveal ? (
                      <EyeOff size={14} strokeWidth={1.8} />
                    ) : (
                      <Eye size={14} strokeWidth={1.8} />
                    )}
                  </button>
                  <button
                    type="button"
                    style={s.envVarIconBtn}
                    onClick={() => removeRow(entry.uid)}
                    title={t("appSettings.envVarsRemove")}
                    aria-label={t("appSettings.envVarsRemove")}
                  >
                    <Trash2 size={14} strokeWidth={1.8} />
                  </button>
                </div>
              );
            })}
          </div>

          <button type="button" style={s.envVarAddBtn} onClick={addRow}>
            <Plus size={13} strokeWidth={2} />
            {t("appSettings.envVarsAdd")}
          </button>

          <div style={error ? s.envVarError : s.envVarStatus}>
            {error
              ? error
              : saving
                ? t("common.saving")
                : saved
                  ? t("common.saved")
                  : t("appSettings.envVarsAutoSaveHint")}
          </div>
        </>
      )}
    </div>
  );
}
