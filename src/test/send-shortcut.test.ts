import { describe, expect, test } from "vitest";
import {
  DEFAULT_SEND_SHORTCUT,
  formatShortcutLabel,
  getDefaultShortcutBindings,
  getFixedShortcutSignatures,
  getNewlineShortcutKeys,
  getNewlineShortcutLabel,
  getSendShortcutKeys,
  getSendShortcutLabel,
  getSendShortcutSignatures,
  getShortcutBinding,
  getShortcutConflictActions,
  hasActiveShortcutIgnoreScope,
  isEditableShortcutTarget,
  matchesShortcut,
  normalizeSendShortcut,
  normalizeShortcutBindings,
  shortcutBindingSignatures,
  shouldInsertPromptNewlineKey,
  shouldSubmitPromptKey,
  type ShortcutBinding,
} from "../shortcuts";

describe("send shortcut helpers", () => {
  test("defaults to modifier plus Enter", () => {
    expect(DEFAULT_SEND_SHORTCUT).toBe("mod_enter");
    expect(normalizeSendShortcut(undefined)).toBe("mod_enter");
    expect(normalizeSendShortcut("unexpected")).toBe("mod_enter");
  });

  test("submits with Cmd+Enter on macOS modifier mode", () => {
    expect(
      shouldSubmitPromptKey(
        { key: "Enter", metaKey: true, ctrlKey: false, shiftKey: false },
        "mod_enter",
        "macos",
      ),
    ).toBe(true);
    expect(
      shouldSubmitPromptKey(
        { key: "Enter", metaKey: true, ctrlKey: false, shiftKey: true },
        "mod_enter",
        "macos",
      ),
    ).toBe(false);
    expect(
      shouldSubmitPromptKey(
        { key: "Enter", metaKey: false, ctrlKey: false, shiftKey: false },
        "mod_enter",
        "macos",
      ),
    ).toBe(false);
  });

  test("submits with Ctrl+Enter on Windows modifier mode", () => {
    expect(
      shouldSubmitPromptKey(
        { key: "Enter", metaKey: false, ctrlKey: true, shiftKey: false },
        "mod_enter",
        "windows",
      ),
    ).toBe(true);
    expect(
      shouldSubmitPromptKey(
        { key: "Enter", metaKey: true, ctrlKey: false, shiftKey: false },
        "mod_enter",
        "windows",
      ),
    ).toBe(false);
    expect(
      shouldSubmitPromptKey(
        { key: "Enter", metaKey: false, ctrlKey: true, shiftKey: true },
        "mod_enter",
        "windows",
      ),
    ).toBe(false);
    expect(
      shouldSubmitPromptKey(
        { key: "Enter", metaKey: false, ctrlKey: false, shiftKey: false },
        "mod_enter",
        "windows",
      ),
    ).toBe(false);
  });

  test("submits plain Enter mode but leaves Shift+Enter for newline", () => {
    expect(
      shouldSubmitPromptKey(
        { key: "Enter", metaKey: false, ctrlKey: false, shiftKey: false },
        "enter",
        "windows",
      ),
    ).toBe(true);
    expect(
      shouldSubmitPromptKey(
        { key: "Enter", metaKey: false, ctrlKey: false, shiftKey: true },
        "enter",
        "windows",
      ),
    ).toBe(false);
    expect(
      shouldSubmitPromptKey(
        { key: "Enter", metaKey: true, ctrlKey: false, shiftKey: false },
        "enter",
        "macos",
      ),
    ).toBe(false);
    expect(
      shouldSubmitPromptKey(
        { key: "Enter", metaKey: false, ctrlKey: true, shiftKey: false },
        "enter",
        "windows",
      ),
    ).toBe(false);
  });

  test("inserts newline with platform modifier when Enter sends", () => {
    expect(
      shouldInsertPromptNewlineKey(
        { key: "Enter", metaKey: true, ctrlKey: false, shiftKey: false },
        "enter",
        "macos",
      ),
    ).toBe(true);
    expect(
      shouldInsertPromptNewlineKey(
        { key: "Enter", metaKey: false, ctrlKey: true, shiftKey: false },
        "enter",
        "windows",
      ),
    ).toBe(true);
    expect(
      shouldInsertPromptNewlineKey(
        { key: "Enter", metaKey: true, ctrlKey: false, shiftKey: false },
        "mod_enter",
        "macos",
      ),
    ).toBe(false);
  });

  test("formats shortcut labels by platform", () => {
    expect(getSendShortcutLabel("mod_enter", "macos")).toBe("⌘↵");
    expect(getSendShortcutLabel("mod_enter", "windows")).toBe("Ctrl↵");
    expect(getSendShortcutLabel("enter", "macos")).toBe("↵");
    expect(getNewlineShortcutLabel("mod_enter", "macos")).toBe("↵");
    expect(getNewlineShortcutLabel("enter", "macos")).toBe("⌘↵");
    expect(getNewlineShortcutLabel("enter", "windows")).toBe("Ctrl↵");
    expect(getSendShortcutKeys("mod_enter", "macos")).toEqual(["⌘", "↵"]);
    expect(getSendShortcutKeys("mod_enter", "windows")).toEqual(["Ctrl", "↵"]);
    expect(getSendShortcutKeys("enter", "macos")).toEqual(["↵"]);
    expect(getNewlineShortcutKeys("mod_enter", "macos")).toEqual(["↵"]);
    expect(getNewlineShortcutKeys("enter", "macos")).toEqual(["⌘", "↵"]);
    expect(getNewlineShortcutKeys("enter", "windows")).toEqual(["Ctrl", "↵"]);
  });
});

describe("navigation shortcut helpers", () => {
  test("provides platform defaults for project and task slots", () => {
    const mac = getDefaultShortcutBindings("macos");
    expect(getShortcutBinding(mac, "switch_project_slot")).toMatchObject({
      modifiers: { meta: true },
      slotRange: [1, 9],
      enabled: true,
    });
    expect(getShortcutBinding(mac, "switch_task_slot")).toMatchObject({
      modifiers: { ctrl: true },
      slotRange: [1, 9],
      enabled: true,
    });

    const windows = getDefaultShortcutBindings("windows");
    expect(getShortcutBinding(windows, "switch_project_slot")).toMatchObject({
      modifiers: { ctrl: true },
    });
    expect(getShortcutBinding(windows, "switch_task_slot")).toMatchObject({
      modifiers: { alt: true },
    });
  });

  test("matches digit and numpad slot shortcuts", () => {
    const binding = getShortcutBinding(getDefaultShortcutBindings("macos"), "switch_project_slot")!;
    expect(
      matchesShortcut(
        { key: "1", code: "Digit1", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false },
        binding,
      ),
    ).toEqual({ matched: true, slot: 1 });
    expect(
      matchesShortcut(
        { key: "9", code: "Numpad9", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false },
        binding,
      ),
    ).toEqual({ matched: true, slot: 9 });
    expect(
      matchesShortcut(
        { key: "0", code: "Digit0", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false },
        binding,
      ),
    ).toEqual({ matched: false });
  });

  test("ignores IME composition and mismatched modifiers", () => {
    const binding = getShortcutBinding(getDefaultShortcutBindings("macos"), "switch_project_slot")!;
    expect(
      matchesShortcut(
        { key: "1", code: "Digit1", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, isComposing: true },
        binding,
      ).matched,
    ).toBe(false);
    expect(
      matchesShortcut(
        { key: "1", code: "Digit1", metaKey: false, ctrlKey: true, altKey: false, shiftKey: false },
        binding,
      ).matched,
    ).toBe(false);
  });

  test("normalizes invalid shortcut settings back to defaults", () => {
    expect(normalizeShortcutBindings(undefined, "windows")).toEqual(
      getDefaultShortcutBindings("windows"),
    );
    const normalized = normalizeShortcutBindings(
      [
        {
          action: "switch_project_slot",
          key: "Digit1",
          modifiers: { alt: true },
          slotRange: [0, 15],
          enabled: true,
        },
        { action: "unknown", key: "KeyX", modifiers: {}, enabled: true },
      ],
      "windows",
    );
    expect(getShortcutBinding(normalized, "switch_project_slot")).toMatchObject({
      modifiers: { alt: true },
      slotRange: [1, 9],
    });
    expect(normalized).toHaveLength(4);
  });

  test("detects editable shortcut targets", () => {
    const input = document.createElement("input");
    expect(isEditableShortcutTarget(input)).toBe(true);

    const editor = document.createElement("div");
    editor.className = "cm-editor";
    const child = document.createElement("span");
    editor.appendChild(child);
    document.body.appendChild(editor);
    expect(isEditableShortcutTarget(child)).toBe(true);
    editor.remove();

    const button = document.createElement("button");
    expect(isEditableShortcutTarget(button)).toBe(false);
  });

  test("detects active shortcut ignore scopes", () => {
    expect(hasActiveShortcutIgnoreScope()).toBe(false);

    const modal = document.createElement("div");
    modal.dataset.shortcutScope = "ignore";
    document.body.appendChild(modal);

    expect(hasActiveShortcutIgnoreScope()).toBe(false);

    modal.getClientRects = () => ({ length: 1 }) as DOMRectList;

    expect(hasActiveShortcutIgnoreScope()).toBe(true);
    expect(isEditableShortcutTarget(modal)).toBe(true);

    modal.remove();
    expect(hasActiveShortcutIgnoreScope()).toBe(false);
  });

  test("formats labels and exposes conflict signatures", () => {
    const binding = getShortcutBinding(getDefaultShortcutBindings("macos"), "switch_project_slot")!;
    expect(formatShortcutLabel(binding, "macos", 2)).toBe("⌘2");
    expect(formatShortcutLabel(binding, "windows", 2)).toBe("Meta+2");

    const project: ShortcutBinding = {
      action: "switch_project_slot",
      key: "Digit1",
      modifiers: { meta: true },
      slotRange: [1, 9],
      enabled: true,
    };
    const task: ShortcutBinding = {
      action: "switch_task_slot",
      key: "Digit1",
      modifiers: { meta: true },
      slotRange: [1, 9],
      enabled: true,
    };
    const conflicts = getShortcutConflictActions([project, task]);
    expect(conflicts.get("switch_project_slot")?.has("switch_task_slot")).toBe(true);
    expect(shortcutBindingSignatures(project)).toContain("meta:Digit1");
    expect(getSendShortcutSignatures("mod_enter", "macos")).toContain("meta:Enter");
    expect(getFixedShortcutSignatures("macos")).toContain("meta:KeyW");
  });
});
