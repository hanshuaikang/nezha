import type { LucideIcon } from "lucide-react";
import type { SendShortcut } from "../../shortcuts";

export type NavKey =
  | "general"
  | "theme"
  | "fonts"
  | "shortcuts"
  | "hooks"
  | "skills"
  | "about"
  | "thanks"
  | "community"
  | "claude"
  | "codex";

export interface HookInstallStatus {
  node_path: string;
  script_path: string;
  claude_installed: boolean;
  codex_installed: boolean;
  error?: string;
}

export type HookReadinessReason = "ok" | "no_node" | "not_installed" | "version_too_low";

export interface HookAgentReadiness {
  agent: "claude" | "codex";
  usable: boolean;
  reason: HookReadinessReason;
  detectedVersion: string;
  minVersion: string;
}

export interface AppSettings {
  claude_path: string;
  codex_path: string;
  send_shortcut: SendShortcut;
  terminal_shift_enter_newline: boolean;
  claude_force_default_tui: boolean;
  terminal_scrollback: number;
}

export interface AgentVersions {
  claude_version: string;
  codex_version: string;
}

export type AgentKey = "claude" | "codex";

export type NavSection = "application" | "agents" | "community" | "about";

export interface AppSettingsNavItem {
  key: NavKey;
  labelKey: string;
  section: NavSection;
  icon?: LucideIcon;
  /** 覆盖图标描边颜色（默认 var(--text-secondary)） */
  iconColor?: string;
  /** 图标填充色（默认 "none"，传入颜色即为实心图标） */
  iconFill?: string;
  logo?: string;
  filePath?: string;
  lang?: string;
  /** 设置后点击该项不切换面板，而是用浏览器打开此外链 */
  url?: string;
}

export const APP_SETTINGS_CHANGED_EVENT = "nezha:app-settings-changed";
export const SKILL_HUB_CHANGED_EVENT = "nezha:skill-hub-changed";
export const OPEN_APP_SETTINGS_EVENT = "nezha:open-app-settings";

/**
 * `SKILL_HUB_CHANGED_EVENT` 可携带 `detail.projects`（来自后端 `set_skill_hub_path` 的完整列表），
 * App.tsx 收到后会把它作为权威列表替换前端 state，避免竞态覆盖 hub project。
 */
export interface SkillHubChangedDetail {
  projects?: unknown;
}
