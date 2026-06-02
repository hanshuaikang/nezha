import type { LucideIcon } from "lucide-react";
import type { SendShortcut } from "../../shortcuts";

export type NavKey =
  | "general"
  | "theme"
  | "fonts"
  | "shortcuts"
  | "hooks"
  | "about"
  | "claude"
  | "codex";

export interface HookInstallStatus {
  node_path: string;
  script_path: string;
  claude_installed: boolean;
  codex_installed: boolean;
  error?: string;
}

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

export type NavSection = "application" | "agents" | "about";

export interface AppSettingsNavItem {
  key: NavKey;
  labelKey: string;
  section: NavSection;
  icon?: LucideIcon;
  logo?: string;
  filePath?: string;
  lang?: string;
}

export const APP_SETTINGS_CHANGED_EVENT = "nezha:app-settings-changed";
