import type { ILinkHandler } from "@xterm/xterm";
import { openUrl } from "@tauri-apps/plugin-opener";
import { normalizeExternalHttpUrl } from "../utils/externalUrl";

export function openTerminalLink(rawUrl: string): void {
  const url = normalizeExternalHttpUrl(rawUrl);
  if (!url) return;

  if (!window.confirm(`Open this link in your default browser?\n\n${url}`)) return;

  void openUrl(url).catch(() => {
    console.warn("Failed to open terminal link in the system browser");
  });
}

export const terminalLinkHandler: ILinkHandler = {
  allowNonHttpProtocols: false,
  activate: (_event, uri) => openTerminalLink(uri),
};
