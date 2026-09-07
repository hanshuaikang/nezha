import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SkillStorePanel } from "../components/skill-hub/SkillStorePanel";
import { SKILL_HUB_CHANGED_EVENT } from "../components/app-settings/types";
import { I18nProvider } from "../i18n";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

function renderPanel(active: boolean) {
  return render(
    <I18nProvider>
      <SkillStorePanel
        projectId="project-1"
        active={active}
        width={280}
        onOpenAppSettings={vi.fn()}
      />
    </I18nProvider>,
  );
}

describe("SkillStorePanel refresh", () => {
  afterEach(() => {
    invokeMock.mockReset();
    localStorage.clear();
  });

  it("ignores hub change events while inactive and refreshes when reactivated", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_skill_hub_config") {
        return Promise.resolve({ hubPath: "/skills" });
      }
      return Promise.resolve([]);
    });

    const view = renderPanel(true);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("get_skill_hub_config", undefined));

    view.rerender(
      <I18nProvider>
        <SkillStorePanel
          projectId="project-1"
          active={false}
          width={280}
          onOpenAppSettings={vi.fn()}
        />
      </I18nProvider>,
    );
    invokeMock.mockClear();

    act(() => {
      window.dispatchEvent(new CustomEvent(SKILL_HUB_CHANGED_EVENT));
    });
    expect(invokeMock).not.toHaveBeenCalled();

    view.rerender(
      <I18nProvider>
        <SkillStorePanel projectId="project-1" active width={280} onOpenAppSettings={vi.fn()} />
      </I18nProvider>,
    );

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("get_skill_hub_config", undefined));
  });
});
