import type { SendShortcut } from "../../shortcuts";

export type NavKey = "general" | "theme" | "shortcuts" | "about" | "claude" | "codex";

export interface AppSettings {
  claude_path: string;
  codex_path: string;
  send_shortcut: SendShortcut;
}

export interface AgentVersions {
  claude_version: string;
  codex_version: string;
}

export type AgentKey = "claude" | "codex";

export interface AppSettingsNavItem {
  key: NavKey;
  labelKey: string;
  logo?: string;
  filePath?: string;
  lang?: string;
}

export const APP_SETTINGS_CHANGED_EVENT = "nezha:app-settings-changed";
