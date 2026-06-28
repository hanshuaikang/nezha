import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileExplorerContextMenu } from "../components/file-explorer/ContextMenu";
import { I18nProvider } from "../i18n";

const noop = () => {};

function renderMenu(x: number, y: number) {
  return render(
    <I18nProvider>
      <FileExplorerContextMenu
        ctxMenu={{
          x,
          y,
          path: "/project/src/App.tsx",
          isDir: false,
          isRoot: false,
        }}
        onClose={noop}
        onNewFile={noop}
        onNewFolder={noop}
        onDelete={noop}
        onOpenInSystem={noop}
        onCopyPath={noop}
      />
    </I18nProvider>,
  );
}

describe("FileExplorerContextMenu", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the menu inside the viewport when opened near the bottom-right edge", () => {
    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: 320,
    });
    Object.defineProperty(document.documentElement, "clientHeight", {
      configurable: true,
      value: 240,
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 180,
      bottom: 210,
      width: 180,
      height: 210,
      toJSON: () => ({}),
    });

    renderMenu(315, 235);

    const menu = screen.getByRole("button", { name: "New File" }).parentElement;

    expect(menu).toHaveStyle({ left: "132px", top: "22px" });
  });
});
