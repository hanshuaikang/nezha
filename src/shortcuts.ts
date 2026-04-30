import type { AppPlatform } from "./platform";

export type SendShortcut = "mod_enter" | "enter";

export const DEFAULT_SEND_SHORTCUT: SendShortcut = "mod_enter";

// ---------------------------------------------------------------------------
// Global shortcut registry
// ---------------------------------------------------------------------------

export type ShortcutGroup = "task" | "panel" | "editor" | "terminal";

export interface ShortcutDef {
  id: string;
  group: ShortcutGroup;
  key: string;
  mod?: boolean;
  shift?: boolean;
  labelKey: string;
  macKeys: string[];
  winKeys: string[];
}

const KEY_GLYPHS: Record<string, string> = {
  backspace: "⌫",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  enter: "↵",
  "`": "`",
  ",": ",",
  ".": ".",
};

function buildDisplayKeys(mod: boolean, shift: boolean, key: string, mac: boolean): string[] {
  const modGlyph = mac ? "⌘" : "Ctrl";
  const shiftGlyph = mac ? "⇧" : "Shift";
  const keyGlyph = KEY_GLYPHS[key.toLowerCase()] ?? key.toUpperCase();
  return [
    ...(mod ? [modGlyph] : []),
    ...(shift ? [shiftGlyph] : []),
    keyGlyph,
  ];
}

function def(
  id: string,
  group: ShortcutGroup,
  key: string,
  labelKey: string,
  opts?: { mod?: boolean; shift?: boolean },
): ShortcutDef {
  const mod = opts?.mod ?? true;
  const shift = opts?.shift ?? false;
  const keyLower = key.toLowerCase();
  return {
    id,
    group,
    key: keyLower,
    mod,
    shift,
    labelKey,
    macKeys: buildDisplayKeys(mod, shift, keyLower, true),
    winKeys: buildDisplayKeys(mod, shift, keyLower, false),
  };
}

export const GLOBAL_SHORTCUTS: ShortcutDef[] = [
  def("new-task", "task", "n", "shortcut.newTask"),
  def("delete-task", "task", "Backspace", "shortcut.deleteTask"),
  def("prev-task", "task", "ArrowUp", "shortcut.prevTask"),
  def("next-task", "task", "ArrowDown", "shortcut.nextTask"),
  def("toggle-sidebar", "panel", "b", "shortcut.toggleSidebar"),
  def("toggle-files", "panel", "e", "shortcut.toggleFiles"),
  def("toggle-git-changes", "panel", "g", "shortcut.toggleGitChanges", { shift: true }),
  def("toggle-git-history", "panel", "h", "shortcut.toggleGitHistory", { shift: true }),
  def("toggle-terminal", "panel", "`", "shortcut.toggleTerminal"),
  def("app-settings", "panel", ",", "shortcut.appSettings"),
  def("project-settings", "panel", ".", "shortcut.projectSettings"),
  def("focus-search", "task", "f", "shortcut.focusSearch"),
];

export function getShortcutKeys(s: ShortcutDef, platform: AppPlatform): string[] {
  return platform === "macos" ? s.macKeys : s.winKeys;
}

export function matchesShortcut(e: KeyboardEvent, s: ShortcutDef, platform: AppPlatform): boolean {
  const modKey = platform === "macos" ? e.metaKey : e.ctrlKey;
  const antiMod = platform === "macos" ? e.ctrlKey : e.metaKey;
  if (s.mod && (!modKey || antiMod)) return false;
  if (!s.mod && (modKey || antiMod)) return false;
  if (s.shift && !e.shiftKey) return false;
  if (!s.shift && e.shiftKey) return false;
  if (e.altKey) return false;
  return e.key.toLowerCase() === s.key.toLowerCase();
}

export function findShortcut(id: string): ShortcutDef | undefined {
  return GLOBAL_SHORTCUTS.find((s) => s.id === id);
}

// ---------------------------------------------------------------------------
// Keybinding serialization: "mod+shift+k" ↔ ShortcutDef overrides
// ---------------------------------------------------------------------------

export type Keybindings = Record<string, string>;

export function serializeKeybinding(e: KeyboardEvent, platform: AppPlatform): string {
  const parts: string[] = [];
  const isMod = platform === "macos" ? e.metaKey : e.ctrlKey;
  if (isMod) parts.push("mod");
  if (e.shiftKey) parts.push("shift");
  if (e.altKey) parts.push("alt");
  const key = e.key.toLowerCase();
  if (!["meta", "control", "shift", "alt"].includes(key)) {
    parts.push(key);
  }
  return parts.join("+");
}

export function parseKeybinding(binding: string): { mod: boolean; shift: boolean; alt: boolean; key: string } | null {
  if (!binding) return null;
  const parts = binding.toLowerCase().split("+").map((s) => s.trim());
  const mod = parts.includes("mod");
  const shift = parts.includes("shift");
  const alt = parts.includes("alt");
  const key = parts.find((p) => !["mod", "shift", "alt"].includes(p));
  if (!key) return null;
  return { mod, shift, alt, key };
}

function keybindingDisplayKeys(binding: string, mac: boolean): string[] {
  const parsed = parseKeybinding(binding);
  if (!parsed) return [];
  const parts: string[] = [];
  if (parsed.mod) parts.push(mac ? "⌘" : "Ctrl");
  if (parsed.alt) parts.push(mac ? "⌥" : "Alt");
  if (parsed.shift) parts.push(mac ? "⇧" : "Shift");
  parts.push(KEY_GLYPHS[parsed.key] ?? parsed.key.toUpperCase());
  return parts;
}

export function applyKeybindings(defaults: ShortcutDef[], overrides: Keybindings): ShortcutDef[] {
  return defaults.map((s) => {
    const binding = overrides[s.id];
    if (!binding) return s;
    const parsed = parseKeybinding(binding);
    if (!parsed) return s;
    return {
      ...s,
      key: parsed.key,
      mod: parsed.mod,
      shift: parsed.shift,
      macKeys: keybindingDisplayKeys(binding, true),
      winKeys: keybindingDisplayKeys(binding, false),
    };
  });
}

export function formatShortcutHint(
  id: string,
  platform: AppPlatform,
  overrides?: Keybindings,
): string {
  const shortcuts = overrides
    ? applyKeybindings(GLOBAL_SHORTCUTS, overrides)
    : GLOBAL_SHORTCUTS;
  const s = shortcuts.find((sc) => sc.id === id);
  if (!s) return "";
  return getShortcutKeys(s, platform).join("");
}

export function matchesKeybindingEvent(
  e: KeyboardEvent,
  binding: string,
  platform: AppPlatform,
): boolean {
  const parsed = parseKeybinding(binding);
  if (!parsed) return false;
  const modKey = platform === "macos" ? e.metaKey : e.ctrlKey;
  const antiMod = platform === "macos" ? e.ctrlKey : e.metaKey;
  if (parsed.mod && (!modKey || antiMod)) return false;
  if (!parsed.mod && (modKey || antiMod)) return false;
  if (parsed.shift && !e.shiftKey) return false;
  if (!parsed.shift && e.shiftKey) return false;
  if (parsed.alt && !e.altKey) return false;
  if (!parsed.alt && e.altKey) return false;
  return e.key.toLowerCase() === parsed.key;
}

export interface PromptKeyEventLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}

export function normalizeSendShortcut(value: unknown): SendShortcut {
  return value === "enter" || value === "mod_enter" ? value : DEFAULT_SEND_SHORTCUT;
}

export function getSendShortcutLabel(shortcut: SendShortcut, platform: AppPlatform): string {
  return getSendShortcutKeys(shortcut, platform).join("");
}

export function getNewlineShortcutLabel(shortcut: SendShortcut, platform: AppPlatform): string {
  return getNewlineShortcutKeys(shortcut, platform).join("");
}

export function getSendShortcutKeys(shortcut: SendShortcut, platform: AppPlatform): string[] {
  if (shortcut === "enter") {
    return ["↵"];
  }
  return [platform === "macos" ? "⌘" : "Ctrl", "↵"];
}

export function getNewlineShortcutKeys(shortcut: SendShortcut, platform: AppPlatform): string[] {
  if (shortcut === "enter") {
    return [platform === "macos" ? "⌘" : "Ctrl", "↵"];
  }
  return ["↵"];
}

export function shouldInsertPromptNewlineKey(
  event: PromptKeyEventLike,
  shortcut: SendShortcut,
  platform: AppPlatform,
): boolean {
  if (event.key !== "Enter") {
    return false;
  }
  if (shortcut !== "enter" || event.shiftKey) {
    return false;
  }
  return platform === "macos"
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
}

export function shouldSubmitPromptKey(
  event: PromptKeyEventLike,
  shortcut: SendShortcut,
  platform: AppPlatform,
): boolean {
  if (event.key !== "Enter") {
    return false;
  }

  if (shortcut === "enter") {
    return !event.shiftKey && !event.metaKey && !event.ctrlKey;
  }

  if (event.shiftKey) {
    return false;
  }

  return platform === "macos" ? event.metaKey : event.ctrlKey;
}
