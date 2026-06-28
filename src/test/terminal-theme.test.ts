import { describe, expect, test } from "vitest";
import {
  DARK_THEME,
  EYECARE_THEME,
  LIGHT_THEME,
  MIDNIGHT_THEME,
  minimumContrastRatioFor,
  themeFor,
} from "../components/terminalShared";

describe("terminal theme helpers", () => {
  test("returns the configured xterm palette for each app theme", () => {
    expect(themeFor("dark")).toBe(DARK_THEME);
    expect(themeFor("light")).toBe(LIGHT_THEME);
    expect(themeFor("eyecare")).toBe(EYECARE_THEME);
    expect(themeFor("midnight")).toBe(MIDNIGHT_THEME);
  });

  test("enforces readable terminal colors on light backgrounds only", () => {
    expect(minimumContrastRatioFor("light")).toBe(4.5);
    expect(minimumContrastRatioFor("eyecare")).toBe(4.5);
    expect(minimumContrastRatioFor("dark")).toBe(1);
    expect(minimumContrastRatioFor("midnight")).toBe(1);
  });
});
