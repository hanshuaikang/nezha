import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectAppearanceEditor } from "../components/project-rail/ProjectAppearanceEditor";
import { I18nProvider } from "../i18n";

const project = {
  id: "project-1",
  name: "nezha",
  path: "/workspace/nezha",
  lastOpenedAt: 1,
};

function renderEditor() {
  const onChange = vi.fn();
  render(
    <I18nProvider>
      <ProjectAppearanceEditor project={project} onChange={onChange} />
    </I18nProvider>,
  );
  return { onChange };
}

describe("ProjectAppearanceEditor", () => {
  it("输入法组合期间不截断、不提交，组合结束后提交中文缩写", () => {
    const { onChange } = renderEditor();
    const input = screen.getByRole("textbox", { name: "Initials" });

    // 拼音组合中:受控值原样回显(超过 3 个字母也不能截断,否则组合被打断)
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "nezha" } });
    expect(input).toHaveValue("nezha");
    expect(onChange).not.toHaveBeenCalled();

    // 选字上屏:compositionend 时归一化 + 提交
    fireEvent.compositionEnd(input, { target: { value: "哪吒" } });
    expect(onChange).toHaveBeenCalledWith({ label: "哪吒" });
    expect(input).toHaveValue("哪吒");
  });

  it("非组合输入按显示宽度截断到 3 个字母", () => {
    const { onChange } = renderEditor();
    const input = screen.getByRole("textbox", { name: "Initials" });
    fireEvent.change(input, { target: { value: "nezha" } });
    expect(onChange).toHaveBeenCalledWith({ label: "nez" });
    expect(input).toHaveValue("nez");
  });

  it("emoji 框同样等待组合结束，只保留一个字符", () => {
    const { onChange } = renderEditor();
    fireEvent.click(screen.getByRole("tab", { name: "Emoji" }));
    const input = screen.getByRole("textbox", { name: "Emoji" });

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "huo" } });
    expect(input).toHaveValue("huo");
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.compositionEnd(input, { target: { value: "火" } });
    expect(onChange).toHaveBeenCalledWith({ emoji: "火" });
  });
});
