export interface Project {
  id: string;
  name: string;
  path: string;
  branch?: string;
  lastOpenedAt: number;
}

export type AgentType = "claude" | "codex";
export type ThemeMode = "system" | "dark" | "light";
export type PermissionMode = "ask" | "auto_edit" | "full_access";
export type TaskStatus =
  | "todo"
  | "pending"
  | "running"
  | "input_required"
  | "done"
  | "failed"
  | "cancelled";

export interface Task {
  id: string;
  projectId: string;
  name?: string;
  prompt: string;
  agent: AgentType;
  permissionMode: PermissionMode;
  status: TaskStatus;
  createdAt: number;
  attentionRequestedAt?: number;
  starred?: boolean;
  failureReason?: string;
  codexSessionId?: string;
  codexSessionPath?: string;
  claudeSessionId?: string;
  claudeSessionPath?: string;
}

export const PERM_LABELS: Record<PermissionMode, string> = {
  ask: "Ask Permission",
  auto_edit: "Auto-edit",
  full_access: "Full Access",
};

export function permissionModeLabel(mode: PermissionMode, agent?: AgentType): string {
  if (agent === "codex" && mode === "auto_edit") {
    return "Auto Mode";
  }
  return PERM_LABELS[mode];
}

export interface PermissionConfig {
  default_mode: PermissionMode;
  max_mode: PermissionMode;
  confirm_full_access: boolean;
}

export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
}

export interface PromptTemplateConfig {
  templates: PromptTemplate[];
}

export interface ProjectConfig {
  agent: {
    default: AgentType;
    default_permission_mode?: PermissionMode;
    prompt_prefix: string;
    claude_version: string;
    codex_version: string;
  };
  permissions: PermissionConfig;
  prompt_templates: PromptTemplateConfig;
  git: { commit_prompt: string };
}

export interface NotificationSettings {
  task_status: boolean;
  permission_risk: boolean;
}

export interface BackupSettings {
  enabled: boolean;
  destination: string;
  retain: number;
}

export interface AppSettings {
  claude_path: string;
  codex_path: string;
  notifications: NotificationSettings;
  backup: BackupSettings;
}

const PERMISSION_RANK: Record<PermissionMode, number> = {
  ask: 0,
  auto_edit: 1,
  full_access: 2,
};

export function permissionModeRank(mode: PermissionMode): number {
  return PERMISSION_RANK[mode];
}

export function isPermissionMode(value: string): value is PermissionMode {
  return value === "ask" || value === "auto_edit" || value === "full_access";
}

export function isAgentType(value: string): value is AgentType {
  return value === "claude" || value === "codex";
}

export function isPermissionAllowed(requested: PermissionMode, maxMode: PermissionMode): boolean {
  return permissionModeRank(requested) <= permissionModeRank(maxMode);
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Todo",
  pending: "Pending",
  running: "Running...",
  input_required: "Needs confirmation",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function isActiveTaskStatus(status: TaskStatus): boolean {
  return status === "pending" || status === "running" || status === "input_required";
}

// ── Notifications ────────────────────────────────────────────────────────────

export interface NotificationItem {
  id: string;
  notifType: "update" | "announcement" | "warning" | string;
  level: "info" | "warning" | "error" | string;
  title: string;
  body: string;
  url: string | null;
  createdAt: string;
  popup: boolean;
  isRead: boolean;
}

export interface NotificationResult {
  notifications: NotificationItem[];
  unreadCount: number;
  hasUnreadPopup: boolean;
}

export interface UsageWindow {
  usedPercent: number;
  remainingPercent: number;
  resetAt?: number | null;
}

export interface ClaudeUsageData {
  fiveHour?: UsageWindow | null;
  sevenDay?: UsageWindow | null;
}

export interface CodexUsageData {
  email?: string | null;
  planType?: string | null;
  primary?: UsageWindow | null;
  secondary?: UsageWindow | null;
}

export type UsageSource<T> =
  | { status: "available"; data: T }
  | { status: "unavailable"; reason: string };

export interface UsageSnapshot {
  claude: UsageSource<ClaudeUsageData>;
  codex: UsageSource<CodexUsageData>;
  fetchedAt: number;
}
