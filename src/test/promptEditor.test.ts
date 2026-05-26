import { describe, expect, it } from "vitest";
import {
  insertLineBreakAtSelection,
  serializeEditorForTest,
} from "../components/new-task/PromptEditor";

describe("PromptEditor", () => {
  it("serializes inserted line breaks as newlines", () => {
    const editor = document.createElement("div");
    const textNode = document.createTextNode("first");
    editor.appendChild(textNode);
    document.body.appendChild(editor);

    const range = document.createRange();
    range.setStart(textNode, textNode.length);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    insertLineBreakAtSelection(editor);
    expect(editor.textContent).toContain("\n");

    const selectionAfterBreak = window.getSelection();
    const rangeAfterBreak = selectionAfterBreak?.getRangeAt(0);
    const tail = document.createTextNode("second");
    rangeAfterBreak?.insertNode(tail);

    expect(serializeEditorForTest(editor)).toBe("first\nsecond");

    editor.remove();
  });
});
