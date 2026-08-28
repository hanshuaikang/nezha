import type { MouseEvent } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { normalizeExternalHttpUrl } from "../../utils/externalUrl";

export type MarkdownLinkAction =
  | { kind: "external"; url: string }
  | { kind: "heading"; id: string }
  | { kind: "blocked" };

export function classifyMarkdownHref(rawHref: string | null): MarkdownLinkAction {
  if (rawHref === null) return { kind: "blocked" };

  const href = rawHref.trim();
  if (!href) return { kind: "blocked" };

  if (href.startsWith("#")) {
    try {
      const id = decodeURIComponent(href.slice(1));
      return id ? { kind: "heading", id } : { kind: "blocked" };
    } catch {
      return { kind: "blocked" };
    }
  }

  const url = normalizeExternalHttpUrl(href);
  return url ? { kind: "external", url } : { kind: "blocked" };
}

export function MarkdownPreviewContent({
  html,
  onJump,
}: {
  html: string;
  onJump: (id: string) => void;
}) {
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const anchor = target.closest("a");
    if (!anchor || !event.currentTarget.contains(anchor)) return;

    // Never let a rendered document navigate the application webview.
    event.preventDefault();

    const action = classifyMarkdownHref(anchor.getAttribute("href"));
    if (action.kind === "heading") {
      onJump(action.id);
      return;
    }
    if (action.kind === "external") {
      void openUrl(action.url).catch(() => {
        console.warn("Failed to open Markdown link in the system browser");
      });
    }
  };

  return (
    <div className="md-preview" onClick={handleClick} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
