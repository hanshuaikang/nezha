import { createRef } from "react";
import type { RefObject } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { Project } from "../types";
import { I18nProvider } from "../i18n";
import type { MentionItem } from "../components/new-task/MentionPopover";
import {
  PromptEditor,
  type PromptEditorHandle,
  usePromptEditor,
} from "../components/new-task/PromptEditor";
import type { SendShortcut } from "../shortcuts";

function editorText(editor: HTMLElement) {
  return editor.textContent ?? "";
}

function PromptEditorHarness({
  sendShortcut,
  mentionItems = [],
  onSubmit,
  onContentChange,
  handleRef,
}: {
  sendShortcut: SendShortcut;
  mentionItems?: MentionItem[];
  onSubmit: (immediate: boolean) => void;
  onContentChange?: Parameters<typeof PromptEditor>[0]["onContentChange"];
  handleRef: RefObject<PromptEditorHandle | null>;
}) {
  const { editorRef, isComposingRef, handle } = usePromptEditor();
  handleRef.current = handle;
  return (
    <I18nProvider>
      <PromptEditor
        editorRef={editorRef}
        isComposingRef={isComposingRef}
        isEmpty={false}
        mentionItems={mentionItems}
        mentionIndex={0}
        onSetIsEmpty={vi.fn()}
        onUpdateMention={vi.fn()}
        onSelectFile={vi.fn()}
        onSelectProject={vi.fn<(project: Project) => void>()}
        onSetMentionIndex={vi.fn()}
        sendShortcut={sendShortcut}
        onSubmit={onSubmit}
        onContentChange={onContentChange}
      />
    </I18nProvider>
  );
}

describe("PromptEditor shortcut behavior", () => {
  test("Cmd+Enter inserts a serializable newline without submitting when Enter sends", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const handleRef = createRef<PromptEditorHandle>();
    render(<PromptEditorHarness sendShortcut="enter" onSubmit={onSubmit} handleRef={handleRef} />);

    const editor = screen.getByRole("textbox");
    await user.click(editor);
    await user.keyboard("first");
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    await user.keyboard("second");

    expect(onSubmit).not.toHaveBeenCalled();
    expect(editorText(editor)).toBe("first\nsecond");
    expect(handleRef.current?.serialize()).toBe("first\nsecond");
  });

  test("Ctrl+Enter inserts a serializable newline without submitting when Enter sends", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const handleRef = createRef<PromptEditorHandle>();
    render(<PromptEditorHarness sendShortcut="enter" onSubmit={onSubmit} handleRef={handleRef} />);

    const editor = screen.getByRole("textbox");
    await user.click(editor);
    await user.keyboard("first");
    await user.keyboard("{Control>}{Enter}{/Control}");
    await user.keyboard("second");

    expect(onSubmit).not.toHaveBeenCalled();
    expect(editorText(editor)).toBe("first\nsecond");
    expect(handleRef.current?.serialize()).toBe("first\nsecond");
  });

  test("modifier newline updates captured editor content", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onContentChange = vi.fn();
    const handleRef = createRef<PromptEditorHandle>();
    render(
      <PromptEditorHarness
        sendShortcut="enter"
        onSubmit={onSubmit}
        onContentChange={onContentChange}
        handleRef={handleRef}
      />,
    );

    const editor = screen.getByRole("textbox");
    await user.click(editor);
    await user.keyboard("first");
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(onContentChange).toHaveBeenLastCalledWith({
      html: "first\n",
      text: "first\n",
      hasChips: false,
    });
  });
});
