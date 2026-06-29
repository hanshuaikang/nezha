import { invoke } from "@tauri-apps/api/core";

let cachedFonts: string[] | null = null;

export async function loadSystemFonts(): Promise<string[]> {
  if (cachedFonts) return cachedFonts;

  try {
    const fonts = await invoke<string[]>("get_system_fonts");
    cachedFonts = fonts;
    return fonts;
  } catch {
    return [];
  }
}

export function parseFirstFontName(stack: string): string {
  const trimmed = stack.trim();
  if (!trimmed) return "";

  // Handle comma-separated stack: take first entry
  const first = trimmed.split(",")[0].trim();

  // Strip surrounding quotes
  if ((first.startsWith('"') && first.endsWith('"')) || (first.startsWith("'") && first.endsWith("'"))) {
    return first.slice(1, -1);
  }
  return first;
}

// 系统字体名含空格 / 非 ASCII（如 "Maple Mono NF CN"）时必须加引号；否则
// Canvas 2D 的 ctx.font 解析会把它 tokenize 成多个 family 名，每个都 fallback 失败。
// 含逗号说明已经是 family stack，原样返回；已经带引号的也跳过。
export function quoteFontName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes(",")) return trimmed;
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed;
  }
  if (/^[A-Za-z][A-Za-z0-9-]*$/.test(trimmed)) return trimmed;
  return `"${trimmed.replace(/"/g, '\\"')}"`;
}

export function filterFonts(fonts: string[], query: string): string[] {
  if (!query) return fonts;
  const q = query.toLowerCase();

  const exact: string[] = [];
  const startsWith: string[] = [];
  const contains: string[] = [];

  for (const f of fonts) {
    const lower = f.toLowerCase();
    if (lower === q) exact.push(f);
    else if (lower.startsWith(q)) startsWith.push(f);
    else if (lower.includes(q)) contains.push(f);
  }

  return [...exact, ...startsWith, ...contains];
}
