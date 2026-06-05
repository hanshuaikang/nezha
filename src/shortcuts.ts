import type { AppPlatform } from "./platform";

export type SendShortcut = "mod_enter" | "enter";

export const DEFAULT_SEND_SHORTCUT: SendShortcut = "mod_enter";

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

// ---------------------------------------------------------------------------
// Terminal "insert newline" shortcut
//
// Inside the embedded xterm, plain Enter is always forwarded to the agent
// (Claude Code / Codex) as a submit. A second combo lets the user insert a
// newline without submitting. Which combo that is can be configured here.
// ---------------------------------------------------------------------------

export type TerminalNewlineShortcut = "alt_enter" | "shift_enter";

export const DEFAULT_TERMINAL_NEWLINE_SHORTCUT: TerminalNewlineShortcut = "alt_enter";

/**
 * Esc + CR. Both Claude Code and Codex interpret this as "insert newline" — it
 * is exactly the byte sequence Option/Alt + Enter emits in the JetBrains
 * terminal fallback. We emit it ourselves for whichever combo the user picked
 * so the embedded xterm (which does not negotiate the kitty / CSI-u keyboard
 * protocol with the agent) behaves consistently across platforms. Sending raw
 * "\n" instead is avoided on purpose: it can disrupt programs that rely on the
 * kitty protocol.
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

export function normalizeTerminalNewlineShortcut(value: unknown): TerminalNewlineShortcut {
  return value === "shift_enter" || value === "alt_enter"
    ? value
    : DEFAULT_TERMINAL_NEWLINE_SHORTCUT;
}

export function getTerminalNewlineShortcutKeys(
  shortcut: TerminalNewlineShortcut,
  platform: AppPlatform,
): string[] {
  if (shortcut === "shift_enter") {
    return ["⇧", "↵"];
  }
  return [platform === "macos" ? "⌥" : "Alt", "↵"];
}

export function getTerminalNewlineShortcutLabel(
  shortcut: TerminalNewlineShortcut,
  platform: AppPlatform,
): string {
  return getTerminalNewlineShortcutKeys(shortcut, platform).join("");
}

/**
 * Whether a terminal key event matches the configured "insert newline" combo.
 * Enter on its own (and Cmd/Ctrl + Enter) is never matched — it stays a submit.
 */
export function matchesTerminalNewline(
  event: TerminalKeyEventLike,
  shortcut: TerminalNewlineShortcut,
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
  return shortcut === "shift_enter"
    ? event.shiftKey && !event.altKey
    : event.altKey && !event.shiftKey;
}
