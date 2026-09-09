import type { ProjectAvatarColor } from "./types";

/** 头像外观解析所需的最小项目字段；Project 满足该结构。 */
export interface ProjectAppearanceSource {
  id: string;
  name: string;
  path: string;
}

/** 解析后的头像外观，所有头像消费者（rail / 抽屉 / 首页 / 看板 / 时间线）统一读这里。 */
export interface ResolvedProjectAppearance {
  /** 实际使用的色板 key */
  color: ProjectAvatarColor;
  /** 自动分配的色板 key（与 color 相同，除非用户自定义） */
  autoColor: ProjectAvatarColor;
  /** 实际显示的缩写（1–3 个字符） */
  label: string;
  /** 自动生成的缩写（同屏去重后） */
  autoLabel: string;
}

// 色板顺序即色环顺序（红 → 橙 → … → 粉），也是编辑器里色块的展示顺序。
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
  const push = (chars: string[]) => {
    const value = chars.join("").toUpperCase();
    if (value && !out.includes(value)) out.push(value);
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

// 稳定基准:按 id 排序而不是按 rail 顺序,这样拖拽排序不会让缩写 / 颜色跳变;
// id 是创建时间戳,新项目排在最后,不会扰动已有项目的分配结果。
function stableOrder<T extends ProjectAppearanceSource>(projects: readonly T[]): T[] {
  return [...projects].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function resolveLabels(ordered: readonly ProjectAppearanceSource[]): Map<string, string> {
  const candidatesById = new Map<string, string[]>();
  const groups = new Map<string, ProjectAppearanceSource[]>();
  for (const project of ordered) {
    const candidates = initialsCandidates(project.name);
    candidatesById.set(project.id, candidates);
    const natural = candidates[0];
    const group = groups.get(natural);
    if (group) group.push(project);
    else groups.set(natural, [project]);
  }

  const labels = new Map<string, string>();
  const claimed = new Set<string>();
  // 第一轮:没撞名的项目保留自然缩写并占位。
  for (const [natural, group] of groups) {
    if (group.length !== 1) continue;
    labels.set(group[0].id, natural);
    claimed.add(natural);
  }
  // 第二轮:撞名组内所有成员都改用更长的备选,彼此(以及与第一轮)不重复;
  // 备选耗尽时退回自然缩写,接受撞名。
  for (const [natural, group] of groups) {
    if (group.length === 1) continue;
    for (const project of group) {
      const candidates = candidatesById.get(project.id) ?? [natural];
      const pick = candidates.slice(1).find((candidate) => !claimed.has(candidate)) ?? natural;
      labels.set(project.id, pick);
      claimed.add(pick);
    }
  }
  return labels;
}

function resolveColors(
  ordered: readonly ProjectAppearanceSource[],
  reserved: readonly ProjectAvatarColor[],
): Map<string, ProjectAvatarColor> {
  // 用户手动指定的颜色先占位,自动分配的项目会避开它们。
  const usage = new Array<number>(PALETTE_SIZE).fill(0);
  for (const color of reserved) usage[PALETTE_ORDER[color]] += 1;

  const colors = new Map<string, ProjectAvatarColor>();
  for (const project of ordered) {
    const preferred = hashString(project.path || project.name || project.id) % PALETTE_SIZE;
    // 从 hash 落点出发按步长探测,取第一个使用次数最少的槽位:
    // 项目数 ≤ 色板数时全部不重色,超出后均匀复用。
    const minUsage = Math.min(...usage);
    let slot = preferred;
    for (let i = 0; i < PALETTE_SIZE; i++) {
      slot = (preferred + i * PROBE_STRIDE) % PALETTE_SIZE;
      if (usage[slot] === minUsage) break;
    }
    usage[slot] += 1;
    colors.set(project.id, PROJECT_AVATAR_COLORS[slot]);
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
  const labels = resolveLabels(ordered);
  const colors = resolveColors(ordered, []);

  const result = new Map<string, ResolvedProjectAppearance>();
  for (const project of ordered) {
    const autoLabel = labels.get(project.id) ?? initialsCandidates(project.name)[0];
    const autoColor = colors.get(project.id) ?? PROJECT_AVATAR_COLORS[0];
    result.set(project.id, { color: autoColor, autoColor, label: autoLabel, autoLabel });
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
  return { color: PROJECT_AVATAR_COLORS[0], autoColor: PROJECT_AVATAR_COLORS[0], label, autoLabel: label };
}
