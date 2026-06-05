import { describe, expect, test } from "vitest";
import {
  DEFAULT_TERMINAL_NEWLINE_SHORTCUT,
  getTerminalNewlineShortcutKeys,
  getTerminalNewlineShortcutLabel,
  matchesTerminalNewline,
  normalizeTerminalNewlineShortcut,
  TERMINAL_NEWLINE_SEQUENCE,
} from "../shortcuts";

const enter = (
  mods: Partial<{
    shiftKey: boolean;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    isComposing: boolean;
    keyCode: number;
  }>,
) => ({
  key: "Enter",
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...mods,
});

describe("terminal newline shortcut helpers", () => {
  test("defaults to Alt+Enter and sends Esc+CR", () => {
    expect(DEFAULT_TERMINAL_NEWLINE_SHORTCUT).toBe("alt_enter");
    expect(normalizeTerminalNewlineShortcut(undefined)).toBe("alt_enter");
    expect(normalizeTerminalNewlineShortcut("unexpected")).toBe("alt_enter");
    expect(normalizeTerminalNewlineShortcut("shift_enter")).toBe("shift_enter");
    expect(TERMINAL_NEWLINE_SEQUENCE).toBe("\x1b\r");
  });

  test("alt_enter matches only Alt+Enter", () => {
    expect(matchesTerminalNewline(enter({ altKey: true }), "alt_enter")).toBe(true);
    expect(matchesTerminalNewline(enter({ shiftKey: true }), "alt_enter")).toBe(false);
    expect(matchesTerminalNewline(enter({}), "alt_enter")).toBe(false);
    expect(matchesTerminalNewline(enter({ altKey: true, shiftKey: true }), "alt_enter")).toBe(false);
  });

  test("shift_enter matches only Shift+Enter", () => {
    expect(matchesTerminalNewline(enter({ shiftKey: true }), "shift_enter")).toBe(true);
    expect(matchesTerminalNewline(enter({ altKey: true }), "shift_enter")).toBe(false);
    expect(matchesTerminalNewline(enter({}), "shift_enter")).toBe(false);
  });

  test("never matches plain Enter or Cmd/Ctrl+Enter (those submit)", () => {
    expect(matchesTerminalNewline(enter({}), "alt_enter")).toBe(false);
    expect(matchesTerminalNewline(enter({ metaKey: true, altKey: true }), "alt_enter")).toBe(false);
    expect(matchesTerminalNewline(enter({ ctrlKey: true, shiftKey: true }), "shift_enter")).toBe(false);
    expect(matchesTerminalNewline({ ...enter({ altKey: true }), key: "a" }, "alt_enter")).toBe(false);
  });

  test("never matches while an IME composition is active", () => {
    expect(matchesTerminalNewline(enter({ shiftKey: true, isComposing: true }), "shift_enter")).toBe(
      false,
    );
    expect(matchesTerminalNewline(enter({ altKey: true, isComposing: true }), "alt_enter")).toBe(
      false,
    );
    expect(matchesTerminalNewline(enter({ shiftKey: true, keyCode: 229 }), "shift_enter")).toBe(
      false,
    );
  });

  test("formats shortcut labels by platform", () => {
    expect(getTerminalNewlineShortcutKeys("alt_enter", "macos")).toEqual(["⌥", "↵"]);
    expect(getTerminalNewlineShortcutKeys("alt_enter", "windows")).toEqual(["Alt", "↵"]);
    expect(getTerminalNewlineShortcutKeys("shift_enter", "macos")).toEqual(["⇧", "↵"]);
    expect(getTerminalNewlineShortcutLabel("alt_enter", "macos")).toBe("⌥↵");
    expect(getTerminalNewlineShortcutLabel("shift_enter", "windows")).toBe("⇧↵");
  });
});
