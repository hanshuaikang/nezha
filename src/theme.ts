import type { ThemeMode, ThemeVariant } from "./types";

export type LightThemeMode = Extract<ThemeMode, "light" | "eyecare">;
export type DarkThemeMode = Extract<ThemeMode, "dark" | "midnight">;

export const THEME_STORAGE_KEY = "nezha:theme";
export const LIGHT_THEME_STORAGE_KEY = "nezha:lightTheme";
export const DARK_THEME_STORAGE_KEY = "nezha:darkTheme";

export function isThemeMode(value: string | null): value is ThemeMode {
  return (
    value === "dark" ||
    value === "midnight" ||
    value === "light" ||
    value === "system" ||
    value === "eyecare"
  );
}

export function isLightThemeMode(value: string | null): value is LightThemeMode {
  return value === "light" || value === "eyecare";
}

export function isDarkThemeMode(value: string | null): value is DarkThemeMode {
  return value === "dark" || value === "midnight";
}

export function resolveThemeVariant(
  mode: ThemeMode,
  systemPrefersDark: boolean,
): ThemeVariant {
  if (mode === "system") return systemPrefersDark ? "midnight" : "light";
  return mode;
}

export function getPreferredLightTheme(
  themeMode: ThemeMode,
  storedLightTheme: string | null,
): LightThemeMode {
  if (isLightThemeMode(themeMode)) return themeMode;
  return isLightThemeMode(storedLightTheme) ? storedLightTheme : "light";
}

export function getPreferredDarkTheme(
  themeMode: ThemeMode,
  storedDarkTheme: string | null,
): DarkThemeMode {
  if (isDarkThemeMode(themeMode)) return themeMode;
  return isDarkThemeMode(storedDarkTheme) ? storedDarkTheme : "midnight";
}

export function getNextThemeMode(
  currentMode: ThemeMode,
  systemPrefersDark: boolean,
  preferredLightTheme: LightThemeMode,
  preferredDarkTheme: DarkThemeMode,
): ThemeMode {
  const currentVariant = resolveThemeVariant(currentMode, systemPrefersDark);
  return isDarkThemeMode(currentVariant) ? preferredLightTheme : preferredDarkTheme;
}
