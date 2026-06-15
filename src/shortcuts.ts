import type { AppPlatform } from "./platform";

export type SendShortcut = "mod_enter" | "enter";

export const DEFAULT_SEND_SHORTCUT: SendShortcut = "mod_enter";

export interface PromptKeyEventLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}

export interface GlobalShortcutKeyEventLike extends PromptKeyEventLike {
  altKey: boolean;
  isComposing?: boolean;
  keyCode?: number;
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

/**
 * Cmd+W (macOS) / Ctrl+W (其他平台) —— 收起窗口（隐藏到 Dock/任务栏）。
 * 在全局 keydown 捕获阶段匹配，绕过 webview 默认的关闭行为。
 */
export function isHideWindowShortcut(event: PromptKeyEventLike, platform: AppPlatform): boolean {
  if (event.key !== "w" && event.key !== "W") {
    return false;
  }
  if (event.shiftKey) {
    return false;
  }
  return platform === "macos" ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

export type ViewToggleShortcut = "mod+shift+e" | "mod+shift+space";
export const DEFAULT_VIEW_TOGGLE_SHORTCUT: ViewToggleShortcut = "mod+shift+e";

function normalizeShortcutKey(key: string): string | null {
  if (key === " ") return "space";
  const lower = key.trim().toLowerCase();
  if (!lower) return null;
  switch (lower) {
    case "spacebar":
      return "space";
    case "esc":
      return "escape";
    case "arrowup":
    case "up":
      return "arrowup";
    case "arrowdown":
    case "down":
      return "arrowdown";
    case "arrowleft":
    case "left":
      return "arrowleft";
    case "arrowright":
    case "right":
      return "arrowright";
    default:
      return lower;
  }
}

export function normalizeViewToggleShortcut(value: unknown): ViewToggleShortcut {
  if (value === "mod_shift_e" || value === "mod+shift+e") return "mod+shift+e";
  if (value === "mod_shift_space" || value === "mod+shift+space") return "mod+shift+space";
  return DEFAULT_VIEW_TOGGLE_SHORTCUT;
}

export function getIndexedNavigationShortcutKeys(platform: AppPlatform): string[] {
  return [platform === "macos" ? "⌘" : "Ctrl", "1-9"];
}

/**
 * Global task/file-tab navigation. The numeric shortcuts are intentionally
 * scoped to the current view: task view selects task rows, file preview selects
 * file tabs.
 */
export function matchIndexedNavigationShortcut(
  event: GlobalShortcutKeyEventLike,
  platform: AppPlatform,
): number | null {
  if (event.isComposing || event.keyCode === 229 || event.altKey) {
    return null;
  }

  const platformModifier =
    platform === "macos" ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!platformModifier) {
    return null;
  }

  const key = event.key.toLowerCase();
  if (!event.shiftKey && /^[1-9]$/.test(key)) {
    return Number(key) - 1;
  }

  return null;
}

export function getViewToggleShortcutKeys(
  shortcut: ViewToggleShortcut,
  platform: AppPlatform,
): string[] {
  const normalized = normalizeViewToggleShortcut(shortcut);
  const modifier = platform === "macos" ? "⌘" : "Ctrl";
  return normalized === "mod+shift+space" ? [modifier, "⇧", "Space"] : [modifier, "⇧", "E"];
}

export function matchViewToggleShortcut(
  event: GlobalShortcutKeyEventLike,
  platform: AppPlatform,
  shortcut: ViewToggleShortcut,
): boolean {
  if (event.isComposing || event.keyCode === 229 || event.altKey) {
    return false;
  }
  const normalized = normalizeViewToggleShortcut(shortcut);
  const wantsMeta = platform === "macos";
  const wantsCtrl = platform !== "macos";
  const key = normalized === "mod+shift+space" ? "space" : "e";
  return (
    event.metaKey === wantsMeta &&
    event.ctrlKey === wantsCtrl &&
    event.shiftKey &&
    normalizeShortcutKey(event.key) === key
  );
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
  return platform === "macos" ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
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

// ---------------------------------------------------------------------------
// Terminal "insert newline" shortcut
//
// Inside the embedded xterm, plain Enter is always forwarded to the agent
// (Claude Code / Codex) as a submit. A second combo lets the user insert a
// newline without submitting.
//
// Option/Alt + Enter is ALWAYS treated as "insert newline" — it is the
// universal combo agents already understand, so there is nothing to configure.
// Shift + Enter is the only configurable part: a single on/off toggle (default
// on) for users who prefer that ergonomics.
// ---------------------------------------------------------------------------

export const DEFAULT_SHIFT_ENTER_NEWLINE = true;

/**
 * Esc + CR. Both Claude Code and Codex interpret this as "insert newline" — it
 * is exactly the byte sequence Option/Alt + Enter emits in the JetBrains
 * terminal fallback. We emit it ourselves so the embedded xterm (which does not
 * negotiate the kitty / CSI-u keyboard protocol with the agent) behaves
 * consistently across platforms. Sending raw "\n" instead is avoided on
 * purpose: it can disrupt programs that rely on the kitty protocol.
 */
export const TERMINAL_NEWLINE_SEQUENCE = "\x1b\r";

export interface TerminalKeyEventLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  /** True while an IME composition is in progress (real KeyboardEvent field). */
  isComposing?: boolean;
  /** 229 while an IME composition is in progress (legacy field, kept for Safari). */
  keyCode?: number;
}

export function normalizeShiftEnterNewline(value: unknown): boolean {
  return typeof value === "boolean" ? value : DEFAULT_SHIFT_ENTER_NEWLINE;
}

export function getAltEnterNewlineKeys(platform: AppPlatform): string[] {
  return [platform === "macos" ? "⌥" : "Alt", "↵"];
}

export function getShiftEnterNewlineKeys(): string[] {
  return ["⇧", "↵"];
}

/**
 * Whether a terminal key event should insert a newline instead of submitting.
 * Option/Alt + Enter always qualifies; Shift + Enter only when the user has the
 * toggle enabled. Enter on its own (and Cmd/Ctrl + Enter) is never matched — it
 * stays a submit.
 */
export function matchesTerminalNewline(
  event: TerminalKeyEventLike,
  shiftEnterEnabled: boolean,
): boolean {
  // Never hijack a key that is committing an IME composition (e.g. a CJK user
  // pressing Shift+Enter to accept a candidate) — that must reach the IME, not
  // become a newline.
  if (event.isComposing || event.keyCode === 229) {
    return false;
  }
  if (event.key !== "Enter" || event.metaKey || event.ctrlKey) {
    return false;
  }
  // Alt+Enter: always a newline. Shift+Enter: only when enabled.
  if (event.altKey && !event.shiftKey) {
    return true;
  }
  return shiftEnterEnabled && event.shiftKey && !event.altKey;
}
