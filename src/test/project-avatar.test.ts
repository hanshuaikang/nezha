import { describe, expect, it } from "vitest";
import {
  PROJECT_AVATAR_COLORS,
  hashString,
  initialsCandidates,
  normalizeProjectAvatar,
  resolveProjectAppearances,
  resolveSingleProjectAppearance,
} from "../projectAvatar";

function project(id: string, name: string, path = `/repo/${name}`) {
  return { id, name, path };
}

describe("initialsCandidates", () => {
  it("单词名取前两字，备选前三字", () => {
    expect(initialsCandidates("nezha")).toEqual(["NE", "NEZ"]);
  });

  it("多词名取各词首字母，备选依次加长", () => {
    expect(initialsCandidates("aftership-core")).toEqual(["AC", "ACO", "AFC"]);
    expect(initialsCandidates("my_cool app")).toEqual(["MC", "MCA", "MCO", "MYC"]);
  });

  it("识别 camelCase 边界", () => {
    expect(initialsCandidates("MyApp")[0]).toBe("MA");
  });

  it("CJK 名称不会被切坏", () => {
    expect(initialsCandidates("中文项目")).toEqual(["中文", "中文项"]);
  });

  it("空名称给出占位符而不抛错", () => {
    expect(initialsCandidates("")).toEqual(["?"]);
    expect(initialsCandidates("   ")).toEqual(["?"]);
  });
});

describe("hashString", () => {
  it("幂等且对不同输入分布不同", () => {
    expect(hashString("/a/b")).toBe(hashString("/a/b"));
    expect(hashString("/a/b")).not.toBe(hashString("/a/c"));
  });
});

describe("resolveProjectAppearances", () => {
  it("没撞名的项目保留自然缩写", () => {
    const result = resolveProjectAppearances([project("1", "nezha"), project("2", "alpha-beta")]);
    expect(result.get("1")?.label).toBe("NE");
    expect(result.get("2")?.label).toBe("AB");
  });

  it("同屏撞名时全组改用更长的备选并互不重复", () => {
    const result = resolveProjectAppearances([
      project("1", "aftership-core"),
      project("2", "aftership-cli"),
      project("3", "agent-config"),
    ]);
    const labels = ["1", "2", "3"].map((id) => result.get(id)?.label);
    expect(new Set(labels).size).toBe(3);
    expect(labels).not.toContain("AC");
  });

  it("项目数不超过色板数时颜色全部不同", () => {
    const projects = Array.from({ length: PROJECT_AVATAR_COLORS.length }, (_, i) =>
      project(String(1000 + i), `p${i}`, `/work/dir-${i}`),
    );
    const result = resolveProjectAppearances(projects);
    const colors = projects.map((p) => result.get(p.id)?.color);
    expect(new Set(colors).size).toBe(PROJECT_AVATAR_COLORS.length);
  });

  it("超出色板数时均匀复用，任一颜色最多多用一次", () => {
    const projects = Array.from({ length: 24 }, (_, i) =>
      project(String(1000 + i), `p${i}`, `/work/dir-${i}`),
    );
    const result = resolveProjectAppearances(projects);
    const counts = new Map<string, number>();
    for (const p of projects) {
      const color = result.get(p.id)!.color;
      counts.set(color, (counts.get(color) ?? 0) + 1);
    }
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
  });

  it("结果不依赖传入顺序（拖拽排序不改颜色 / 缩写）", () => {
    const a = project("1", "aftership-core");
    const b = project("2", "aftership-cli");
    const c = project("3", "nezha");
    const forward = resolveProjectAppearances([a, b, c]);
    const reversed = resolveProjectAppearances([c, b, a]);
    for (const id of ["1", "2", "3"]) {
      expect(reversed.get(id)).toEqual(forward.get(id));
    }
  });

  it("新增项目不会改变已有项目的分配", () => {
    const base = [project("1", "nezha", "/a"), project("2", "alpha", "/b")];
    const before = resolveProjectAppearances(base);
    const after = resolveProjectAppearances([...base, project("3", "gamma", "/c")]);
    expect(after.get("1")).toEqual(before.get("1"));
    expect(after.get("2")).toEqual(before.get("2"));
  });
});

describe("resolveSingleProjectAppearance", () => {
  it("脱离 Provider 时也能给出合法结果", () => {
    const result = resolveSingleProjectAppearance(project("1", "nezha"));
    expect(result.label).toBe("NE");
    expect(PROJECT_AVATAR_COLORS).toContain(result.color);
  });
});

describe("自定义外观", () => {
  it("自定义颜色优先，且自动项会避开它", () => {
    const custom = { ...project("1", "nezha", "/a"), avatar: { color: "red" as const } };
    const other = project("2", "alpha", "/b");
    const result = resolveProjectAppearances([custom, other]);
    expect(result.get("1")?.color).toBe("red");
    expect(result.get("2")?.color).not.toBe("red");
  });

  it("自定义缩写 / emoji 直接生效，autoLabel 仍给出自然缩写", () => {
    const withLabel = { ...project("1", "nezha"), avatar: { label: "NZ" } };
    const withEmoji = { ...project("2", "alpha-beta"), avatar: { emoji: "🚀" } };
    const result = resolveProjectAppearances([withLabel, withEmoji]);
    expect(result.get("1")?.label).toBe("NZ");
    expect(result.get("1")?.autoLabel).toBe("NE");
    expect(result.get("2")?.emoji).toBe("🚀");
    expect(result.get("2")?.autoLabel).toBe("AB");
  });

  it("自动缩写会避开别的项目的自定义缩写", () => {
    const pinned = { ...project("1", "zeta", "/z"), avatar: { label: "NE" } };
    const auto = project("2", "nezha", "/n");
    const result = resolveProjectAppearances([pinned, auto]);
    expect(result.get("2")?.label).toBe("NEZ");
  });
});

describe("normalizeProjectAvatar", () => {
  it("非法颜色丢弃、emoji 只留一个 grapheme、缩写截断到 3 个字符", () => {
    expect(
      normalizeProjectAvatar({
        color: "not-a-color" as never,
        emoji: " 👨‍👩‍👧 rocket ",
        label: "  nezha ",
      }),
    ).toEqual({ emoji: "👨‍👩‍👧", label: "nez" });
  });

  it("全部为空时返回 undefined", () => {
    expect(normalizeProjectAvatar({ emoji: "", label: "   " })).toBeUndefined();
    expect(normalizeProjectAvatar(undefined)).toBeUndefined();
  });
});
