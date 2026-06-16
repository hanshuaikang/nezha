export interface Project {
  id: string;
  name: string;
  path: string;
  branch?: string;
  lastOpenedAt: number;
  /** 为 true 时不在左侧常驻竖条显示，仅可从首页或「展开全部」抽屉访问。缺省=常驻。 */
  hiddenFromRail?: boolean;
}

/** 单个 git 工作目录。
 * - 单仓库项目：根目录自身即 git，roots = [{ path: project.path, name: ".", isRoot: true }]
 * - 多仓库工作区（如根目录非 git，但下面有多个子 git 目录）：roots = 每个子目录一项
 * - 完全不是 git：roots = []
 */
export interface GitRoot {
  path: string;
  name: string;
  isRoot: boolean;
}

export type AgentType = "claude" | "codex";
export type ThemeMode = "system" | "dark" | "light" | "eyecare" | "midnight";
export type ThemeVariant = "dark" | "light" | "eyecare" | "midnight";
export type PermissionMode = "ask" | "auto_edit" | "full_access";
export type TaskDisplayWindow = 3 | 7 | 15 | 30 | "all";

export const TASK_DISPLAY_WINDOW_VALUES = [3, 7, 15, 30, "all"] as const;
export const DEFAULT_TASK_DISPLAY_WINDOW: TaskDisplayWindow = 3;

export function normalizeTaskDisplayWindow(value: unknown): TaskDisplayWindow {
  if (value === "all") return "all";
  const parsed = typeof value === "number" ? value : Number(value);
  return TASK_DISPLAY_WINDOW_VALUES.includes(parsed as TaskDisplayWindow)
    ? (parsed as TaskDisplayWindow)
    : DEFAULT_TASK_DISPLAY_WINDOW;
}

export type TerminalFontSize = number;

export const TERMINAL_FONT_SIZE_MIN = 10;
export const TERMINAL_FONT_SIZE_MAX = 20;
export const TERMINAL_FONT_SIZE_STEP = 1;
export const DEFAULT_TERMINAL_FONT_SIZE: TerminalFontSize = 12;

export function clampTerminalFontSize(value: number): TerminalFontSize {
  if (!Number.isFinite(value)) return DEFAULT_TERMINAL_FONT_SIZE;
  const snapped = Math.round(value / TERMINAL_FONT_SIZE_STEP) * TERMINAL_FONT_SIZE_STEP;
  return Math.min(TERMINAL_FONT_SIZE_MAX, Math.max(TERMINAL_FONT_SIZE_MIN, snapped));
}

export type TerminalScrollback = number;

export const TERMINAL_SCROLLBACK_MIN = 500;
export const TERMINAL_SCROLLBACK_MAX = 5000;
export const TERMINAL_SCROLLBACK_STEP = 500;
export const DEFAULT_TERMINAL_SCROLLBACK: TerminalScrollback = 1000;

export function clampTerminalScrollback(value: unknown): TerminalScrollback {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return DEFAULT_TERMINAL_SCROLLBACK;
  const snapped =
    Math.round(num / TERMINAL_SCROLLBACK_STEP) * TERMINAL_SCROLLBACK_STEP;
  return Math.min(TERMINAL_SCROLLBACK_MAX, Math.max(TERMINAL_SCROLLBACK_MIN, snapped));
}

export type FontFamily = string;
export const DEFAULT_UI_FONT: FontFamily =
  '"SF Pro Display", "IBM Plex Sans", "PingFang SC", "Noto Sans SC", sans-serif';

const MONO_FONT_WINDOWS: FontFamily = "Consolas";
const MONO_FONT_WINDOWS_STACK: FontFamily =
  'Consolas, "Cascadia Mono", "JetBrains Mono", "Fira Code", monospace';
const MONO_FONT_MAC: FontFamily =
  '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, ui-monospace, monospace';
const MONO_FONT_LINUX: FontFamily =
  '"JetBrains Mono", "Fira Code", "DejaVu Sans Mono", "Liberation Mono", ui-monospace, monospace';
const MONO_FONT_FALLBACK: FontFamily =
  '"JetBrains Mono", "Fira Code", ui-monospace, monospace';
const MONO_FONT_PR326_INITIAL_FALLBACK: FontFamily =
  '"JetBrains Mono", "Fira Code", "Cascadia Mono", Consolas, "SF Mono", Menlo, ui-monospace, monospace';

export function getDefaultMonoFont(): FontFamily {
  if (typeof navigator === "undefined") return MONO_FONT_FALLBACK;
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return MONO_FONT_WINDOWS;
  if (/Mac OS X|Macintosh/i.test(ua)) return MONO_FONT_MAC;
  if (/Linux/i.test(ua)) return MONO_FONT_LINUX;
  return MONO_FONT_FALLBACK;
}

// 老版本 App.tsx 的 useEffect 无差别把当时的默认 mono 字体也写进 localStorage,
// 导致后续改默认对老用户失效。所有"曾经作为自动默认值出现过"的字符串都视为
// "用户未自定义",在 getInitialFontFamily 里清掉后回退到当前平台默认。
const LEGACY_AUTO_MONO_FONTS: ReadonlySet<string> = new Set([
  MONO_FONT_FALLBACK,
  MONO_FONT_WINDOWS,
  MONO_FONT_WINDOWS_STACK,
  MONO_FONT_MAC,
  MONO_FONT_LINUX,
  MONO_FONT_PR326_INITIAL_FALLBACK,
]);

export function isAutoDefaultMonoFont(value: string): boolean {
  return LEGACY_AUTO_MONO_FONTS.has(value.trim());
}

export type TaskStatus =
  | "todo"
  | "pending"
  | "running"
  | "input_required"
  | "awaiting_review"
  | "detached"
  | "interrupted"
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
  /** 任务状态最近一次变更的时间戳；左侧任务列表按此字段排序与分组。缺省时回落到 createdAt。 */
  updatedAt?: number;
  attentionRequestedAt?: number;
  starred?: boolean;
  failureReason?: string;
  codexSessionId?: string;
  codexSessionPath?: string;
  claudeSessionId?: string;
  claudeSessionPath?: string;
  worktreePath?: string;
  worktreeBranch?: string;
  baseBranch?: string;
  /** worktree 所属的 sub-repo 路径（多仓库工作区中追踪 worktree 归属于哪个 git 根）。
   *  缺省视为与项目根相同，向后兼容旧 worktree。 */
  worktreeRepo?: string;
  /** worktree 已被合并或丢弃后置 true：保留分支/路径用于审计，但禁用 resume / 合并 / 丢弃 */
  worktreeDiscarded?: boolean;
  /** 任务完成时计算的相对 baseBranch merge-base 的累计新增行数（仅 worktree 任务） */
  additions?: number;
  /** 任务完成时计算的相对 baseBranch merge-base 的累计删除行数（仅 worktree 任务） */
  deletions?: number;
}

export const PERM_LABELS: Record<PermissionMode, string> = {
  ask: "Ask Permission",
  auto_edit: "Auto-edit",
  full_access: "Full Access",
};

export function permissionModeLabel(
  mode: PermissionMode,
  agent?: AgentType,
  askLabel = PERM_LABELS.ask,
): string {
  if (agent === "codex" && mode === "auto_edit") {
    return "Auto Mode";
  }
  if (mode === "ask") return askLabel;
  return PERM_LABELS[mode];
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Todo",
  pending: "Pending",
  running: "Running...",
  input_required: "Needs confirmation",
  awaiting_review: "Awaiting review",
  detached: "Terminal disconnected",
  interrupted: "Interrupted",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function isActiveTaskStatus(status: TaskStatus): boolean {
  return (
    status === "pending" ||
    status === "running" ||
    status === "input_required" ||
    status === "awaiting_review" ||
    status === "detached"
  );
}

// ── Notifications ────────────────────────────────────────────────────────────

export interface NotificationItem {
  id: string;
  level: "info" | "warning" | "error" | string;
  title: string;
  body: string;
  bodyZh: string | null;
  url: string | null;
  createdAt: string;
  isRead: boolean;
}

export interface NotificationResult {
  notifications: NotificationItem[];
  unreadCount: number;
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

// ── Skill Hub ────────────────────────────────────────────────────────────────

export interface SkillHubConfig {
  hubProjectId?: string;
  hubPath?: string;
  createdAt?: number;
}

export interface Skill {
  /** SKILL 目录名（权威标识） */
  name: string;
  /** frontmatter 的 name 字段，可与目录名不同 */
  displayName?: string;
  /** 解析后的 description，可能包含换行 */
  description?: string;
  /** skill 目录绝对路径 */
  path: string;
  /** frontmatter 解析失败时的错误说明 */
  hasError?: string;
}

export type SkillInstallationHealth = "ok" | "broken" | "diverged";

export interface SkillInstallation {
  skillName: string;
  projectId: string;
  agent: AgentType;
  installedAt: number;
  linkPath: string;
  targetPath: string;
  health?: SkillInstallationHealth;
}

export type SkillInstallStrategy = "detect" | "skip" | "overwrite" | "cancel";

export interface SkillConflictInfo {
  existingKind: "directory" | "file" | "symlink";
  existingTarget?: string;
  linkPath: string;
}

export interface SkillInstallResult {
  ok: boolean;
  conflict?: SkillConflictInfo;
  alreadyInstalled?: boolean;
  skipped?: boolean;
  cancelled?: boolean;
  installation?: SkillInstallation;
}

export interface SkillDeleteResult {
  ok: boolean;
  removedLinks: number;
}

export interface SetSkillHubResult {
  config: SkillHubConfig;
  project: Project;
  createdNewProject: boolean;
  /** 后端写入后的权威 projects 列表 */
  projects: Project[];
}
