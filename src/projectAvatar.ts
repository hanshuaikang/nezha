import type { ProjectAvatarColor, ProjectAvatarStyle } from "./types";

/** 头像外观解析所需的最小项目字段；Project 满足该结构。 */
export interface ProjectAppearanceSource {
  id: string;
  name: string;
  path: string;
  avatar?: ProjectAvatarStyle;
}

/** 解析后的头像外观，所有头像消费者（rail / 抽屉 / 首页 / 看板 / 时间线）统一读这里。 */
export interface ResolvedProjectAppearance {
  /** 实际使用的色板 key（用户自定义优先） */
  color: ProjectAvatarColor;
  /** 自动分配的色板 key：用户恢复默认后会得到的颜色，供编辑器「自动」色块预览 */
  autoColor: ProjectAvatarColor;
  /** 实际显示的缩写（用户自定义优先，1–3 个字符） */
  label: string;
  /** 自动生成的缩写（同屏去重后） */
  autoLabel: string;
  /** 用户自定义的 emoji / 符号，有则替代缩写显示 */
  emoji?: string;
}

// 色板顺序即色环顺序（红 → 橙 → … → 粉 → 中性色），也是编辑器里色块的展示顺序。
// 颜色值见 styles/project-rail.css 的 --avatar-<key>-from / -to。
const PALETTE_ORDER = {
  red: 0,
  orange: 1,
  amber: 2,
  lime: 3,
  green: 4,
  teal: 5,
  cyan: 6,
  sky: 7,
  blue: 8,
  violet: 9,
  purple: 10,
  fuchsia: 11,
  pink: 12,
  wine: 13,
  brown: 14,
  slate: 15,
} satisfies Record<ProjectAvatarColor, number>;

export const PROJECT_AVATAR_COLORS = Object.keys(PALETTE_ORDER) as ProjectAvatarColor[];
const PALETTE_SIZE = PROJECT_AVATAR_COLORS.length;

// 撞色时的探测步长:与 16 互质,且每跳约 157° 色相,保证相邻探测到的备选色
// 彼此差异最大(线性 +1 探测会落到色环上最相近的邻色,等于没去重)。
const PROBE_STRIDE = 7;

/**
 * 缩写的最大显示宽度:拉丁字母 / 数字算 1,汉字、日文、韩文等全宽字符算 1.5。
 * 上限 3 意味着「3 个字母」或「2 个汉字」或「1 个汉字 + 1 个字母」——
 * 3 个汉字在 28px 的头像里已经小到看不清,所以不按 grapheme 数一刀切。
 */
export const PROJECT_AVATAR_LABEL_MAX_WIDTH = 3;
const WIDE_GRAPHEME_WIDTH = 1.5;

// 东亚全宽字符范围(CJK 统一表意文字及扩展、假名、谚文、全角形式、兼容表意文字)。
const WIDE_GRAPHEME_RE =
  /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua000-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6\u{20000}-\u{3fffd}]/u;

/** 编辑器里的常用 emoji 候选;用户也可通过系统 emoji 键盘输入任意字符。 */
export const PROJECT_AVATAR_EMOJI_PRESETS: readonly string[] = [
  "🚀",
  "⚡",
  "🔥",
  "✨",
  "🎯",
  "🧪",
  "🧰",
  "🛠️",
  "⚙️",
  "🔧",
  "📦",
  "🗂️",
  "📚",
  "📝",
  "🧭",
  "🌐",
  "☁️",
  "🛰️",
  "🔒",
  "🔑",
  "🐙",
  "🐳",
  "🐧",
  "🦀",
  "🐍",
  "🦫",
  "🤖",
  "👾",
  "🎮",
  "🎨",
  "🖥️",
  "📱",
  "🧠",
  "💎",
  "🌱",
  "🌈",
  "🏠",
  "🛒",
  "💳",
  "📊",
];

export function isProjectAvatarColor(value: unknown): value is ProjectAvatarColor {
  return typeof value === "string" && value in PALETTE_ORDER;
}

/** FNV-1a 32 位;比 `hash*31+c` 分布均匀,且对相似路径前缀不敏感。 */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

// ── grapheme 工具 ─────────────────────────────────────────────────────────────
// tsconfig lib 是 ES2020,没有 Intl.Segmenter 的类型;运行时 WebKit / Chromium / Node 18+
// 都有,缺失时退回 code point 切分(会把 ZWJ 序列切散,仅作兜底)。

type GraphemeSegmenter = { segment(input: string): Iterable<{ segment: string }> };
type SegmenterCtor = new (
  locales?: string | string[],
  options?: { granularity: "grapheme" },
) => GraphemeSegmenter;

function graphemes(input: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
  if (!Segmenter) return Array.from(input);
  const out: string[] = [];
  for (const { segment } of new Segmenter(undefined, { granularity: "grapheme" }).segment(input)) {
    out.push(segment);
  }
  return out;
}

/** 取字符串的第一个 grapheme(一个 emoji / 一个字),没有可见字符时返回空串。 */
export function firstGrapheme(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  return graphemes(trimmed)[0] ?? "";
}

/** 截取前 max 个 grapheme,并去掉首尾空白。 */
export function takeGraphemes(input: string, max: number): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  return graphemes(trimmed).slice(0, max).join("");
}

function graphemeWidth(grapheme: string): number {
  return WIDE_GRAPHEME_RE.test(grapheme) ? WIDE_GRAPHEME_WIDTH : 1;
}

/** 缩写的显示宽度(见 PROJECT_AVATAR_LABEL_MAX_WIDTH)。 */
export function labelWidth(label: string): number {
  return graphemes(label).reduce((sum, grapheme) => sum + graphemeWidth(grapheme), 0);
}

/** 按显示宽度截取缩写:去掉首尾空白,逐个 grapheme 累加宽度,超过上限即停。 */
export function takeLabel(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  let width = 0;
  const out: string[] = [];
  for (const grapheme of graphemes(trimmed)) {
    width += graphemeWidth(grapheme);
    if (width > PROJECT_AVATAR_LABEL_MAX_WIDTH) break;
    out.push(grapheme);
  }
  return out.join("");
}

/**
 * 归一化用户输入的外观:非法色板 key 丢弃、emoji 只保留一个 grapheme、
 * 缩写截到上限;三项都为空时返回 undefined,方便调用方直接删掉 avatar 字段。
 */
export function normalizeProjectAvatar(
  avatar: ProjectAvatarStyle | undefined,
): ProjectAvatarStyle | undefined {
  if (!avatar) return undefined;
  const out: ProjectAvatarStyle = {};
  if (isProjectAvatarColor(avatar.color)) out.color = avatar.color;
  const emoji = avatar.emoji ? firstGrapheme(avatar.emoji) : "";
  if (emoji) out.emoji = emoji;
  const label = avatar.label ? takeLabel(avatar.label) : "";
  if (label) out.label = label;
  return Object.keys(out).length > 0 ? out : undefined;
}

// ── 自动缩写 ─────────────────────────────────────────────────────────────────

// 按分隔符(非字母数字)与 camelCase 边界切词,每个词以 code point 数组返回,
// 避免 surrogate pair / CJK 被 `str[i]` 切坏。
function tokenizeName(name: string): string[][] {
  const spaced = name.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2");
  return spaced
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0)
    .map((token) => Array.from(token));
}

/**
 * 自动缩写候选列表,按优先级排列:
 *   多词名:  首字母×2 → 首字母×3 → 首字母 + 第二词前两字 → 第一词前两字 + 首字母
 *   单词名:  前两字 → 前三字
 * 第一项是"自然缩写",其余是同屏撞名时的备选。
 */
export function initialsCandidates(name: string): string[] {
  const tokens = tokenizeName(name);
  const out: string[] = [];
  // 候选同样受显示宽度限制:CJK 单词名只给「前两字」,不给挤不下的「前三字」。
  const push = (chars: string[]) => {
    const value = chars.join("").toUpperCase();
    if (!value || out.includes(value)) return;
    if (labelWidth(value) > PROJECT_AVATAR_LABEL_MAX_WIDTH) return;
    out.push(value);
  };
  if (tokens.length === 0) {
    const raw = Array.from(name.trim());
    push(raw.slice(0, 2));
    if (out.length === 0) out.push("?");
    return out;
  }
  const [t0, t1, t2] = tokens;
  if (t1) {
    push([t0[0], t1[0]]);
    if (t2) push([t0[0], t1[0], t2[0]]);
    if (t1.length >= 2) push([t0[0], t1[0], t1[1]]);
    if (t0.length >= 2) push([t0[0], t0[1], t1[0]]);
  } else {
    push(t0.slice(0, 2));
    if (t0.length >= 3) push(t0.slice(0, 3));
  }
  return out;
}

// ── 解析 ─────────────────────────────────────────────────────────────────────

// 稳定基准:按 id 排序而不是按 rail 顺序,这样拖拽排序不会让缩写 / 颜色跳变;
// id 是创建时间戳,新项目排在最后,不会扰动已有项目的分配结果。
function stableOrder<T extends ProjectAppearanceSource>(projects: readonly T[]): T[] {
  return [...projects].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function customLabel(project: ProjectAppearanceSource): string | undefined {
  return project.avatar?.label || undefined;
}

function customEmoji(project: ProjectAppearanceSource): string | undefined {
  return project.avatar?.emoji || undefined;
}

function customColor(project: ProjectAppearanceSource): ProjectAvatarColor | undefined {
  const color = project.avatar?.color;
  return isProjectAvatarColor(color) ? color : undefined;
}

// 返回每个项目的自动缩写(同屏去重后)。用户自定义缩写先占位,自动项避开它们;
// 显示 emoji 的项目不参与撞名判断(它们不显示缩写)。
function resolveAutoLabels(ordered: readonly ProjectAppearanceSource[]): Map<string, string> {
  const candidatesById = new Map<string, string[]>();
  const groups = new Map<string, ProjectAppearanceSource[]>();
  const claimed = new Set<string>();
  for (const project of ordered) {
    const candidates = initialsCandidates(project.name);
    candidatesById.set(project.id, candidates);
    if (customEmoji(project)) continue;
    const custom = customLabel(project);
    if (custom) {
      claimed.add(custom.toUpperCase());
      continue;
    }
    const natural = candidates[0];
    const group = groups.get(natural);
    if (group) group.push(project);
    else groups.set(natural, [project]);
  }

  const labels = new Map<string, string>();
  // 第一轮:没撞名的项目保留自然缩写并占位。
  for (const [natural, group] of groups) {
    if (group.length !== 1 || claimed.has(natural)) continue;
    labels.set(group[0].id, natural);
    claimed.add(natural);
  }
  // 第二轮:撞名组(以及自然缩写被自定义缩写占掉的项目)改用更长的备选,
  // 彼此不重复;备选耗尽时退回自然缩写,接受撞名。
  for (const [natural, group] of groups) {
    for (const project of group) {
      if (labels.has(project.id)) continue;
      const candidates = candidatesById.get(project.id) ?? [natural];
      const pick = candidates.slice(1).find((candidate) => !claimed.has(candidate)) ?? natural;
      labels.set(project.id, pick);
      claimed.add(pick);
    }
  }
  // 自定义缩写 / emoji 的项目:autoLabel 仍给出自然缩写,供编辑器占位符使用。
  for (const project of ordered) {
    if (!labels.has(project.id)) {
      labels.set(project.id, candidatesById.get(project.id)?.[0] ?? "?");
    }
  }
  return labels;
}

function pickSlot(preferred: number, usage: readonly number[]): number {
  // 从 hash 落点出发按步长探测,取第一个使用次数最少的槽位:
  // 项目数 ≤ 色板数时全部不重色,超出后均匀复用。
  const minUsage = Math.min(...usage);
  for (let i = 0; i < PALETTE_SIZE; i++) {
    const slot = (preferred + i * PROBE_STRIDE) % PALETTE_SIZE;
    if (usage[slot] === minUsage) return slot;
  }
  return preferred;
}

// 返回每个项目的 { color, autoColor }。用户手动指定的颜色先全部占位,自动分配的项目
// 会避开它们;对自定义了颜色的项目,autoColor 是"此刻恢复默认会拿到的颜色"——
// 用扣掉自身占位后的当前使用状态算,与真正恢复默认后的结果一致。
function resolveColors(
  ordered: readonly ProjectAppearanceSource[],
): Map<string, { color: ProjectAvatarColor; autoColor: ProjectAvatarColor }> {
  const usage = new Array<number>(PALETTE_SIZE).fill(0);
  for (const project of ordered) {
    const custom = customColor(project);
    if (custom) usage[PALETTE_ORDER[custom]] += 1;
  }

  const colors = new Map<string, { color: ProjectAvatarColor; autoColor: ProjectAvatarColor }>();
  for (const project of ordered) {
    const preferred = hashString(project.path || project.name || project.id) % PALETTE_SIZE;
    const custom = customColor(project);
    if (custom) {
      const hypothetical = [...usage];
      hypothetical[PALETTE_ORDER[custom]] -= 1;
      const autoColor = PROJECT_AVATAR_COLORS[pickSlot(preferred, hypothetical)];
      colors.set(project.id, { color: custom, autoColor });
      continue;
    }
    const slot = pickSlot(preferred, usage);
    usage[slot] += 1;
    const color = PROJECT_AVATAR_COLORS[slot];
    colors.set(project.id, { color, autoColor: color });
  }
  return colors;
}

/**
 * 为一组项目统一解析头像外观。必须传入全量项目(而不是 rail 可见子集),
 * 这样同一个项目在 rail / 抽屉 / 首页 / 头部显示的缩写与颜色才一致。
 */
export function resolveProjectAppearances(
  projects: readonly ProjectAppearanceSource[],
): Map<string, ResolvedProjectAppearance> {
  const ordered = stableOrder(projects);
  const autoLabels = resolveAutoLabels(ordered);
  const colors = resolveColors(ordered);

  const result = new Map<string, ResolvedProjectAppearance>();
  for (const project of ordered) {
    const autoLabel = autoLabels.get(project.id) ?? initialsCandidates(project.name)[0];
    const colorPair = colors.get(project.id) ?? {
      color: PROJECT_AVATAR_COLORS[0],
      autoColor: PROJECT_AVATAR_COLORS[0],
    };
    const resolved: ResolvedProjectAppearance = {
      color: colorPair.color,
      autoColor: colorPair.autoColor,
      label: customLabel(project) ?? autoLabel,
      autoLabel,
    };
    const emoji = customEmoji(project);
    if (emoji) resolved.emoji = emoji;
    result.set(project.id, resolved);
  }
  return result;
}

/** 脱离 Provider 时的单项目兜底(测试、孤立渲染),不做同屏去重。 */
export function resolveSingleProjectAppearance(
  project: ProjectAppearanceSource,
): ResolvedProjectAppearance {
  const resolved = resolveProjectAppearances([project]).get(project.id);
  if (resolved) return resolved;
  const label = initialsCandidates(project.name)[0];
  return {
    color: PROJECT_AVATAR_COLORS[0],
    autoColor: PROJECT_AVATAR_COLORS[0],
    label,
    autoLabel: label,
  };
}
