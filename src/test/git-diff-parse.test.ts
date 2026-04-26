import { describe, expect, it } from "vitest";
import { parseDiff } from "../components/git-diff/parse";

describe("parseDiff", () => {
  it("normalizes no-index diffs for untracked files under the project", () => {
    const projectPath = "/Users/hanshu/Documents/workspace/nezha";
    const diff = [
      "diff --git a/var/folders/lk/nezha-empty-550e8400-e29b-41d4-a716-446655440000.tmp b/Users/hanshu/Documents/workspace/nezha/src/new-file.ts",
      "index e69de29..ce01362 100644",
      "--- a/var/folders/lk/nezha-empty-550e8400-e29b-41d4-a716-446655440000.tmp",
      "+++ b/Users/hanshu/Documents/workspace/nezha/src/new-file.ts",
      "@@ -0,0 +1 @@",
      "+hello",
      "",
    ].join("\n");

    const [file] = parseDiff(diff, projectPath);

    expect(file.oldPath).toBe("/dev/null");
    expect(file.newPath).toBe("src/new-file.ts");
    expect(file.displayPath).toBe("src/new-file.ts");
    expect(file.status).toBe("added");
    expect(file.additions).toBe(1);
    expect(file.deletions).toBe(0);
  });
});
