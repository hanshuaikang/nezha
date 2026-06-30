import { describe, expect, test } from "vitest";
import {
  DEFAULT_SEND_SHORTCUT,
  getKanbanShortcutKeys,
  getKanbanShortcutLabel,
  getNewlineShortcutKeys,
  getNewlineShortcutLabel,
  getSendShortcutKeys,
  getSendShortcutLabel,
  isToggleKanbanShortcut,
  normalizeSendShortcut,
  shouldInsertPromptNewlineKey,
  shouldSubmitPromptKey,
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

describe("kanban toggle shortcut", () => {
  test("matches Cmd+K on macOS (and uppercase K under caps lock)", () => {
    expect(
      isToggleKanbanShortcut({ key: "k", metaKey: true, ctrlKey: false, shiftKey: false }, "macos"),
    ).toBe(true);
    expect(
      isToggleKanbanShortcut({ key: "K", metaKey: true, ctrlKey: false, shiftKey: false }, "macos"),
    ).toBe(true);
    // Shift or Alt disqualify, and bare Alt+K is not the macOS combo.
    expect(
      isToggleKanbanShortcut(
        { key: "k", metaKey: true, ctrlKey: false, shiftKey: true },
        "macos",
      ),
    ).toBe(false);
    expect(
      isToggleKanbanShortcut(
        { key: "k", metaKey: true, ctrlKey: false, shiftKey: false, altKey: true },
        "macos",
      ),
    ).toBe(false);
    expect(
      isToggleKanbanShortcut(
        { key: "k", metaKey: false, ctrlKey: false, shiftKey: false, altKey: true },
        "macos",
      ),
    ).toBe(false);
  });

  test("matches Alt+K (not Ctrl+K) on other platforms to dodge terminal kill-line", () => {
    expect(
      isToggleKanbanShortcut(
        { key: "k", metaKey: false, ctrlKey: false, shiftKey: false, altKey: true },
        "windows",
      ),
    ).toBe(true);
    expect(
      isToggleKanbanShortcut(
        { key: "k", metaKey: false, ctrlKey: false, shiftKey: false, altKey: true },
        "other",
      ),
    ).toBe(true);
    // Ctrl+K is readline kill-line — must NOT trigger.
    expect(
      isToggleKanbanShortcut(
        { key: "k", metaKey: false, ctrlKey: true, shiftKey: false, altKey: false },
        "windows",
      ),
    ).toBe(false);
    // Bare Cmd-style metaKey is not the non-mac combo.
    expect(
      isToggleKanbanShortcut(
        { key: "k", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false },
        "windows",
      ),
    ).toBe(false);
  });

  test("ignores keys other than K", () => {
    expect(
      isToggleKanbanShortcut({ key: "j", metaKey: true, ctrlKey: false, shiftKey: false }, "macos"),
    ).toBe(false);
  });

  test("formats display keys/label by platform", () => {
    expect(getKanbanShortcutKeys("macos")).toEqual(["⌘", "K"]);
    expect(getKanbanShortcutKeys("windows")).toEqual(["Alt", "K"]);
    expect(getKanbanShortcutKeys("other")).toEqual(["Alt", "K"]);
    expect(getKanbanShortcutLabel("macos")).toBe("⌘K");
    expect(getKanbanShortcutLabel("windows")).toBe("Alt + K");
    expect(getKanbanShortcutLabel("other")).toBe("Alt + K");
  });
});
