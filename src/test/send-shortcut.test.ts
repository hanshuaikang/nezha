import { describe, expect, test } from "vitest";
import {
  DEFAULT_SEND_SHORTCUT,
  getNewlineShortcutKeys,
  getNewlineShortcutLabel,
  getSendShortcutKeys,
  getSendShortcutLabel,
  getTerminalFontSizeDecreaseKeys,
  getTerminalFontSizeIncreaseKeys,
  getTerminalFontSizeShortcutDelta,
  normalizeSendShortcut,
  normalizeTerminalFontSizeShortcutsEnabled,
  shouldInsertPromptNewlineKey,
  shouldSubmitPromptKey,
} from "../shortcuts";

describe("send shortcut helpers", () => {
  test("defaults to modifier plus Enter", () => {
    expect(DEFAULT_SEND_SHORTCUT).toBe("mod_enter");
    expect(normalizeSendShortcut(undefined)).toBe("mod_enter");
    expect(normalizeSendShortcut("unexpected")).toBe("mod_enter");
  });

  test("defaults terminal font size shortcuts to enabled", () => {
    expect(normalizeTerminalFontSizeShortcutsEnabled(undefined)).toBe(true);
    expect(normalizeTerminalFontSizeShortcutsEnabled("unexpected")).toBe(true);
    expect(normalizeTerminalFontSizeShortcutsEnabled(false)).toBe(false);
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

  test("matches terminal font size shortcuts by platform", () => {
    expect(
      getTerminalFontSizeShortcutDelta(
        { key: "+", code: "Equal", metaKey: true, ctrlKey: false, altKey: false },
        "macos",
      ),
    ).toBe(1);
    expect(
      getTerminalFontSizeShortcutDelta(
        { key: "=", code: "Equal", metaKey: true, ctrlKey: false, altKey: false },
        "macos",
      ),
    ).toBe(1);
    expect(
      getTerminalFontSizeShortcutDelta(
        { key: "-", code: "Minus", metaKey: true, ctrlKey: false, altKey: false },
        "macos",
      ),
    ).toBe(-1);
    expect(
      getTerminalFontSizeShortcutDelta(
        { key: "+", code: "Equal", metaKey: false, ctrlKey: true, altKey: false },
        "windows",
      ),
    ).toBe(1);
    expect(
      getTerminalFontSizeShortcutDelta(
        { key: "-", code: "Minus", metaKey: false, ctrlKey: true, altKey: false },
        "windows",
      ),
    ).toBe(-1);
    expect(
      getTerminalFontSizeShortcutDelta(
        { key: "+", code: "NumpadAdd", metaKey: false, ctrlKey: true, altKey: false },
        "windows",
      ),
    ).toBe(1);
  });

  test("ignores terminal font size shortcuts with the wrong modifier", () => {
    expect(
      getTerminalFontSizeShortcutDelta(
        { key: "+", code: "Equal", metaKey: false, ctrlKey: true, altKey: false },
        "macos",
      ),
    ).toBe(0);
    expect(
      getTerminalFontSizeShortcutDelta(
        { key: "+", code: "Equal", metaKey: true, ctrlKey: false, altKey: false },
        "windows",
      ),
    ).toBe(0);
    expect(
      getTerminalFontSizeShortcutDelta(
        { key: "+", code: "Equal", metaKey: true, ctrlKey: false, altKey: true },
        "macos",
      ),
    ).toBe(0);
  });

  test("formats terminal font size shortcut keys by platform", () => {
    expect(getTerminalFontSizeIncreaseKeys("macos")).toEqual(["⌘", "+"]);
    expect(getTerminalFontSizeDecreaseKeys("macos")).toEqual(["⌘", "-"]);
    expect(getTerminalFontSizeIncreaseKeys("windows")).toEqual(["Ctrl", "+"]);
    expect(getTerminalFontSizeDecreaseKeys("other")).toEqual(["Ctrl", "-"]);
  });
});
