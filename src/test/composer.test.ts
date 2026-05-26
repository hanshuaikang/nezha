import { describe, expect, it } from "vitest";
import { formatComposerSubmit } from "../utils/composer";

describe("formatComposerSubmit", () => {
  it("wraps multiline input in bracketed paste and submits once", () => {
    expect(formatComposerSubmit("line one\nline two")).toBe(
      "\x1b[200~line one\nline two\x1b[201~\r",
    );
  });

  it("normalizes CRLF newlines before sending to the PTY", () => {
    expect(formatComposerSubmit("line one\r\nline two\rline three")).toBe(
      "\x1b[200~line one\nline two\nline three\x1b[201~\r",
    );
  });
});
