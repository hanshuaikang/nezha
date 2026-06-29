import { afterEach, describe, expect, test, vi } from "vitest";
import { getDefaultMonoFont, isAutoDefaultMonoFont } from "../types";

describe("font defaults", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("uses Consolas as the Windows mono default", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
    });

    expect(getDefaultMonoFont()).toBe("Consolas");
  });

  test("treats every auto default stack as replaceable", () => {
    expect(
      isAutoDefaultMonoFont('"JetBrains Mono", "Fira Code", ui-monospace, monospace'),
    ).toBe(true);
    expect(
      isAutoDefaultMonoFont(
        '"JetBrains Mono", "Fira Code", "Cascadia Mono", Consolas, "SF Mono", Menlo, ui-monospace, monospace',
      ),
    ).toBe(true);
    expect(
      isAutoDefaultMonoFont('Consolas, "Cascadia Mono", "JetBrains Mono", "Fira Code", monospace'),
    ).toBe(true);
    expect(isAutoDefaultMonoFont('"JetBrains Mono"')).toBe(false);
  });
});
