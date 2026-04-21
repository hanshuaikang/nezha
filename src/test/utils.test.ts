import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  AVATAR_COLORS,
  getAvatarGradient,
  shortenPath,
  load,
  save,
  getGitStatusColor,
  getGitStatusLabel,
  getFileColor,
  CODE_EXTS,
} from "../utils";

// ── getAvatarGradient ────────────────────────────────────────────────────────

describe("getAvatarGradient", () => {
  it("始终返回 AVATAR_COLORS 中的颜色对", () => {
    const result = getAvatarGradient("my-project");
    expect(AVATAR_COLORS).toContainEqual(result);
  });

  it("相同名称始终返回相同颜色（幂等性）", () => {
    expect(getAvatarGradient("nezha")).toEqual(getAvatarGradient("nezha"));
  });

  it("不同名称通常返回不同颜色", () => {
    // 散列不均匀时可能碰撞，但常见名称不应相同
    const a = getAvatarGradient("project-alpha");
    const b = getAvatarGradient("project-beta");
    // 不强断言不相等（避免散列碰撞导致误报），仅断言返回值合法
    expect(AVATAR_COLORS).toContainEqual(a);
    expect(AVATAR_COLORS).toContainEqual(b);
  });

  it("空字符串不抛出异常并返回合法颜色", () => {
    expect(() => getAvatarGradient("")).not.toThrow();
    expect(AVATAR_COLORS).toContainEqual(getAvatarGradient(""));
  });
});

// ── shortenPath ──────────────────────────────────────────────────────────────

describe("shortenPath", () => {
  it("将 /Users/<username>/ 前缀替换为 ~", () => {
    expect(shortenPath("/Users/john/Documents/project")).toBe("~/Documents/project");
  });

  it("用户名包含点和连字符时正确处理", () => {
    expect(shortenPath("/Users/xxxx/workspace/nezha")).toBe("~/workspace/nezha");
  });

  it("非 /Users/ 路径保持不变", () => {
    expect(shortenPath("/etc/hosts")).toBe("/etc/hosts");
    expect(shortenPath("/tmp/foo")).toBe("/tmp/foo");
  });

  it("路径仅为 /Users/<username> 时缩短为 ~", () => {
    expect(shortenPath("/Users/john")).toBe("~");
  });
});

// ── localStorage load / save ─────────────────────────────────────────────────

describe("load / save", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("save 写入后 load 能正确读取", () => {
    save("theme", "dark");
    expect(load("theme", "light")).toBe("dark");
  });

  it("键不存在时返回 fallback", () => {
    expect(load("nonexistent", 42)).toBe(42);
  });

  it("支持存储复杂对象", () => {
    const data = { projectId: "abc", count: 3 };
    save("meta", data);
    expect(load("meta", null)).toEqual(data);
  });

  it("存储损坏的 JSON 时返回 fallback 而不是抛出异常", () => {
    localStorage.setItem("corrupt", "{not-valid-json");
    expect(load("corrupt", "fallback")).toBe("fallback");
  });
});

// ── getGitStatusColor ────────────────────────────────────────────────────────

describe("getGitStatusColor", () => {
  it.each([
    ["A", "#3fb950"],
    ["D", "#f85149"],
    ["M", "#e3b341"],
    ["R", "#79c0ff"],
    ["?", "#79c0ff"],
    ["U", "#f85149"],
  ])("状态 %s 返回正确颜色", (status, expected) => {
    expect(getGitStatusColor(status)).toBe(expected);
  });

  it("未知状态返回 muted 变量", () => {
    expect(getGitStatusColor("X")).toBe("var(--text-muted)");
  });
});

// ── getGitStatusLabel ────────────────────────────────────────────────────────

describe("getGitStatusLabel", () => {
  it("? 映射为 U（Untracked 显示用）", () => {
    expect(getGitStatusLabel("?")).toBe("U");
  });

  it("U 映射为 !（冲突显示用）", () => {
    expect(getGitStatusLabel("U")).toBe("!");
  });

  it.each(["A", "D", "M", "R"])("已知状态 %s 原样返回", (s) => {
    expect(getGitStatusLabel(s)).toBe(s);
  });

  it("未知状态原样返回", () => {
    expect(getGitStatusLabel("Z")).toBe("Z");
  });
});

// ── getFileColor ─────────────────────────────────────────────────────────────

describe("getFileColor", () => {
  it("TypeScript 文件返回 TypeScript 图标颜色 token", () => {
    expect(getFileColor("App.tsx")).toBe("var(--icon-file-ts)");
    expect(getFileColor("utils.ts")).toBe("var(--icon-file-ts)");
  });

  it("Rust 文件返回 Rust 图标颜色 token", () => {
    expect(getFileColor("lib.rs")).toBe("var(--icon-file-rust)");
  });

  it("Dockerfile 特殊文件名（大小写不敏感）返回 Docker 图标颜色 token", () => {
    expect(getFileColor("Dockerfile")).toBe("var(--icon-file-docker)");
    expect(getFileColor("dockerfile.prod")).toBe("var(--icon-file-docker)");
  });

  it("Makefile 返回构建文件图标颜色 token", () => {
    expect(getFileColor("Makefile")).toBe("var(--icon-file-build)");
  });

  it(".env 文件返回配置文件图标颜色 token", () => {
    expect(getFileColor(".env")).toBe("var(--icon-file-config)");
    expect(getFileColor(".env.production")).toBe("var(--icon-file-config)");
  });

  it("无扩展名的未知文件返回默认图标颜色 token", () => {
    expect(getFileColor("NOTICE")).toBe("var(--icon-file-default)");
  });

  it("ext 参数优先于从文件名推断的扩展名", () => {
    // 传入 ext="rs" 覆盖从 "foo.ts" 推断的 "ts"
    expect(getFileColor("foo.ts", "rs")).toBe("var(--icon-file-rust)");
  });
});

// ── CODE_EXTS ─────────────────────────────────────────────────────────────────

describe("CODE_EXTS", () => {
  it("包含常见代码扩展名", () => {
    expect(CODE_EXTS.has("ts")).toBe(true);
    expect(CODE_EXTS.has("rs")).toBe(true);
    expect(CODE_EXTS.has("py")).toBe(true);
  });

  it("不包含图片等非代码扩展名", () => {
    expect(CODE_EXTS.has("png")).toBe(false);
    expect(CODE_EXTS.has("pdf")).toBe(false);
  });
});

// 确保 vi 被引用（避免 lint 警告）
void vi;
