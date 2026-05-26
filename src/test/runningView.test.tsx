import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RunningView } from "../components/RunningView";
import type { TerminalController } from "../components/TerminalView";
import type { Task } from "../types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve({ duration_secs: 0 })),
}));

vi.mock("../hooks/useUsageSnapshot", () => ({
  useUsageSnapshot: () => ({ snapshot: null }),
}));

vi.mock("../components/TerminalView", () => ({
  TerminalView: ({
    onRegisterTerminal,
    onReady,
  }: {
    onRegisterTerminal: (controller: TerminalController | null) => number;
    onReady: (generation: number) => void;
  }) => {
    const generation = onRegisterTerminal({
      write: () => {},
      revealLatest: () => {},
    });
    onReady(generation);
    return <div data-testid="terminal-view" />;
  },
}));

const codexTask: Task = {
  id: "task-1",
  projectId: "project-1",
  prompt: "Test prompt",
  agent: "codex",
  permissionMode: "ask",
  status: "running",
  createdAt: 1,
};

describe("RunningView Codex composer", () => {
  it("reveals the latest terminal output after submitting composer input", () => {
    const onInput = vi.fn();
    const revealLatest = vi.fn();

    render(
      <RunningView
        task={codexTask}
        onCancel={vi.fn()}
        onInput={onInput}
        onResize={vi.fn()}
        onRegisterTerminal={() => 1}
        onTerminalReady={vi.fn()}
        onRevealTerminalLatest={revealLatest}
        onRename={vi.fn()}
        isDark={false}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Type a Codex reply"), {
      target: { value: "continue" },
    });
    fireEvent.click(screen.getByTitle("Send to Codex"));

    expect(onInput).toHaveBeenCalledWith("\x1b[200~continue\x1b[201~\r");
    expect(revealLatest).toHaveBeenCalledTimes(1);
  });
});
