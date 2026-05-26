const BRACKETED_PASTE_START = "\x1b[200~";
const BRACKETED_PASTE_END = "\x1b[201~";

export function formatCodexComposerSubmit(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n");
  return `${BRACKETED_PASTE_START}${normalized}${BRACKETED_PASTE_END}\r`;
}
