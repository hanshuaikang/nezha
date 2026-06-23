import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { I18nProvider } from "../i18n";
import { ProjectRail } from "../components/ProjectRail";
import type { Project } from "../types";

const projects: Project[] = [
  {
    id: "project-1",
    name: "Alpha",
    path: "/tmp/alpha",
    lastOpenedAt: 1,
  },
  {
    id: "project-2",
    name: "Beta",
    path: "/tmp/beta",
    lastOpenedAt: 2,
  },
];

function renderRail() {
  return render(
    <I18nProvider>
      <ProjectRail
        projects={projects}
        allTasks={[]}
        activeProjectId="project-1"
        onSwitch={() => undefined}
        onOpen={() => undefined}
      />
    </I18nProvider>,
  );
}

describe("ProjectRail", () => {
  test("toggles the project drawer closed when clicking the expand button again", async () => {
    const user = userEvent.setup();
    renderRail();

    const toggle = screen.getByRole("button", { name: "Show all projects" });

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByPlaceholderText("Search projects")).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByPlaceholderText("Search projects")).not.toBeInTheDocument();
  });
});
