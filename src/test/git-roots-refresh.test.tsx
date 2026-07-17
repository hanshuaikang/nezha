import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GitRoot } from "../types";
import { useGitRoots } from "../hooks/useGitRoots";

const invokeMock = vi.fn();
const unlistenMock = vi.fn();
let fsChangedHandler: ((event: { payload: { dir: string } }) => void) | null = null;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((_event: string, handler: (event: { payload: { dir: string } }) => void) => {
    fsChangedHandler = handler;
    return Promise.resolve(unlistenMock);
  }),
}));

const rootA: GitRoot = { path: "/workspace/a", name: "a", isRoot: false };
const rootB: GitRoot = { path: "/workspace/b", name: "b", isRoot: false };

describe("useGitRoots refresh", () => {
  afterEach(() => {
    cleanup();
    invokeMock.mockReset();
    unlistenMock.mockReset();
    fsChangedHandler = null;
    localStorage.clear();
  });

  it("rediscovers repositories when the project root changes", async () => {
    let discovered = [rootA];
    invokeMock.mockImplementation((command: string) => {
      if (command === "discover_git_roots") return Promise.resolve(discovered);
      if (command === "watch_dir") return Promise.resolve(true);
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useGitRoots("project-1", "/workspace", true));
    await waitFor(() => expect(result.current.roots).toEqual([rootA]));

    discovered = [rootA, rootB];
    act(() => {
      fsChangedHandler?.({ payload: { dir: "/workspace" } });
    });

    await waitFor(() => expect(result.current.roots).toEqual([rootA, rootB]));
  });

  it("rediscovers repositories when an inactive project becomes visible again", async () => {
    let discovered = [rootA];
    invokeMock.mockImplementation((command: string) => {
      if (command === "discover_git_roots") return Promise.resolve(discovered);
      if (command === "watch_dir") return Promise.resolve(true);
      return Promise.resolve(null);
    });

    const { result, rerender } = renderHook(
      ({ active }) => useGitRoots("project-1", "/workspace", active),
      { initialProps: { active: true } },
    );
    await waitFor(() => expect(result.current.roots).toEqual([rootA]));

    rerender({ active: false });
    discovered = [rootA, rootB];
    rerender({ active: true });

    await waitFor(() => expect(result.current.roots).toEqual([rootA, rootB]));
  });
});
