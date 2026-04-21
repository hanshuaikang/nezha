export const AVATAR_COLORS: [string, string][] = [
  ["#2563D6", "#1E4FA8"],
  ["#4F63D7", "#3F46A6"],
  ["#6D55D2", "#5540A8"],
  ["#7B4CC7", "#61369C"],
  ["#0891B2", "#0E6F86"],
  ["#0D9488", "#0F6B64"],
  ["#0B80C6", "#075E91"],
  ["#0A9A73", "#087354"],
  ["#5B6FD6", "#4250A8"],
  ["#12A4C7", "#0B7892"],
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

  if (n === "dockerfile" || n.startsWith("dockerfile.")) return "var(--icon-file-docker)";
  if (n === "makefile" || n === "gnumakefile" || n === "justfile")
    return "var(--icon-file-build)";
  if (n === "gemfile" || n === "rakefile") return "var(--icon-file-ruby)";
  if (n.startsWith(".git") || n.startsWith(".docker") || n === ".editorconfig" || n === ".npmrc")
    return "var(--icon-file-config)";
  if (n === ".env" || n.startsWith(".env.")) return "var(--icon-file-config)";

  switch (e) {
    case "ts":
    case "tsx":
      return "var(--icon-file-ts)";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "var(--icon-file-js)";
    case "json":
    case "jsonc":
      return "var(--icon-file-json)";
    case "rs":
      return "var(--icon-file-rust)";
    case "html":
    case "htm":
      return "var(--icon-file-html)";
    case "css":
    case "scss":
    case "sass":
      return "var(--icon-file-css)";
    case "md":
    case "mdx":
      return "var(--icon-file-md)";
    case "yaml":
    case "yml":
      return "var(--icon-file-yaml)";
    case "toml":
      return "var(--icon-file-toml)";
    case "py":
      return "var(--icon-file-python)";
    case "go":
      return "var(--icon-file-go)";
    case "sh":
    case "bash":
    case "zsh":
      return "var(--icon-file-shell)";
    case "lock":
      return "var(--icon-file-config)";
    case "svg":
      return "var(--icon-file-svg)";
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "ico":
      return "var(--icon-file-image)";
    case "wasm":
      return "var(--icon-file-wasm)";
    default:
      return "var(--icon-file-default)";
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
