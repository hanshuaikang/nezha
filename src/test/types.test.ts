import { describe, expect, it } from "vitest";
import {
  cloneDefaultNotificationSettings,
  DEFAULT_NOTIFICATION_SETTINGS,
  normalizeNotificationSettings,
} from "../types";

describe("normalizeNotificationSettings", () => {
  it("旧配置缺少新通知类型时默认开启，并回退非法 Toast 位置", () => {
    expect(
      normalizeNotificationSettings({
        enabled: false,
        inApp: false,
        system: true,
        sound: false,
        toastPosition: "center",
        types: { done: false },
      }),
    ).toEqual({
      enabled: false,
      inApp: false,
      system: true,
      sound: false,
      toastPosition: DEFAULT_NOTIFICATION_SETTINGS.toastPosition,
      types: {
        done: false,
        failed: true,
        idle: true,
        input_required: true,
      },
    });
  });

  it("默认通知设置返回独立的 types 对象", () => {
    expect(cloneDefaultNotificationSettings().types).not.toBe(DEFAULT_NOTIFICATION_SETTINGS.types);
    expect(normalizeNotificationSettings(null).types).not.toBe(
      DEFAULT_NOTIFICATION_SETTINGS.types,
    );
  });
});
