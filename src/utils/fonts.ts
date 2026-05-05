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
