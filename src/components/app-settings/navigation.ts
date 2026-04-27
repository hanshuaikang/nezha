import type { AppSettingsNavItem } from "./types";

export const APP_SETTINGS_NAV_ITEMS: AppSettingsNavItem[] = [
  { key: "app", labelKey: "appSettings.title" },
  { key: "agents", labelKey: "appSettings.agentSettings" },
  { key: "about", labelKey: "appSettings.about" },
];

export const APP_SETTINGS_SECTION_KEYS = [
  "appSettings.general",
  "appSettings.theme",
  "appSettings.shortcuts",
] as const;
