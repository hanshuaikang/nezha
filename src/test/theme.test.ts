import { describe, expect, test } from "vitest";
import {
  getNextThemeMode,
  getPreferredDarkTheme,
  getPreferredLightTheme,
  isThemeMode,
  resolveThemeVariant,
} from "../theme";

describe("theme helpers", () => {
  test("resolves system mode from the OS preference", () => {
    expect(resolveThemeVariant("system", true)).toBe("midnight");
    expect(resolveThemeVariant("system", false)).toBe("light");
    expect(resolveThemeVariant("eyecare", false)).toBe("eyecare");
    expect(resolveThemeVariant("dark", false)).toBe("dark");
  });

  test("recognizes persisted theme modes", () => {
    expect(isThemeMode("dark")).toBe(true);
    expect(isThemeMode("midnight")).toBe(true);
    expect(isThemeMode("light")).toBe(true);
    expect(isThemeMode("system")).toBe(true);
    expect(isThemeMode("eyecare")).toBe(true);
    expect(isThemeMode("white")).toBe(false);
  });

  test("keeps eyecare as the preferred light theme after midnight mode", () => {
    const preferredLightTheme = getPreferredLightTheme("eyecare", null);
    const preferredDarkTheme = getPreferredDarkTheme("eyecare", null);

    expect(getNextThemeMode("eyecare", false, preferredLightTheme, preferredDarkTheme)).toBe(
      "midnight",
    );
    expect(getNextThemeMode("midnight", false, preferredLightTheme, preferredDarkTheme)).toBe(
      "eyecare",
    );
  });

  test("restores persisted light and dark preferences", () => {
    const preferredLightTheme = getPreferredLightTheme("dark", "eyecare");
    const preferredDarkTheme = getPreferredDarkTheme("light", "dark");

    expect(preferredLightTheme).toBe("eyecare");
    expect(preferredDarkTheme).toBe("dark");
    expect(getNextThemeMode("dark", false, preferredLightTheme, preferredDarkTheme)).toBe(
      "eyecare",
    );
    expect(getNextThemeMode("light", false, preferredLightTheme, preferredDarkTheme)).toBe("dark");
  });

  test("uses current manual theme as the matching preference", () => {
    expect(getPreferredLightTheme("eyecare", "light")).toBe("eyecare");
    expect(getPreferredDarkTheme("dark", "midnight")).toBe("dark");
  });

  test("falls back when no valid preference exists", () => {
    const preferredLightTheme = getPreferredLightTheme("midnight", "white");
    const preferredDarkTheme = getPreferredDarkTheme("light", "black");

    expect(preferredLightTheme).toBe("light");
    expect(preferredDarkTheme).toBe("midnight");
    expect(getNextThemeMode("midnight", false, preferredLightTheme, preferredDarkTheme)).toBe(
      "light",
    );
    expect(getNextThemeMode("light", false, preferredLightTheme, preferredDarkTheme)).toBe(
      "midnight",
    );
  });

  test("switches from system mode to the opposite preferred theme family", () => {
    const preferredLightTheme = getPreferredLightTheme("system", "eyecare");
    const preferredDarkTheme = getPreferredDarkTheme("system", "dark");

    expect(getNextThemeMode("system", true, preferredLightTheme, preferredDarkTheme)).toBe(
      "eyecare",
    );
    expect(getNextThemeMode("system", false, preferredLightTheme, preferredDarkTheme)).toBe("dark");
  });
});
