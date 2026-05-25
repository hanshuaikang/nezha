import { describe, expect, it } from "vitest";
import { resolvePromptTemplate } from "../utils/promptTemplates";
import type { Project, PromptTemplate } from "../types";

const project: Project = {
  id: "p1",
  name: "nezha",
  path: "/Users/example/nezha",
  branch: "main",
  lastOpenedAt: 1,
};

describe("resolvePromptTemplate", () => {
  it("replaces supported variables", () => {
    const template: PromptTemplate = {
      id: "bugfix",
      name: "Bug Fix",
      content: "Fix {projectName} at {projectPath} on {branch} using {agent} on {date}.",
    };

    expect(
      resolvePromptTemplate(template, {
        project,
        branch: "feature/x",
        agent: "codex",
        now: new Date("2026-05-25T08:00:00Z"),
      }),
    ).toBe("Fix nezha at /Users/example/nezha on feature/x using codex on 2026-05-25.");
  });

  it("preserves unknown variables", () => {
    const template: PromptTemplate = {
      id: "unknown",
      name: "Unknown",
      content: "Keep {unknownValue} but replace {projectName}.",
    };

    expect(resolvePromptTemplate(template, { project, agent: "claude" })).toBe(
      "Keep {unknownValue} but replace nezha.",
    );
  });
});
