import { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import {
  X,
  Pencil,
  Check,
  RefreshCw,
  ExternalLink,
  Star,
  Monitor,
} from "lucide-react";
import type { ThemeMode } from "../types";
import { APP_PLATFORM } from "../platform";
import s from "../styles";
import claudeLogo from "../assets/claude.svg";
import chatgptLogo from "../assets/chatgpt.svg";
import appLogo from "../assets/app-logo.png";

// Reuse the same singleton highlighter as FileViewer
import type { Highlighter } from "shiki";
let _highlighterPromise: Promise<Highlighter> | null = null;
function getHighlighter(): Promise<Highlighter> {
  if (!_highlighterPromise) {
    _highlighterPromise = import("shiki").then(({ createHighlighter }) =>
      createHighlighter({ themes: ["github-dark", "github-light"], langs: ["json", "toml"] }),
    );
  }
  return _highlighterPromise!;
}

type NavKey = "general" | "theme" | "about" | "claude" | "codex";

interface AppSettings {
  claude_path: string;
  codex_path: string;
}

interface AgentVersions {
  claude_version: string;
  codex_version: string;
}

type AgentKey = "claude" | "codex";

const GITHUB_REPO_URL = "https://github.com/hanshuaikang/nezha";

function getAgentSettingsFilePath(agent: AgentKey): string {
  if (APP_PLATFORM === "windows") {
    return agent === "claude"
      ? "%USERPROFILE%\\.claude\\settings.json"
      : "%USERPROFILE%\\.codex\\config.toml";
  }

  return agent === "claude" ? "~/.claude/settings.json" : "~/.codex/config.toml";
}

function getAgentExecutablePlaceholder(agent: AgentKey): string {
  if (APP_PLATFORM === "windows") {
    return agent === "claude"
      ? "claude or C:\\Users\\<you>\\AppData\\Roaming\\npm\\claude.cmd"
      : "codex or C:\\Users\\<you>\\AppData\\Roaming\\npm\\codex.cmd";
  }

  if (APP_PLATFORM === "macos") {
    return agent === "claude"
      ? "claude or /opt/homebrew/bin/claude"
      : "codex or /opt/homebrew/bin/codex";
  }

  return agent === "claude"
    ? "claude or /usr/local/bin/claude"
    : "codex or /usr/local/bin/codex";
}

const NAV_ITEMS: Array<{
  key: NavKey;
  label: string;
  logo?: string;
  filePath?: string;
  lang?: string;
}> = [
  { key: "general", label: "General" },
  { key: "theme", label: "Theme" },
  { key: "about", label: "About", logo: appLogo },
  {
    key: "claude",
    label: "Claude Code",
    logo: claudeLogo,
    filePath: getAgentSettingsFilePath("claude"),
    lang: "json",
  },
  {
    key: "codex",
    label: "Codex",
    logo: chatgptLogo,
    filePath: getAgentSettingsFilePath("codex"),
    lang: "toml",
  },
];

interface ThemePanelProps {
  themeMode: ThemeMode;
  systemPrefersDark: boolean;
  onThemeModeChange: (mode: ThemeMode) => void;
}

function ThemePanel({ themeMode, systemPrefersDark, onThemeModeChange }: ThemePanelProps) {
  const manualThemeModes: Array<Extract<ThemeMode, "dark" | "light">> = ["dark", "light"];
  const selectedLabel =
    themeMode === "system"
      ? `Following system · ${systemPrefersDark ? "Dark" : "Light"}`
      : `Manual · ${themeMode === "dark" ? "Dark" : "Light"}`;

  function handleSystemThemeToggle() {
    onThemeModeChange(themeMode === "system" ? "light" : "system");
  }

  function handleManualThemeKeyDown(
    mode: Extract<ThemeMode, "dark" | "light">,
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) {
    const currentIndex = manualThemeModes.indexOf(mode);
    if (currentIndex === -1) {
      return;
    }

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      onThemeModeChange(manualThemeModes[(currentIndex + 1) % manualThemeModes.length]);
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      onThemeModeChange(manualThemeModes[(currentIndex - 1 + manualThemeModes.length) % manualThemeModes.length]);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      onThemeModeChange(manualThemeModes[0]);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      onThemeModeChange(manualThemeModes[manualThemeModes.length - 1]);
    }
  }

  function renderThemeOption({
    mode,
    title,
    description,
    previewBackground,
    previewBorder,
    previewAccent,
  }: {
    mode: Extract<ThemeMode, "dark" | "light">;
    title: string;
    description: string;
    previewBackground: string;
    previewBorder: string;
    previewAccent: string;
  }) {
    const selected = themeMode === mode;

    return (
      <button
        type="button"
        onClick={() => onThemeModeChange(mode)}
        onKeyDown={(event) => handleManualThemeKeyDown(mode, event)}
        role="radio"
        aria-checked={selected}
        aria-label={`${title} theme`}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: 10,
          padding: 14,
          borderRadius: 12,
          border: `1px solid ${selected ? "var(--accent)" : "var(--border-medium)"}`,
          background: selected ? "var(--accent-subtle)" : "var(--bg-subtle)",
          cursor: "pointer",
          textAlign: "left",
          boxShadow: selected ? "0 0 0 1px var(--accent-subtle)" : "none",
          transition: "border-color 0.12s, background 0.12s, box-shadow 0.12s",
        }}
      >
        <div
          style={{
            width: "100%",
            height: 106,
            borderRadius: 10,
            border: `1px solid ${previewBorder}`,
            background: previewBackground,
            padding: 8,
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            gap: 7,
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", gap: 5 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: previewAccent,
                opacity: 0.9,
              }}
            />
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: previewAccent,
                opacity: 0.65,
              }}
            />
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: previewAccent,
                opacity: 0.4,
              }}
            />
          </div>
          <div
            style={{
              flex: 1,
              display: "grid",
              gridTemplateColumns: mode === "dark" ? "28px 1fr" : "24px 1fr",
              gap: 7,
            }}
          >
            <div
              style={{
                borderRadius: 7,
                background:
                  mode === "dark"
                    ? "rgba(255,255,255,0.05)"
                    : "rgba(23,27,36,0.06)",
                border:
                  mode === "dark"
                    ? "1px solid rgba(255,255,255,0.06)"
                    : "1px solid rgba(23,27,36,0.06)",
                display: "flex",
                flexDirection: "column",
                gap: 5,
                padding: "7px 5px",
              }}
            >
              <span
                style={{
                  height: 5,
                  borderRadius: 999,
                  background: previewAccent,
                  opacity: mode === "dark" ? 0.55 : 0.3,
                }}
              />
              <span
                style={{
                  height: 5,
                  borderRadius: 999,
                  background: previewAccent,
                  opacity: mode === "dark" ? 0.28 : 0.16,
                }}
              />
              <span
                style={{
                  height: 5,
                  borderRadius: 999,
                  background: previewAccent,
                  opacity: mode === "dark" ? 0.2 : 0.12,
                }}
              />
            </div>
            <div
              style={{
                borderRadius: 8,
                background:
                  mode === "dark"
                    ? "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))"
                    : "linear-gradient(180deg, rgba(23,27,36,0.1), rgba(23,27,36,0.04))",
                border:
                  mode === "dark"
                    ? "1px solid rgba(255,255,255,0.08)"
                    : "1px solid rgba(23,27,36,0.08)",
                padding: 8,
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 34,
                    height: 6,
                    borderRadius: 999,
                    background: previewAccent,
                    opacity: mode === "dark" ? 0.75 : 0.2,
                  }}
                />
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 4,
                    background: mode === "dark" ? "rgba(255,255,255,0.12)" : "#ffffff",
                    border:
                      mode === "dark"
                        ? "1px solid rgba(255,255,255,0.08)"
                        : "1px solid rgba(23,27,36,0.08)",
                  }}
                />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.15fr 0.85fr",
                  gap: 6,
                  flex: 1,
                }}
              >
                <div
                  style={{
                    borderRadius: 6,
                    background: mode === "dark" ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.9)",
                    border:
                      mode === "dark"
                        ? "1px solid rgba(255,255,255,0.06)"
                        : "1px solid rgba(23,27,36,0.06)",
                  }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <span
                    style={{
                      height: 18,
                      borderRadius: 6,
                      background:
                        mode === "dark"
                          ? "rgba(255,255,255,0.09)"
                          : "rgba(255,255,255,0.92)",
                      border:
                        mode === "dark"
                          ? "1px solid rgba(255,255,255,0.06)"
                          : "1px solid rgba(23,27,36,0.06)",
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      borderRadius: 6,
                      background:
                        mode === "dark"
                          ? "rgba(255,255,255,0.05)"
                          : "rgba(255,255,255,0.82)",
                      border:
                        mode === "dark"
                          ? "1px solid rgba(255,255,255,0.05)"
                          : "1px solid rgba(23,27,36,0.05)",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              {title}
            </span>
            {selected && <Check size={14} color="var(--accent)" />}
          </div>
          <span style={{ fontSize: 11.5, color: "var(--text-hint)", lineHeight: 1.45 }}>
            {description}
          </span>
        </div>
      </button>
    );
  }

  return (
    <div
      style={{
        ...s.settingsBody,
        display: "flex",
        flexDirection: "column",
        gap: 18,
        padding: "20px",
      }}
    >
      <button
        type="button"
        onClick={handleSystemThemeToggle}
        role="switch"
        aria-checked={themeMode === "system"}
        aria-label="Follow system theme"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          padding: "16px 18px",
          borderRadius: 12,
          border: `1px solid ${themeMode === "system" ? "var(--accent)" : "var(--border-dim)"}`,
          background: themeMode === "system" ? "var(--accent-subtle)" : "var(--bg-subtle)",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div
            style={{
              flexShrink: 0,
              width: 48,
              height: 28,
              borderRadius: 999,
              border: "none",
              padding: 3,
              background: themeMode === "system" ? "var(--accent)" : "var(--border-medium)",
              boxShadow:
                themeMode === "system" ? "0 0 0 4px var(--accent-subtle)" : "inset 0 0 0 1px var(--border-dim)",
              transition: "background 0.12s, box-shadow 0.12s",
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                background: "#fff",
                color: themeMode === "system" ? "var(--accent)" : "var(--text-secondary)",
                transform: themeMode === "system" ? "translateX(20px)" : "translateX(0)",
                transition: "transform 0.12s ease",
              }}
            >
              <Monitor size={12} />
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 3,
              minWidth: 0,
              padding: 0,
              textAlign: "left",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Follow System
            </span>
          </div>
        </div>
        <div
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            borderRadius: 999,
            background: "var(--bg-card)",
            border: "1px solid var(--border-medium)",
            color: "var(--text-secondary)",
            fontSize: 11.5,
            fontWeight: 600,
          }}
        >
          {themeMode === "system" && <Check size={13} color="var(--accent)" />}
          {selectedLabel}
        </div>
      </button>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
          Manual Theme
        </div>
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}
          role="radiogroup"
          aria-label="Manual theme"
        >
          {renderThemeOption({
            mode: "dark",
            title: "Dark",
            description: "Always use the dark interface.",
            previewBackground: "#11151d",
            previewBorder: "rgba(255,255,255,0.08)",
            previewAccent: "#f1f4fb",
          })}
          {renderThemeOption({
            mode: "light",
            title: "Light",
            description: "Always use the light interface.",
            previewBackground: "#f5f7fb",
            previewBorder: "rgba(23,27,36,0.08)",
            previewAccent: "#171b24",
          })}
        </div>
      </div>
    </div>
  );
}

// ── General Panel ─────────────────────────────────────────────────────────────

function GeneralPanel() {
  const [settings, setSettings] = useState<AppSettings>({ claude_path: "", codex_path: "" });
  const [original, setOriginal] = useState<AppSettings>({ claude_path: "", codex_path: "" });
  const [versions, setVersions] = useState<AgentVersions>({
    claude_version: "",
    codex_version: "",
  });
  const [loading, setLoading] = useState(true);
  const [detectingPaths, setDetectingPaths] = useState(false);
  const [refreshingVersions, setRefreshingVersions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadVersions(nextSettings: AppSettings) {
    setRefreshingVersions(true);
    try {
      const detected = await invoke<AgentVersions>("detect_agent_versions_for_settings", {
        settings: nextSettings,
      });
      setVersions(detected);
    } catch (e) {
      setError(String(e));
    } finally {
      setRefreshingVersions(false);
    }
  }

  useEffect(() => {
    invoke<AppSettings>("load_app_settings")
      .then(async (loadedSettings) => {
        setSettings(loadedSettings);
        setOriginal(loadedSettings);
        await loadVersions(loadedSettings);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function handleDetect() {
    setDetectingPaths(true);
    setError(null);
    try {
      const detected = await invoke<AppSettings>("detect_agent_paths");
      setSettings(detected);
      await loadVersions(detected);
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
      await invoke("save_app_settings", { settings });
      setOriginal(settings);
      await loadVersions(settings);
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

        {loading ? (
          <div style={{ color: "var(--text-hint)", fontSize: 13 }}>Loading...</div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 18,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                Agent Installation Paths
              </span>
              <div style={{ display: "flex", gap: 8 }}>
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
                  {detectingPaths ? "Detecting..." : "Auto Detect"}
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
                  {refreshingVersions ? "Refreshing..." : "Refresh Versions"}
                </button>
              </div>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Claude Code Path</label>
              <input
                style={inputStyle}
                value={settings.claude_path}
                onChange={(e) => setSettings((prev) => ({ ...prev, claude_path: e.target.value }))}
                placeholder={getAgentExecutablePlaceholder("claude")}
                spellCheck={false}
              />
              <span style={hintStyle}>Leave empty to use claude from the system PATH.</span>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Codex Path</label>
              <input
                style={inputStyle}
                value={settings.codex_path}
                onChange={(e) => setSettings((prev) => ({ ...prev, codex_path: e.target.value }))}
                placeholder={getAgentExecutablePlaceholder("codex")}
                spellCheck={false}
              />
              <span style={hintStyle}>Leave empty to use codex from the system PATH.</span>
            </div>

            <div style={{ ...fieldStyle, marginBottom: 0 }}>
              <label style={labelStyle}>Installed Versions</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-hint)", marginBottom: 4 }}>
                    Claude Code
                  </div>
                  <input
                    style={inputStyle}
                    value={versions.claude_version}
                    readOnly
                    placeholder="Not detected"
                    spellCheck={false}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-hint)", marginBottom: 4 }}>
                    Codex
                  </div>
                  <input
                    style={inputStyle}
                    value={versions.codex_version}
                    readOnly
                    placeholder="Not detected"
                    spellCheck={false}
                  />
                </div>
              </div>
              <span style={hintStyle}>
                Versions are detected from the configured executable path or the system PATH.
              </span>
            </div>
          </>
        )}
      </div>

      <div style={s.settingsFooter}>
        {saved && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              color: "var(--success, #34c759)",
              marginRight: "auto",
            }}
          >
            <Check size={12} /> Saved
          </span>
        )}
        <button
          style={{ ...s.modalSaveBtn, opacity: saving || !isDirty ? 0.5 : 1 }}
          onClick={handleSave}
          disabled={saving || !isDirty}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </>
  );
}

function AboutPanel() {
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    getVersion()
      .then((version) => setAppVersion(version))
      .catch(() => setAppVersion("Unknown"));
  }, []);

  return (
    <div
      style={{
        ...s.settingsBody,
        display: "flex",
        flexDirection: "column",
        padding: "20px",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 16,
          padding: "18px",
          borderRadius: 12,
          border: "1px solid var(--border-dim)",
          background: "var(--bg-subtle)",
        }}
      >
        <img
          src={appLogo}
          alt="NeZha logo"
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            flexShrink: 0,
            objectFit: "cover",
          }}
        />

        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>NeZha</div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4 }}>
              Desktop task manager for AI coding agents
            </div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-hint)", marginBottom: 4 }}>Version</div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {appVersion || "Loading..."}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: "var(--text-hint)", marginBottom: 4 }}>GitHub</div>
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: "var(--accent)",
                  fontSize: 12.5,
                  textDecoration: "none",
                  wordBreak: "break-all",
                }}
              >
                {GITHUB_REPO_URL}
                <ExternalLink size={13} />
              </a>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "10px 12px",
              borderRadius: 10,
              background: "color-mix(in srgb, var(--accent) 8%, transparent)",
              color: "var(--text-secondary)",
              fontSize: 12.5,
              lineHeight: 1.5,
            }}
          >
            <Star size={14} color="var(--accent)" style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              If you think NeZha is helpful, please consider starring this project on GitHub.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Agent Config Panel ────────────────────────────────────────────────────────

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

function AgentConfigPanel({
  agentKey,
  filePath,
  lang,
  isDark,
}: {
  agentKey: AgentKey;
  filePath: string;
  lang: string;
  isDark: boolean;
}) {
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
          theme: isDark ? "github-dark" : "github-light",
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
  }, [fileState, lang, isDark]);

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
          ...s.settingsBody,
          display: "flex",
          flexDirection: "column",
          gap: 0,
          padding: "14px 20px",
        }}
      >
        {/* File path + edit button row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
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
              Edit
            </button>
          )}
          {saved && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                color: "var(--success, #34c759)",
              }}
            >
              <Check size={12} /> Saved
            </span>
          )}
        </div>

        {error && (
          <div style={{ color: "var(--danger)", fontSize: 12.5, marginBottom: 10 }}>{error}</div>
        )}

        {highlightError && fileState.status === "loaded" && !editing && (
          <div style={{ color: "var(--text-hint)", fontSize: 12, marginBottom: 10 }}>
            Syntax highlighting is unavailable. Showing plain text instead.
          </div>
        )}

        {fileState.status === "loading" && !error && (
          <div style={{ color: "var(--text-hint)", fontSize: 13 }}>Loading...</div>
        )}

        {fileState.status === "missing" && (
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Config file not found: {resolvedFilePath}
          </div>
        )}

        {fileState.status === "loaded" && !editing && (
          highlighted ? (
            <div
              className="file-viewer-code"
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
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
                minHeight: 0,
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
              caretColor: isDark ? "#F1F4FB" : "#171B24",
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
            Cancel
          </button>
          <button
            style={{ ...s.modalSaveBtn, opacity: saving || !isDirty ? 0.5 : 1 }}
            onClick={handleSave}
            disabled={saving || !isDirty}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      )}
    </>
  );
}

// ── Main Dialog ───────────────────────────────────────────────────────────────

export function AppSettingsDialog({
  onClose,
  isDark,
  themeMode,
  systemPrefersDark,
  onThemeModeChange,
}: {
  onClose: () => void;
  isDark: boolean;
  themeMode: ThemeMode;
  systemPrefersDark: boolean;
  onThemeModeChange: (mode: ThemeMode) => void;
}) {
  const [activeNav, setActiveNav] = useState<NavKey>("general");

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  const activeItem = NAV_ITEMS.find((n) => n.key === activeNav)!;

  return (
    <div style={s.modalOverlay} onClick={handleOverlayClick}>
      <div style={s.modalBox}>
        {/* Left nav */}
        <div style={s.settingsNav}>
          <div style={s.settingsNavTitle}>App Settings</div>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              style={{
                ...s.settingsNavItem,
                background: activeNav === item.key ? "var(--bg-hover)" : "none",
                color: activeNav === item.key ? "var(--text-primary)" : "var(--text-secondary)",
                fontWeight: activeNav === item.key ? 600 : 500,
              }}
              onClick={() => setActiveNav(item.key)}
            >
              {item.logo ? (
                <img
                  src={item.logo}
                  style={{ width: 14, height: 14, opacity: item.key === "codex" ? 0.7 : 1 }}
                />
              ) : item.key === "theme" ? (
                <Monitor size={14} strokeWidth={1.8} />
              ) : (
                <span
                  style={{
                    width: 14,
                    height: 14,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                  }}
                >
                  ⚙
                </span>
              )}
              {item.label}
            </button>
          ))}
        </div>

        {/* Right content */}
        <div style={s.settingsContent}>
          <div style={s.settingsContentHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {activeItem.logo ? (
                <img
                  src={activeItem.logo}
                  style={{ width: 16, height: 16, opacity: activeItem.key === "codex" ? 0.7 : 1 }}
                />
              ) : activeItem.key === "theme" ? (
                <Monitor size={16} strokeWidth={1.8} color="var(--text-secondary)" />
              ) : (
                <span style={{ fontSize: 15 }}>⚙</span>
              )}
              <span style={s.settingsContentTitle}>{activeItem.label}</span>
            </div>
            <button style={s.modalCloseBtn} onClick={onClose} title="Close">
              <X size={16} strokeWidth={2} />
            </button>
          </div>

          {activeNav === "general" ? (
            <GeneralPanel key="general" />
          ) : activeNav === "theme" ? (
            <ThemePanel
              key="theme"
              themeMode={themeMode}
              systemPrefersDark={systemPrefersDark}
              onThemeModeChange={onThemeModeChange}
            />
          ) : activeNav === "about" ? (
            <AboutPanel key="about" />
          ) : (
            <AgentConfigPanel
              key={activeNav}
              agentKey={activeNav as AgentKey}
              filePath={activeItem.filePath!}
              lang={activeItem.lang!}
              isDark={isDark}
            />
          )}
        </div>
      </div>
    </div>
  );
}
