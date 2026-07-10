import type React from "react";
import { createElement } from "react";
import { APP_PLATFORM } from "../../platform";
import s from "../../styles";
import type { AgentKey } from "./types";

export const shortcutKeyGroupStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  lineHeight: 1,
  verticalAlign: "middle",
};

export const shortcutKeyStyle: React.CSSProperties = {
  ...s.kbd,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 0,
  height: "auto",
  padding: 0,
  border: "none",
  borderRadius: 0,
  background: "transparent",
  color: "var(--text-secondary)",
  opacity: 1,
  fontSize: "inherit",
  lineHeight: "inherit",
  verticalAlign: "middle",
};

export function renderShortcutKeys(keys: string[], keyStyle = shortcutKeyStyle) {
  return createElement(
    "span",
    { style: shortcutKeyGroupStyle, "aria-hidden": true },
    keys.map((key, index) =>
      createElement("kbd", { key: `${key}-${index}`, style: keyStyle }, key),
    ),
  );
}

export function getAgentSettingsFilePath(agent: AgentKey): string {
  if (APP_PLATFORM === "windows") {
    if (agent === "claude") return "%USERPROFILE%\\.claude\\settings.json";
    if (agent === "codex") return "%USERPROFILE%\\.codex\\config.toml";
    return "%USERPROFILE%\\.pi\\agent\\settings.json";
  }

  if (agent === "claude") return "~/.claude/settings.json";
  if (agent === "codex") return "~/.codex/config.toml";
  return "~/.pi/agent/settings.json";
}

export function getAgentExecutablePlaceholder(agent: AgentKey): string {
  if (APP_PLATFORM === "windows") {
    if (agent === "claude") return "claude or C:\\Users\\<you>\\AppData\\Roaming\\npm\\claude.cmd";
    if (agent === "codex") return "codex or C:\\Users\\<you>\\AppData\\Roaming\\npm\\codex.cmd";
    return "pi or C:\\Users\\<you>\\AppData\\Roaming\\npm\\pi.cmd";
  }

  if (APP_PLATFORM === "macos") {
    if (agent === "claude") return "claude or /opt/homebrew/bin/claude";
    if (agent === "codex") return "codex or /opt/homebrew/bin/codex";
    return "pi or /opt/homebrew/bin/pi";
  }

  if (agent === "claude") return "claude or /usr/local/bin/claude";
  if (agent === "codex") return "codex or /usr/local/bin/codex";
  return "pi or /usr/local/bin/pi";
}
