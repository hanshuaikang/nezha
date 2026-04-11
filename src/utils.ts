export const AVATAR_COLORS: [string, string][] = [
  ["#3B82F6", "#1D4ED8"],
  ["#6366F1", "#4338CA"],
  ["#8B5CF6", "#6D28D9"],
  ["#A855F7", "#7E22CE"],
  ["#06B6D4", "#0E7490"],
  ["#14B8A6", "#0F766E"],
  ["#0EA5E9", "#0369A1"],
  ["#10B981", "#047857"],
  ["#818CF8", "#4F46E5"],
  ["#22D3EE", "#0891B2"],
];

export function getAvatarGradient(name: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function shortenPath(p: string) {
  return p.replace(/^\/Users\/[^/]+/, "~");
}

export function load<T>(key: string, fallback: T): T {
  try {
    const r = localStorage.getItem(key);
    return r ? JSON.parse(r) : fallback;
  } catch {
    return fallback;
  }
}
export function save<T>(key: string, val: T) {
  localStorage.setItem(key, JSON.stringify(val));
}

// ── Usage 颜色工具 ────────────────────────────────────────────────────────────

export function getUsageColor(remainingPercent: number): string {
  if (remainingPercent > 70) return "var(--usage-good)";
  if (remainingPercent >= 20) return "var(--usage-warn)";
  return "var(--usage-danger)";
}

// ── Git 状态工具 ──────────────────────────────────────────────────────────────

export function getGitStatusColor(status: string): string {
  switch (status) {
    case "A":
      return "#3fb950";
    case "D":
      return "#f85149";
    case "M":
      return "#e3b341";
    case "R":
      return "#79c0ff";
    case "?":
      return "#79c0ff";
    case "U":
      return "#f85149";
    default:
      return "var(--text-muted)";
  }
}

export function getGitStatusLabel(status: string): string {
  switch (status) {
    case "A":
      return "A";
    case "D":
      return "D";
    case "M":
      return "M";
    case "R":
      return "R";
    case "?":
      return "U";
    case "U":
      return "!";
    default:
      return status;
  }
}

// ── 文件颜色工具 ──────────────────────────────────────────────────────────────

export function getFileColor(name: string, ext?: string): string {
  const n = name.toLowerCase();
  const e = ext ?? (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

  if (n === "dockerfile" || n.startsWith("dockerfile.")) return "#2496ed";
  if (n === "makefile" || n === "gnumakefile" || n === "justfile") return "#6d8086";
  if (n === "gemfile" || n === "rakefile") return "#cc342d";
  if (n.startsWith(".git") || n.startsWith(".docker") || n === ".editorconfig" || n === ".npmrc")
    return "#6b7280";
  if (n === ".env" || n.startsWith(".env.")) return "#6b7280";

  switch (e) {
    case "ts":
    case "tsx":
      return "#3178c6";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "#f7c948";
    case "json":
    case "jsonc":
      return "#f59e0b";
    case "rs":
      return "#ce422b";
    case "html":
    case "htm":
      return "#e34c26";
    case "css":
    case "scss":
    case "sass":
      return "#264de4";
    case "md":
    case "mdx":
      return "#7c3aed";
    case "yaml":
    case "yml":
      return "#ef4444";
    case "toml":
      return "#9c4221";
    case "py":
      return "#3572a5";
    case "go":
      return "#00add8";
    case "sh":
    case "bash":
    case "zsh":
      return "#4eaa25";
    case "lock":
      return "#6b7280";
    case "svg":
      return "#ff9800";
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "ico":
      return "#22c55e";
    case "wasm":
      return "#654ff0";
    default:
      return "#94a3b8";
  }
}

// ── 文件类型扩展名集合 ────────────────────────────────────────────────────────

export const CODE_EXTS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "rs",
  "py",
  "go",
  "java",
  "c",
  "cpp",
  "h",
  "css",
  "html",
  "vue",
  "svelte",
  "swift",
  "kt",
]);
