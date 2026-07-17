import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitChanges } from "../components/GitChanges";
import { I18nProvider } from "../i18n";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function renderChanges(repoPath: string) {
  return render(
    <I18nProvider>
      <GitChanges
        projectRoot="/workspace"
        repoPath={repoPath}
        currentTaskCreatedAt={null}
        onFileSelect={vi.fn()}
      />
    </I18nProvider>,
  );
}

describe("GitChanges repository changes", () => {
  afterEach(() => {
    invokeMock.mockReset();
  });

  it("ignores a generated commit message from the previously selected repository", async () => {
    const generated = deferred<string>();
    invokeMock.mockImplementation((command: string) => {
      if (command === "git_status") return Promise.resolve([]);
      if (command === "generate_commit_message") return generated.promise;
      return Promise.resolve(null);
    });

    const view = renderChanges("/workspace/a");
    fireEvent.click(screen.getByTitle("Generate commit message with AI"));

    view.rerender(
      <I18nProvider>
        <GitChanges
          projectRoot="/workspace"
          repoPath="/workspace/b"
          currentTaskCreatedAt={null}
          onFileSelect={vi.fn()}
        />
      </I18nProvider>,
    );

    await act(async () => {
      generated.resolve("message for repository A");
      await generated.promise;
    });

    expect(screen.getByPlaceholderText("Commit message…")).toHaveValue("");
  });

  it("does not clear a new repository draft when an old commit finishes", async () => {
    const committed = deferred<null>();
    invokeMock.mockImplementation((command: string) => {
      if (command === "git_status") return Promise.resolve([]);
      if (command === "git_commit") return committed.promise;
      return Promise.resolve(null);
    });

    const view = renderChanges("/workspace/a");
    const textarea = screen.getByPlaceholderText("Commit message…");
    fireEvent.change(textarea, { target: { value: "commit repository A" } });
    fireEvent.click(screen.getByRole("button", { name: "Commit" }));

    view.rerender(
      <I18nProvider>
        <GitChanges
          projectRoot="/workspace"
          repoPath="/workspace/b"
          currentTaskCreatedAt={null}
          onFileSelect={vi.fn()}
        />
      </I18nProvider>,
    );

    await waitFor(() => expect(textarea).toHaveValue(""));
    fireEvent.change(textarea, { target: { value: "draft for repository B" } });

    await act(async () => {
      committed.resolve(null);
      await committed.promise;
    });

    expect(textarea).toHaveValue("draft for repository B");
  });
});
