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

/**
 * Cmd+W (macOS) / Ctrl+W (其他平台) —— 收起窗口（隐藏到 Dock/任务栏）。
 * 在全局 keydown 捕获阶段匹配，绕过 webview 默认的关闭行为。
 */
export function isHideWindowShortcut(
  event: PromptKeyEventLike,
  platform: AppPlatform,
): boolean {
  if (event.key !== "w" && event.key !== "W") {
    return false;
  }
  if (event.shiftKey) {
    return false;
  }
  return platform === "macos"
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
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
