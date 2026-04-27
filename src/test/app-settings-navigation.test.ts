import { describe, expect, test } from "vitest";
import {
  APP_SETTINGS_NAV_ITEMS,
  APP_SETTINGS_SECTION_KEYS,
} from "../components/app-settings/navigation";

describe("app settings navigation", () => {
  test("keeps only app settings, agent settings, and about in the sidebar", () => {
    expect(APP_SETTINGS_NAV_ITEMS.map((item) => item.key)).toEqual(["app", "agents", "about"]);
  });

  test("keeps general, theme, and shortcuts as sections inside app settings", () => {
    expect([...APP_SETTINGS_SECTION_KEYS]).toEqual([
      "appSettings.general",
      "appSettings.theme",
      "appSettings.shortcuts",
    ]);
  });
});
