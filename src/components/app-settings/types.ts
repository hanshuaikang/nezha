import type { SendShortcut } from "../../shortcuts";

export type NavKey = "general" | "theme" | "shortcuts" | "about" | "claude" | "codex";

export interface AppSettings {
  claude_path: string;
  codex_path: string;
  send_shortcut: SendShortcut;
  terminal_font_family: string;
  terminal_font_size: number;
  terminal_line_height: number;
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

export const DEFAULT_TERMINAL_FONT_FAMILY = "monospace";
export const DEFAULT_TERMINAL_FONT_SIZE = 14;
export const DEFAULT_TERMINAL_LINE_HEIGHT = 1.38;
