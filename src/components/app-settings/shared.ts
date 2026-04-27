import { APP_PLATFORM } from "../../platform";
import type { AgentKey } from "./types";

export function getAgentSettingsFilePath(agent: AgentKey): string {
  if (APP_PLATFORM === "windows") {
    return agent === "claude"
      ? "%USERPROFILE%\\.claude\\settings.json"
      : "%USERPROFILE%\\.codex\\config.toml";
  }

  return agent === "claude" ? "~/.claude/settings.json" : "~/.codex/config.toml";
}

export function getAgentExecutablePlaceholder(agent: AgentKey): string {
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
