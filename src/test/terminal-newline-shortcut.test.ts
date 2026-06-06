import { describe, expect, test } from "vitest";
import {
  DEFAULT_SHIFT_ENTER_NEWLINE,
  getAltEnterNewlineKeys,
  getShiftEnterNewlineKeys,
  matchesTerminalNewline,
  normalizeShiftEnterNewline,
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
  test("Shift+Enter newline defaults to enabled and sends Esc+CR", () => {
    expect(DEFAULT_SHIFT_ENTER_NEWLINE).toBe(true);
    expect(normalizeShiftEnterNewline(undefined)).toBe(true);
    expect(normalizeShiftEnterNewline("unexpected")).toBe(true);
    expect(normalizeShiftEnterNewline(false)).toBe(false);
    expect(normalizeShiftEnterNewline(true)).toBe(true);
    expect(TERMINAL_NEWLINE_SEQUENCE).toBe("\x1b\r");
  });

  test("Alt+Enter always inserts a newline, regardless of the Shift toggle", () => {
    expect(matchesTerminalNewline(enter({ altKey: true }), true)).toBe(true);
    expect(matchesTerminalNewline(enter({ altKey: true }), false)).toBe(true);
    // Alt+Shift+Enter is not a clean Alt combo, so it is left for the agent.
    expect(matchesTerminalNewline(enter({ altKey: true, shiftKey: true }), true)).toBe(false);
  });

  test("Shift+Enter inserts a newline only when the toggle is on", () => {
    expect(matchesTerminalNewline(enter({ shiftKey: true }), true)).toBe(true);
    expect(matchesTerminalNewline(enter({ shiftKey: true }), false)).toBe(false);
  });

  test("never matches plain Enter or Cmd/Ctrl+Enter (those submit)", () => {
    expect(matchesTerminalNewline(enter({}), true)).toBe(false);
    expect(matchesTerminalNewline(enter({}), false)).toBe(false);
    expect(matchesTerminalNewline(enter({ metaKey: true, altKey: true }), true)).toBe(false);
    expect(matchesTerminalNewline(enter({ ctrlKey: true, shiftKey: true }), true)).toBe(false);
    expect(matchesTerminalNewline({ ...enter({ altKey: true }), key: "a" }, true)).toBe(false);
  });

  test("never matches while an IME composition is active", () => {
    expect(matchesTerminalNewline(enter({ shiftKey: true, isComposing: true }), true)).toBe(false);
    expect(matchesTerminalNewline(enter({ altKey: true, isComposing: true }), true)).toBe(false);
    expect(matchesTerminalNewline(enter({ shiftKey: true, keyCode: 229 }), true)).toBe(false);
  });

  test("formats shortcut labels by platform", () => {
    expect(getAltEnterNewlineKeys("macos")).toEqual(["⌥", "↵"]);
    expect(getAltEnterNewlineKeys("windows")).toEqual(["Alt", "↵"]);
    expect(getShiftEnterNewlineKeys()).toEqual(["⇧", "↵"]);
  });
});
