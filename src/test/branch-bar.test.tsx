import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BranchBar } from "../components/task-panel/BranchBar";
import { I18nProvider } from "../i18n";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("BranchBar", () => {
  it("ignores a late branch response from the previously selected repository", async () => {
    const repoA = deferred<Array<{ name: string; current: boolean; remote: null }>>();
    const repoB = deferred<Array<{ name: string; current: boolean; remote: null }>>();
    invokeMock.mockImplementation((command: string, args?: { repoPath?: string }) => {
      if (command !== "git_list_branches") return Promise.resolve(null);
      return args?.repoPath === "/workspace/a" ? repoA.promise : repoB.promise;
    });

    const view = render(
      <I18nProvider>
        <BranchBar projectRoot="/workspace" repoPath="/workspace/a" />
      </I18nProvider>,
    );

    view.rerender(
      <I18nProvider>
        <BranchBar projectRoot="/workspace" repoPath="/workspace/b" />
      </I18nProvider>,
    );

    repoB.resolve([{ name: "repo-b-main", current: true, remote: null }]);
    expect(await screen.findByText("repo-b-main")).toBeInTheDocument();

    repoA.resolve([{ name: "repo-a-main", current: true, remote: null }]);
    await Promise.resolve();

    expect(screen.getByText("repo-b-main")).toBeInTheDocument();
    expect(screen.queryByText("repo-a-main")).not.toBeInTheDocument();
  });
});
