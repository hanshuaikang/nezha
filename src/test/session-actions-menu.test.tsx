import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  buildDefaultForkTaskName,
  ForkTaskDialog,
  SessionActionsMenu,
} from "../components/running-view/SessionActionsMenu";
import { I18nProvider } from "../i18n";

describe("session fork actions", () => {
  it("builds the default name from the current task title", () => {
    expect(buildDefaultForkTaskName("Current task", "ignored prompt", "Untitled task")).toBe(
      "Fork-Current task",
    );
    expect(buildDefaultForkTaskName(undefined, "Prompt title", "Untitled task")).toBe(
      "Fork-Prompt title",
    );
    expect(
      buildDefaultForkTaskName(undefined, "  Multi-line\nprompt\t title  ", "Untitled task"),
    ).toBe("Fork-Multi-line prompt title");
    expect(buildDefaultForkTaskName(undefined, "   ", "Untitled task")).toBe("Fork-Untitled task");
    expect(buildDefaultForkTaskName(undefined, "a".repeat(71), "Untitled task")).toBe(
      `Fork-${"a".repeat(70)}…`,
    );
  });

  it("trims and submits the fork task name", () => {
    const onFork = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <I18nProvider>
        <ForkTaskDialog
          open
          defaultName="Fork-Current task"
          onOpenChange={onOpenChange}
          onFork={onFork}
        />
      </I18nProvider>,
    );

    const input = screen.getByLabelText("Task name");
    fireEvent.change(input, { target: { value: "  Fork-Renamed  " } });
    fireEvent.click(screen.getByRole("button", { name: "Fork" }));

    expect(onFork).toHaveBeenCalledWith("Fork-Renamed");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables worktree forks while keeping export in the More menu", async () => {
    const onExport = vi.fn();

    render(
      <I18nProvider>
        <SessionActionsMenu
          defaultForkName="Fork-Current task"
          forkDisabledReason="Fork is not supported for worktree tasks yet."
          canExport
          exporting={false}
          onFork={vi.fn()}
          onExport={onExport}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "More session actions" }));

    const forkItem = await screen.findByRole("menuitem", { name: /Fork session/ });
    expect(forkItem).toBeDisabled();
    expect(screen.getByText("Fork is not supported for worktree tasks yet.")).toBeVisible();

    fireEvent.click(screen.getByRole("menuitem", { name: "Export as Markdown" }));
    expect(onExport).toHaveBeenCalledOnce();
  });
});
