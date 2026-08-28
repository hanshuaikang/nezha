import { openUrl } from "@tauri-apps/plugin-opener";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openTerminalLink, terminalLinkHandler } from "../components/terminalLinkHandler";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(() => Promise.resolve()),
}));

describe("terminal OSC 8 links", () => {
  beforeEach(() => {
    vi.mocked(openUrl).mockClear();
    vi.restoreAllMocks();
  });

  it("opens an approved HTTP link with the system default browser", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);

    openTerminalLink("https://example.com/docs");

    expect(window.confirm).toHaveBeenCalledWith(
      "Open this link in your default browser?\n\nhttps://example.com/docs",
    );
    expect(openUrl).toHaveBeenCalledWith("https://example.com/docs");
  });

  it("keeps the existing confirmation requirement", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);

    openTerminalLink("https://example.com/");

    expect(openUrl).not.toHaveBeenCalled();
  });

  it("rejects unsupported protocols before prompting or opening", () => {
    const confirm = vi.spyOn(window, "confirm");

    openTerminalLink("javascript:alert(1)");
    openTerminalLink("file:///tmp/private");

    expect(confirm).not.toHaveBeenCalled();
    expect(openUrl).not.toHaveBeenCalled();
    expect(terminalLinkHandler.allowNonHttpProtocols).toBe(false);
  });
});
