import { describe, it, expect } from "vitest";
import {
  fileIconName,
  folderIconName,
  pickAvailableIcon,
} from "../components/file-explorer/materialIconNames";

describe("materialIconNames: file lookup", () => {
  it("按扩展名匹配，最长的点分后缀优先", () => {
    expect(fileIconName("utils.ts", undefined, false)).toBe("typescript");
    expect(fileIconName("App.tsx", undefined, false)).toBe("react_ts");
    expect(fileIconName("types.d.ts", undefined, false)).toBe("typescript-def");
  });

  it("特殊文件名优先于扩展名，且大小写不敏感", () => {
    expect(fileIconName("package.json", undefined, false)).toBe("nodejs");
    expect(fileIconName("Dockerfile", undefined, false)).toBe("docker");
    expect(fileIconName(".gitignore", undefined, false)).toBe("git");
  });

  it("显式 ext 参数作为兜底", () => {
    expect(fileIconName("weird", "rs", false)).toBe("rust");
  });

  it("未知文件回落通用图标，且不会命中 Object.prototype", () => {
    expect(fileIconName("NOTICE", undefined, false)).toBe("file");
    expect(fileIconName("constructor", undefined, false)).toBe("file");
    expect(fileIconName("a.toString", undefined, false)).toBe("file");
  });

  it("亮色主题使用 _light 变体", () => {
    const dark = fileIconName(".rubocop.yml", undefined, false);
    const light = fileIconName(".rubocop.yml", undefined, true);
    expect(light).not.toBe(dark);
    expect(light).toMatch(/_light$/);
  });
});

describe("materialIconNames: folder lookup", () => {
  it("已知目录名有专属图标，展开态加 -open", () => {
    expect(folderIconName("src", false, false)).toBe("folder-src");
    expect(folderIconName("src", true, false)).toBe("folder-src-open");
    expect(folderIconName("node_modules", false, false)).toBe("folder-node");
  });

  it("未知目录回落通用文件夹", () => {
    expect(folderIconName("zzz-unknown", false, false)).toBe("folder");
    expect(folderIconName("zzz-unknown", true, false)).toBe("folder-open");
  });
});

describe("materialIconNames: pickAvailableIcon", () => {
  const available = new Set(["svelte", "angular", "folder", "folder-open", "file", "react_ts"]);
  const has = (name: string) => available.has(name);

  it("存在的图标原样返回", () => {
    expect(pickAvailableIcon(has, "react_ts", "file")).toBe("react_ts");
  });

  it("npm 包未附带的 clone 图标退化到其 stem，-open 后缀保留", () => {
    // manifest maps "*.svelte.ts" → "svelte_ts", which only exists as a build-time clone
    expect(fileIconName("Store.svelte.ts", undefined, false)).toBe("svelte_ts");
    expect(pickAvailableIcon(has, "svelte_ts", "file")).toBe("svelte");
    expect(pickAvailableIcon(has, "angular-component", "file")).toBe("angular");
    expect(pickAvailableIcon(has, "folder-development-open", "folder-open")).toBe("folder-open");
  });

  it("完全未知的名字回落 fallback", () => {
    expect(pickAvailableIcon(has, "nosuchicon", "file")).toBe("file");
    expect(pickAvailableIcon(has, "no-such-icon-xyz", "file")).toBe("file");
  });
});
