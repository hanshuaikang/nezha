import { describe, expect, test, vi } from "vitest";

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: vi.fn().mockResolvedValue(vi.fn()),
  }),
}));

import {
  formatDroppedPathsForTerminal,
  quotePathForTerminal,
} from "../components/terminalPasteDrop";

describe("terminal dropped path formatting", () => {
  test("leaves simple paths unquoted", () => {
    expect(quotePathForTerminal("/tmp/file.txt")).toBe("/tmp/file.txt");
  });

  test("quotes paths with spaces and shell metacharacters", () => {
    expect(quotePathForTerminal("C:\\Users\\Me\\My File.txt")).toBe("'C:\\Users\\Me\\My File.txt'");
    expect(quotePathForTerminal("/tmp/it's here.txt")).toBe("'/tmp/it'\\''s here.txt'");
  });

  test("joins multiple dropped paths with trailing insertion space", () => {
    expect(formatDroppedPathsForTerminal(["/tmp/a.txt", "/tmp/b file.txt"])).toBe(
      "/tmp/a.txt '/tmp/b file.txt' ",
    );
  });
});
