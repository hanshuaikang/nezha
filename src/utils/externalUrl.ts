const MAX_EXTERNAL_URL_LENGTH = 8_192;

export function normalizeExternalHttpUrl(rawUrl: string): string | null {
  const value = rawUrl.trim();
  if (!value || value.length > MAX_EXTERNAL_URL_LENGTH) return null;

  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) {
      return null;
    }
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}
