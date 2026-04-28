import { describe, expect, test } from "vitest";
import {
  DEFAULT_SEND_SHORTCUT,
  getNewlineShortcutKeys,
  getNewlineShortcutLabel,
  getSendShortcutKeys,
  getSendShortcutLabel,
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
