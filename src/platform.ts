export type AppPlatform = "windows" | "macos" | "other";

type PlatformNavigator = Pick<Navigator, "platform" | "userAgent">;

export function detectAppPlatform(currentNavigator: PlatformNavigator | undefined = globalThis.navigator): AppPlatform {
  if (!currentNavigator) {
    return "other";
  }

  const platform = currentNavigator.platform.toLowerCase();
  const userAgent = currentNavigator.userAgent.toLowerCase();

  if (platform.includes("win") || userAgent.includes("windows")) {
    return "windows";
  }

  if (platform.includes("mac") || userAgent.includes("mac os")) {
    return "macos";
  }

  return "other";
}

export const APP_PLATFORM = detectAppPlatform();
export const ENABLE_USAGE_INSIGHTS = APP_PLATFORM !== "windows";
