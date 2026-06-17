import type { AppPlatform } from "./platform";

export type SendShortcut = "mod_enter" | "enter";

export const DEFAULT_SEND_SHORTCUT: SendShortcut = "mod_enter";
export const SHORTCUT_SLOT_MIN = 1;
export const SHORTCUT_SLOT_MAX = 9;
export const SHORTCUT_HINT_DELAY_MS = 150;
export const SHORTCUT_IGNORE_SCOPE_SELECTOR = '[data-shortcut-scope="ignore"]';

export type ShortcutAction =
  | "switch_project_slot"
  | "switch_task_slot"
  | "new_task"
  | "open_project_switcher";

export interface ShortcutModifiers {
  meta?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
}

export interface ShortcutBinding {
  action: ShortcutAction;
  key: string;
  modifiers: ShortcutModifiers;
  slotRange?: [number, number];
  enabled: boolean;
}

export interface PromptKeyEventLike {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
}

export function normalizeSendShortcut(value: unknown): SendShortcut {
  return value === "enter" || value === "mod_enter" ? value : DEFAULT_SEND_SHORTCUT;
}

export function getPlatformModifier(platform: AppPlatform): ShortcutModifiers {
  return platform === "macos" ? { meta: true } : { ctrl: true };
}

export function getDefaultShortcutBindings(platform: AppPlatform): ShortcutBinding[] {
  const platformModifier = getPlatformModifier(platform);
  const taskModifier = platform === "macos" ? { ctrl: true } : { alt: true };
  return [
    {
      action: "switch_project_slot",
      key: "Digit1",
      modifiers: platformModifier,
      slotRange: [SHORTCUT_SLOT_MIN, SHORTCUT_SLOT_MAX],
      enabled: true,
    },
    {
      action: "switch_task_slot",
      key: "Digit1",
      modifiers: taskModifier,
      slotRange: [SHORTCUT_SLOT_MIN, SHORTCUT_SLOT_MAX],
      enabled: true,
    },
    {
      action: "new_task",
      key: "KeyN",
      modifiers: platformModifier,
      enabled: true,
    },
    {
      action: "open_project_switcher",
      key: "Digit0",
      modifiers: platformModifier,
      enabled: true,
    },
  ];
}

function normalizeModifiers(value: unknown): ShortcutModifiers {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  return {
    meta: raw.meta === true || undefined,
    ctrl: raw.ctrl === true || undefined,
    alt: raw.alt === true || undefined,
    shift: raw.shift === true || undefined,
  };
}

function normalizeSlotRange(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const start = Number(value[0]);
  const end = Number(value[1]);
  if (!Number.isInteger(start) || !Number.isInteger(end)) return undefined;
  const normalizedStart = Math.max(SHORTCUT_SLOT_MIN, Math.min(SHORTCUT_SLOT_MAX, start));
  const normalizedEnd = Math.max(SHORTCUT_SLOT_MIN, Math.min(SHORTCUT_SLOT_MAX, end));
  if (normalizedStart > normalizedEnd) return undefined;
  return [normalizedStart, normalizedEnd];
}

function isShortcutAction(value: unknown): value is ShortcutAction {
  return (
    value === "switch_project_slot" ||
    value === "switch_task_slot" ||
    value === "new_task" ||
    value === "open_project_switcher"
  );
}

function normalizeBinding(value: unknown): ShortcutBinding | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!isShortcutAction(raw.action) || typeof raw.key !== "string") return null;
  const binding: ShortcutBinding = {
    action: raw.action,
    key: raw.key,
    modifiers: normalizeModifiers(raw.modifiers),
    enabled: raw.enabled !== false,
  };
  const slotRange = normalizeSlotRange(raw.slotRange);
  if (slotRange) binding.slotRange = slotRange;
  if (
    (binding.action === "switch_project_slot" || binding.action === "switch_task_slot") &&
    !binding.slotRange
  ) {
    binding.slotRange = [SHORTCUT_SLOT_MIN, SHORTCUT_SLOT_MAX];
  }
  return binding;
}

export function normalizeShortcutBindings(
  value: unknown,
  platform: AppPlatform,
): ShortcutBinding[] {
  const defaults = getDefaultShortcutBindings(platform);
  if (!Array.isArray(value)) return defaults;

  const byAction = new Map<ShortcutAction, ShortcutBinding>();
  defaults.forEach((binding) => byAction.set(binding.action, binding));
  value.forEach((raw) => {
    const binding = normalizeBinding(raw);
    if (binding) byAction.set(binding.action, binding);
  });
  return defaults.map((binding) => byAction.get(binding.action) ?? binding);
}

export function getShortcutBinding(
  bindings: ShortcutBinding[],
  action: ShortcutAction,
): ShortcutBinding | undefined {
  return bindings.find((binding) => binding.action === action);
}

export function getSlotNumberFromCode(code: string): number | null {
  const digitMatch = /^Digit([0-9])$/.exec(code);
  if (digitMatch) return Number(digitMatch[1]);
  const numpadMatch = /^Numpad([0-9])$/.exec(code);
  if (numpadMatch) return Number(numpadMatch[1]);
  return null;
}

function normalizeEventCode(event: { code?: string; key?: string }): string {
  if (event.code) return event.code;
  if (event.key && /^[0-9]$/.test(event.key)) return `Digit${event.key}`;
  if (event.key && event.key.length === 1 && /^[a-z]$/i.test(event.key)) {
    return `Key${event.key.toUpperCase()}`;
  }
  return event.key ?? "";
}

export interface ShortcutKeyEventLike {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing?: boolean;
  keyCode?: number;
}

function modifiersMatch(event: ShortcutKeyEventLike, modifiers: ShortcutModifiers): boolean {
  return (
    event.metaKey === !!modifiers.meta &&
    event.ctrlKey === !!modifiers.ctrl &&
    event.altKey === !!modifiers.alt &&
    event.shiftKey === !!modifiers.shift
  );
}

export function shortcutModifiersMatch(
  event: ShortcutKeyEventLike,
  binding: ShortcutBinding,
): boolean {
  return modifiersMatch(event, binding.modifiers);
}

export function shortcutUsesOnlyModifier(
  event: ShortcutKeyEventLike,
  binding: ShortcutBinding,
): boolean {
  return (
    event.metaKey === !!binding.modifiers.meta &&
    event.ctrlKey === !!binding.modifiers.ctrl &&
    event.altKey === !!binding.modifiers.alt &&
    event.shiftKey === !!binding.modifiers.shift
  );
}

export function matchesShortcut(
  event: ShortcutKeyEventLike,
  binding: ShortcutBinding,
): { matched: boolean; slot?: number } {
  if (!binding.enabled || event.isComposing || event.keyCode === 229) {
    return { matched: false };
  }
  if (!modifiersMatch(event, binding.modifiers)) {
    return { matched: false };
  }

  const code = normalizeEventCode(event);
  if (binding.slotRange) {
    const slot = getSlotNumberFromCode(code);
    if (slot == null || slot < binding.slotRange[0] || slot > binding.slotRange[1]) {
      return { matched: false };
    }
    return { matched: true, slot };
  }

  const expectedSlot = getSlotNumberFromCode(binding.key);
  const actualSlot = getSlotNumberFromCode(code);
  if (expectedSlot != null || actualSlot != null) {
    return { matched: expectedSlot != null && expectedSlot === actualSlot };
  }
  return { matched: code === binding.key };
}

export function hasShortcutModifierPressed(
  event: ShortcutKeyEventLike,
  binding: ShortcutBinding,
): boolean {
  if (!binding.enabled) return false;
  return (
    event.metaKey === !!binding.modifiers.meta &&
    event.ctrlKey === !!binding.modifiers.ctrl &&
    event.altKey === !!binding.modifiers.alt &&
    event.shiftKey === !!binding.modifiers.shift
  );
}

function keyCodeToLabel(code: string): string {
  const slot = getSlotNumberFromCode(code);
  if (slot != null) return String(slot);
  if (code === "Digit0" || code === "Numpad0") return "0";
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (code === "Enter") return "↵";
  if (code === "Escape") return "Esc";
  if (code === "Space") return "Space";
  return code.replace(/^Arrow/, "");
}

export function getModifierKeys(
  modifiers: ShortcutModifiers,
  platform: AppPlatform,
): string[] {
  const keys: string[] = [];
  if (modifiers.meta) keys.push(platform === "macos" ? "⌘" : "Meta");
  if (modifiers.ctrl) keys.push(platform === "macos" ? "⌃" : "Ctrl");
  if (modifiers.alt) keys.push(platform === "macos" ? "⌥" : "Alt");
  if (modifiers.shift) keys.push("⇧");
  return keys;
}

export function getShortcutKeys(
  binding: ShortcutBinding,
  platform: AppPlatform,
  slot?: number,
): string[] {
  return [
    ...getModifierKeys(binding.modifiers, platform),
    keyCodeToLabel(slot != null ? `Digit${slot}` : binding.key),
  ];
}

export function formatShortcutLabel(
  binding: ShortcutBinding,
  platform: AppPlatform,
  slot?: number,
): string {
  const keys = getShortcutKeys(binding, platform, slot);
  return platform === "macos" ? keys.join("") : keys.join("+");
}

export function formatShortcutRangeLabel(
  binding: ShortcutBinding,
  platform: AppPlatform,
): string {
  if (!binding.slotRange) return formatShortcutLabel(binding, platform);
  return `${formatShortcutLabel(binding, platform, binding.slotRange[0])} - ${formatShortcutLabel(
    binding,
    platform,
    binding.slotRange[1],
  )}`;
}

export function shortcutBindingSignatures(binding: ShortcutBinding): string[] {
  if (!binding.enabled) return [];
  if (binding.slotRange) {
    const signatures: string[] = [];
    for (let slot = binding.slotRange[0]; slot <= binding.slotRange[1]; slot += 1) {
      signatures.push(shortcutSignature(binding, slot));
    }
    return signatures;
  }
  return [shortcutSignature(binding)];
}

export function getSendShortcutSignatures(
  shortcut: SendShortcut,
  platform: AppPlatform,
): string[] {
  if (shortcut === "enter") return [shortcutSignature({ action: "new_task", key: "Enter", modifiers: {}, enabled: true })];
  return [
    shortcutSignature({
      action: "new_task",
      key: "Enter",
      modifiers: platform === "macos" ? { meta: true } : { ctrl: true },
      enabled: true,
    }),
  ];
}

export function getFixedShortcutSignatures(platform: AppPlatform): string[] {
  return [
    shortcutSignature({
      action: "new_task",
      key: "KeyW",
      modifiers: platform === "macos" ? { meta: true } : { ctrl: true },
      enabled: true,
    }),
  ];
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const element = target as HTMLElement;
  const tagName = element.tagName.toLowerCase();
  if (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    element.isContentEditable
  ) {
    return true;
  }
  return Boolean(
    element.closest(
      `[contenteditable="true"], .cm-editor, .cm-content, .xterm, .xterm-helper-textarea, ${SHORTCUT_IGNORE_SCOPE_SELECTOR}`,
    ),
  );
}

export function hasActiveShortcutIgnoreScope(root?: Pick<ParentNode, "querySelectorAll">): boolean {
  const scopeRoot = root ?? (typeof document !== "undefined" ? document : null);
  if (!scopeRoot) return false;
  return Array.from(scopeRoot.querySelectorAll<HTMLElement>(SHORTCUT_IGNORE_SCOPE_SELECTOR)).some(
    (element) => element.getClientRects().length > 0,
  );
}

function shortcutSignature(binding: ShortcutBinding, slot?: number): string {
  const modifierBits = [
    binding.modifiers.meta ? "meta" : "",
    binding.modifiers.ctrl ? "ctrl" : "",
    binding.modifiers.alt ? "alt" : "",
    binding.modifiers.shift ? "shift" : "",
  ]
    .filter(Boolean)
    .join("+");
  const key = slot != null ? `Digit${slot}` : binding.key;
  return `${modifierBits}:${key}`;
}

export function getShortcutConflictActions(bindings: ShortcutBinding[]): Map<ShortcutAction, Set<ShortcutAction>> {
  const signatures = new Map<string, ShortcutAction[]>();
  bindings
    .filter((binding) => binding.enabled)
    .forEach((binding) => {
      if (binding.slotRange) {
        for (let slot = binding.slotRange[0]; slot <= binding.slotRange[1]; slot += 1) {
          const signature = shortcutSignature(binding, slot);
          signatures.set(signature, [...(signatures.get(signature) ?? []), binding.action]);
        }
        return;
      }
      const signature = shortcutSignature(binding);
      signatures.set(signature, [...(signatures.get(signature) ?? []), binding.action]);
    });

  const conflicts = new Map<ShortcutAction, Set<ShortcutAction>>();
  signatures.forEach((actions) => {
    if (actions.length < 2) return;
    actions.forEach((action) => {
      const current = conflicts.get(action) ?? new Set<ShortcutAction>();
      actions.filter((other) => other !== action).forEach((other) => current.add(other));
      conflicts.set(action, current);
    });
  });
  return conflicts;
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
