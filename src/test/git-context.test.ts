import { describe, expect, it } from "vitest";
import { resolveProjectGitContext } from "../hooks/useGitRoots";

describe("resolveProjectGitContext", () => {
  it("uses the selected repository for ordinary tasks", () => {
    expect(resolveProjectGitContext("/workspace", "/workspace/api", null)).toEqual({
      displayedRepoPath: "/workspace/api",
      commandRepoPath: "/workspace/api",
      selectionLocked: false,
    });
  });

  it("pins repository display and commands to an active worktree task", () => {
    expect(
      resolveProjectGitContext("/workspace", "/workspace/web", {
        worktreeRepo: "/workspace/api",
        worktreePath: "/workspace/.nezha/worktrees/task-1",
      }),
    ).toEqual({
      displayedRepoPath: "/workspace/api",
      commandRepoPath: "/workspace/.nezha/worktrees/task-1",
      selectionLocked: true,
    });
  });

  it("falls back to the owner repository after a worktree is discarded", () => {
    expect(
      resolveProjectGitContext("/workspace", "/workspace/web", {
        worktreeRepo: "/workspace/api",
        worktreePath: "/workspace/.nezha/worktrees/task-1",
        worktreeDiscarded: true,
      }),
    ).toEqual({
      displayedRepoPath: "/workspace/api",
      commandRepoPath: "/workspace/api",
      selectionLocked: true,
    });
  });

  it("keeps legacy worktree tasks compatible with the project repository", () => {
    expect(
      resolveProjectGitContext("/workspace", "/workspace/web", {
        worktreePath: "/workspace/.nezha/worktrees/legacy-task",
      }),
    ).toEqual({
      displayedRepoPath: "/workspace",
      commandRepoPath: "/workspace/.nezha/worktrees/legacy-task",
      selectionLocked: true,
    });
  });
});
