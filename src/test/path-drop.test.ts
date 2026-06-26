import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  formatTerminalDroppedPath,
  formatTerminalDroppedPaths,
} from "../components/pathDrop";

describe("terminal path drop helpers", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });


  test("quotes POSIX terminal paths as absolute single-quoted strings", () => {
    expect(formatTerminalDroppedPath("/repo/src/App.tsx")).toBe("'/repo/src/App.tsx'");
  });

  test("formats multiple POSIX terminal paths joined by spaces", () => {
    expect(
      formatTerminalDroppedPaths(["/repo/My Documents/file.txt", "/tmp/data.json"]),
    ).toBe("'/repo/My Documents/file.txt' '/tmp/data.json'");
  });

  test("quotes POSIX terminal paths containing shell metacharacters", () => {
    expect(
      formatTerminalDroppedPaths([
        "/repo/src/app/[id]/page.tsx",
        "/repo/foo&bar.txt",
        "/repo/a(b).txt",
      ]),
    ).toBe("'/repo/src/app/[id]/page.tsx' '/repo/foo&bar.txt' '/repo/a(b).txt'");
  });

  test("escapes embedded single quotes in POSIX paths", () => {
    expect(formatTerminalDroppedPath("/repo/Bob's file.txt")).toBe("'/repo/Bob'\\''s file.txt'");
  });

  test("formats Windows terminal paths with Windows-compatible quoting", () => {
    expect(formatTerminalDroppedPath("C:\\tmp\\Bob's file.txt", "windows")).toBe(
      "\"C:\\tmp\\Bob's file.txt\"",
    );
    expect(formatTerminalDroppedPath("C:\\tmp\\plain.txt", "windows")).toBe("C:\\tmp\\plain.txt");
  });

  test("rejects paths containing PTY control characters that would trigger Enter", () => {
    expect(formatTerminalDroppedPath("/repo/evil\nrm -rf ~")).toBe("");
    expect(formatTerminalDroppedPath("/repo/foo\r/bar")).toBe("");
    expect(formatTerminalDroppedPath("/repo/foo\0bar")).toBe("");
  });

  test("rejected paths are dropped from joined output", () => {
    expect(
      formatTerminalDroppedPaths(["/repo/safe.txt", "/repo/evil\nrm -rf ~", "/repo/other.txt"]),
    ).toBe("'/repo/safe.txt' '/repo/other.txt'");
  });

  test("rejects Windows paths containing shell metacharacters that bypass double-quoting", () => {
    expect(formatTerminalDroppedPath("C:\\$env\\file.txt", "windows")).toBe("");
    expect(formatTerminalDroppedPath("C:\\%USERPROFILE%\\file.txt", "windows")).toBe("");
    expect(formatTerminalDroppedPath("C:\\foo`n.txt", "windows")).toBe("");
  });

  test("POSIX single-quoting keeps $ / backtick / % safe", () => {
    expect(formatTerminalDroppedPath("/repo/$HOME/file.txt")).toBe("'/repo/$HOME/file.txt'");
    expect(formatTerminalDroppedPath("/repo/`whoami`.txt")).toBe("'/repo/`whoami`.txt'");
  });
});
