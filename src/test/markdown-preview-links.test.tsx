import { fireEvent, render, screen } from "@testing-library/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyMarkdownHref,
  MarkdownPreviewContent,
} from "../components/file-viewer/MarkdownPreviewContent";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(() => Promise.resolve()),
}));

describe("Markdown preview links", () => {
  beforeEach(() => {
    vi.mocked(openUrl).mockClear();
  });

  it("opens HTTP links with the system default browser", () => {
    render(
      <MarkdownPreviewContent
        html={'<p><a href="https://example.com/docs?q=nezha"><strong>Docs</strong></a></p>'}
        onJump={vi.fn()}
      />,
    );

    expect(fireEvent.click(screen.getByRole("link", { name: "Docs" }))).toBe(false);
    expect(openUrl).toHaveBeenCalledWith("https://example.com/docs?q=nezha");
  });

  it("keeps heading links inside the Markdown preview", () => {
    const onJump = vi.fn();
    render(
      <MarkdownPreviewContent
        html={'<a href="#release%20notes">Release notes</a>'}
        onJump={onJump}
      />,
    );

    expect(fireEvent.click(screen.getByRole("link", { name: "Release notes" }))).toBe(false);
    expect(onJump).toHaveBeenCalledWith("release notes");
    expect(openUrl).not.toHaveBeenCalled();
  });

  it("blocks relative and unsupported links from navigating the app webview", () => {
    const { rerender } = render(
      <MarkdownPreviewContent html={'<a href="../other.md">Other</a>'} onJump={vi.fn()} />,
    );

    expect(fireEvent.click(screen.getByRole("link", { name: "Other" }))).toBe(false);

    rerender(
      <MarkdownPreviewContent html={'<a href="file:///tmp/private">File</a>'} onJump={vi.fn()} />,
    );
    expect(fireEvent.click(screen.getByRole("link", { name: "File" }))).toBe(false);
    expect(openUrl).not.toHaveBeenCalled();
  });

  it("validates external URLs before handing them to the opener plugin", () => {
    expect(classifyMarkdownHref("https://example.com")).toEqual({
      kind: "external",
      url: "https://example.com/",
    });
    expect(classifyMarkdownHref("javascript:alert(1)")).toEqual({ kind: "blocked" });
    expect(classifyMarkdownHref("https://example.com/\nunsafe")).toEqual({ kind: "blocked" });
    expect(classifyMarkdownHref("#")).toEqual({ kind: "blocked" });
  });
});
