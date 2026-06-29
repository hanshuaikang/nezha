import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, Pencil } from "lucide-react";
import { useI18n } from "../../i18n";
import s from "../../styles";
import { AgentPathSection } from "./AgentPathSection";
import type { AgentKey } from "./types";
import type { ThemeVariant } from "../../types";

import type { Highlighter } from "shiki";
let _highlighterPromise: Promise<Highlighter> | null = null;
function getHighlighter(): Promise<Highlighter> {
  if (!_highlighterPromise) {
    _highlighterPromise = import("shiki").then(({ createHighlighter }) =>
      createHighlighter({
        themes: ["github-dark", "github-light", "solarized-light"],
        langs: ["json", "toml"],
      }),
    );
  }
  return _highlighterPromise!;
}

type FileState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "loaded"; content: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function AgentConfigPanel({
  agentKey,
  filePath,
  lang,
  themeVariant,
}: {
  agentKey: AgentKey;
  filePath: string;
  lang: string;
  themeVariant: ThemeVariant;
}) {
  const shikiTheme =
    themeVariant === "dark" || themeVariant === "midnight"
      ? "github-dark"
      : themeVariant === "eyecare"
        ? "solarized-light"
        : "github-light";
  const { t } = useI18n();
  const [resolvedFilePath, setResolvedFilePath] = useState(filePath);
  const [fileState, setFileState] = useState<FileState>({ status: "loading" });
  const [original, setOriginal] = useState("");
  const [editing, setEditing] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [highlightError, setHighlightError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Load file
  useEffect(() => {
    setResolvedFilePath(filePath);
    invoke<string>("get_agent_config_file_path", { agent: agentKey })
      .then((resolvedPath) => setResolvedFilePath(resolvedPath))
      .catch(() => setResolvedFilePath(filePath));
  }, [agentKey, filePath]);

  useEffect(() => {
    setFileState({ status: "loading" });
    setEditing(false);
    setHighlighted(null);
    setHighlightError(null);
    setError(null);
    setSaved(false);
    invoke<string | null>("read_agent_config_file", { agent: agentKey })
      .then((c) => {
        if (c === null) {
          setFileState({ status: "missing" });
        } else {
          setFileState({ status: "loaded", content: c });
          setOriginal(c);
        }
      })
      .catch((e) => setError(String(e)));
  }, [agentKey]);

  // Re-highlight when content or theme changes
  useEffect(() => {
    if (fileState.status !== "loaded") return;
    let cancelled = false;
    setHighlighted(null);
    setHighlightError(null);
    getHighlighter()
      .then((hl) => {
        const html = hl.codeToHtml(fileState.content, {
          lang,
          theme: shikiTheme,
        });
        if (!cancelled) {
          setHighlighted(html);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setHighlightError(String(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fileState, lang, shikiTheme]);

  async function handleSave() {
    if (fileState.status !== "loaded") return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await invoke("write_agent_config_file", { agent: agentKey, content: fileState.content });
      setOriginal(fileState.content);
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setFileState({ status: "loaded", content: original });
    setEditing(false);
  }

  const isDirty = fileState.status === "loaded" && fileState.content !== original;

  return (
    <>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflowY: "auto",
          overflowX: "hidden",
          display: "flex",
          flexDirection: "column",
          padding: "18px 20px 14px",
        }}
      >
        {!editing && (
          <>
            <AgentPathSection agentKey={agentKey} />

            <div
              style={{
                height: 1,
                background: "var(--border-dim)",
                margin: "4px 0 16px",
                flexShrink: 0,
              }}
            />

            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 10,
                flexShrink: 0,
              }}
            >
              {t("appSettings.configFile")}
            </div>
          </>
        )}

        {/* File path + edit button row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexShrink: 0 }}>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--text-hint)",
              fontFamily: "var(--font-mono)",
              background: "var(--bg-subtle)",
              border: "1px solid var(--border-dim)",
              borderRadius: 6,
              padding: "4px 9px",
            }}
          >
            {resolvedFilePath}
          </div>
          {fileState.status === "loaded" && !editing && (
            <button
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 10px",
                background: "none",
                border: "1px solid var(--border-medium)",
                borderRadius: 6,
                fontSize: 12,
                color: "var(--text-secondary)",
                cursor: "pointer",
              }}
              onClick={() => setEditing(true)}
            >
              <Pencil size={12} />
              {t("common.edit")}
            </button>
          )}
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
        </div>

        {error && (
          <div style={{ color: "var(--danger)", fontSize: 12.5, marginBottom: 10 }}>{error}</div>
        )}

        {highlightError && fileState.status === "loaded" && !editing && (
          <div style={{ color: "var(--text-hint)", fontSize: 12, marginBottom: 10 }}>
            {t("appSettings.syntaxHighlightUnavailable")}
          </div>
        )}

        {fileState.status === "loading" && !error && (
          <div style={{ color: "var(--text-hint)", fontSize: 13 }}>{t("common.loading")}</div>
        )}

        {fileState.status === "missing" && (
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
            {t("appSettings.configFileNotFound", { path: resolvedFilePath })}
          </div>
        )}

        {fileState.status === "loaded" && !editing && (
          highlighted ? (
            <div
              className="file-viewer-code"
              style={{
                flex: 1,
                minHeight: 280,
                minWidth: 0,
                overflow: "auto",
                borderRadius: 8,
                border: "1px solid var(--border-dim)",
                fontSize: 12.5,
              }}
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
          ) : (
            <pre
              style={{
                flex: 1,
                minHeight: 280,
                minWidth: 0,
                margin: 0,
                overflow: "auto",
                padding: "14px 16px",
                borderRadius: 8,
                border: "1px solid var(--border-dim)",
                background: "var(--bg-panel)",
                color: "var(--text-primary)",
                fontSize: 12.5,
                fontFamily: "var(--font-mono)",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
              dangerouslySetInnerHTML={{ __html: escapeHtml(fileState.content) }}
            />
          )
        )}

        {fileState.status === "loaded" && editing && (
          <textarea
            autoFocus
            style={{
              ...s.modalTextarea,
              flex: 1,
              width: "100%",
              minHeight: 300,
              resize: "none",
              boxSizing: "border-box",
              caretColor: "var(--text-primary)",
            }}
            value={fileState.content}
            onChange={(e) => setFileState({ status: "loaded", content: e.target.value })}
            spellCheck={false}
          />
        )}
      </div>

      {editing && (
        <div style={s.settingsFooter}>
          <button style={s.modalCancelBtn} onClick={handleCancel}>
            {t("common.cancel")}
          </button>
          <button
            style={{ ...s.modalSaveBtn, opacity: saving || !isDirty ? 0.5 : 1 }}
            onClick={handleSave}
            disabled={saving || !isDirty}
          >
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      )}
    </>
  );
}
