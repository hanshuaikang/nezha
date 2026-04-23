import { useRef, useCallback } from "react";
import type { Project } from "../../types";
import { CODE_EXTS } from "../../utils";
import type { FileEntry, CrossProjectRef, MentionItem } from "./MentionPopover";
import s from "../../styles";

const FILE_CODE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 12.5 8 15l2 2.5"/><path d="m14 12.5 2 2.5-2 2.5"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/></svg>`;
const FILE_TEXT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`;

function getMentionInfo(): {
  node: Text;
  atOffset: number;
  endOffset: number;
  query: string;
} | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return null;
  if (range.startContainer.nodeType !== Node.TEXT_NODE) return null;
  const textNode = range.startContainer as Text;
  const textBefore = textNode.textContent!.substring(0, range.startOffset);
  const atIdx = textBefore.lastIndexOf("@");
  if (atIdx === -1) return null;
  const query = textBefore.substring(atIdx + 1);
  if (query.includes(" ") || query.includes("\n")) return null;
  return { node: textNode, atOffset: atIdx, endOffset: range.startOffset, query };
}

function createChipElement(file: FileEntry, crossProject?: CrossProjectRef): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.contentEditable = "false";
  chip.dataset.filePath = file.path;
  chip.dataset.fileExt = file.ext;
  if (crossProject) {
    chip.dataset.projectId = crossProject.id;
    chip.dataset.projectPath = crossProject.path;
    chip.dataset.projectName = crossProject.name;
  }

  const iconSpan = document.createElement("span");
  iconSpan.innerHTML = CODE_EXTS.has(file.ext) ? FILE_CODE_SVG : FILE_TEXT_SVG;
  iconSpan.style.cssText = "display:inline-flex;align-items:center;flex-shrink:0;";

  chip.appendChild(iconSpan);

  if (crossProject) {
    const projSpan = document.createElement("span");
    projSpan.textContent = crossProject.name;
    projSpan.style.cssText = "opacity:0.55;font-size:11.5px;flex-shrink:0;";

    const sepSpan = document.createElement("span");
    sepSpan.textContent = "/";
    sepSpan.style.cssText = "opacity:0.35;font-size:11px;flex-shrink:0;margin:0 1px;";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = file.name;

    chip.appendChild(projSpan);
    chip.appendChild(sepSpan);
    chip.appendChild(nameSpan);
  } else {
    const nameSpan = document.createElement("span");
    nameSpan.textContent = file.name;
    chip.appendChild(nameSpan);
  }

  const baseStyles = [
    "display:inline-flex",
    "align-items:center",
    "gap:3px",
    "padding:0px 4px 0px 3px",
    "border:none",
    "border-radius:3px",
    "font-size:13.5px",
    "font-weight:500",
    "color:var(--accent)",
    "vertical-align:middle",
    "margin:0 1px",
    "cursor:default",
    "-webkit-user-select:none",
    "user-select:none",
    "line-height:inherit",
    "opacity:0.85",
  ];

  chip.style.cssText = [
    ...baseStyles,
    crossProject
      ? "background:color-mix(in srgb, var(--accent) 8%, transparent)"
      : "background:none",
  ].join(";");

  return chip;
}

function serializeEditor(editor: HTMLDivElement): string {
  const parts: string[] = [];

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent || "");
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.tagName === "BR") {
        parts.push("\n");
      } else if (el.dataset.filePath) {
        if (el.dataset.projectPath) {
          parts.push(`@${el.dataset.projectPath}/${el.dataset.filePath}`);
        } else {
          parts.push(`@${el.dataset.filePath}`);
        }
      } else if (el.tagName === "DIV" || el.tagName === "P") {
        if (parts.length > 0 && parts[parts.length - 1] !== "\n") {
          parts.push("\n");
        }
        el.childNodes.forEach(walk);
      } else {
        el.childNodes.forEach(walk);
      }
    }
  }

  editor.childNodes.forEach(walk);
  return parts
    .join("")
    .replace(/\u00A0/g, " ")
    .replace(/\u200B/g, "")
    .trim();
}

export interface PromptEditorHandle {
  serialize: () => string;
  clear: () => void;
  focus: () => void;
}

export function usePromptEditor() {
  const editorRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);

  const handle: PromptEditorHandle = {
    serialize: () => (editorRef.current ? serializeEditor(editorRef.current) : ""),
    clear: () => {
      if (editorRef.current) editorRef.current.innerHTML = "";
    },
    focus: () => editorRef.current?.focus(),
  };

  return { editorRef, isComposingRef, handle };
}

export function PromptEditor({
  editorRef,
  isComposingRef,
  isEmpty,
  mentionItems,
  mentionIndex,
  onSetIsEmpty,
  onUpdateMention,
  onSelectFile,
  onSelectProject,
  onSetMentionIndex,
  onSubmit,
}: {
  editorRef: React.RefObject<HTMLDivElement | null>;
  isComposingRef: React.MutableRefObject<boolean>;
  isEmpty: boolean;
  mentionItems: MentionItem[];
  mentionIndex: number;
  onSetIsEmpty: (empty: boolean) => void;
  onUpdateMention: () => void;
  onSelectFile: (file: FileEntry, crossProject?: CrossProjectRef) => void;
  onSelectProject: (project: Project) => void;
  onSetMentionIndex: (index: number) => void;
  onSubmit: (immediate: boolean) => void;
}) {
  const selectFile = useCallback(
    (file: FileEntry, crossProject?: CrossProjectRef) => {
      const editor = editorRef.current;
      if (!editor) return;
      const info = getMentionInfo();
      if (!info) return;

      const { node, atOffset, endOffset } = info;
      const range = document.createRange();
      range.setStart(node, atOffset);
      range.setEnd(node, endOffset);
      range.deleteContents();

      const chip = createChipElement(file, crossProject);
      range.insertNode(chip);

      const space = document.createTextNode(" ");
      chip.after(space);
      const newRange = document.createRange();
      newRange.setStart(space, 1);
      newRange.collapse(true);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(newRange);

      onSelectFile(file, crossProject);
      onSetIsEmpty(false);
      editor.focus();
    },
    [editorRef, onSelectFile, onSetIsEmpty],
  );

  const selectProject = useCallback(
    (proj: Project) => {
      const editor = editorRef.current;
      if (!editor) return;
      const info = getMentionInfo();
      if (!info) return;

      const { node, atOffset, endOffset } = info;
      const range = document.createRange();
      range.setStart(node, atOffset);
      range.setEnd(node, endOffset);
      range.deleteContents();

      const inserted = document.createTextNode(`@${proj.name}/`);
      range.insertNode(inserted);

      const newRange = document.createRange();
      newRange.setStart(inserted, inserted.length);
      newRange.collapse(true);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(newRange);

      onSelectProject(proj);
      editor.focus();
    },
    [editorRef, onSelectProject],
  );

  function updateMentionState() {
    const info = getMentionInfo();
    if (info) {
      onUpdateMention();
    } else {
      onUpdateMention();
    }
  }

  function handleInput() {
    const editor = editorRef.current;
    if (!editor) return;
    const text = editor.textContent || "";
    const hasChips = !!editor.querySelector("[data-file-path]");
    onSetIsEmpty(!text.trim() && !hasChips);
    if (!isComposingRef.current) {
      onUpdateMention();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (mentionItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        onSetMentionIndex(Math.min(mentionIndex + 1, mentionItems.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        onSetMentionIndex(Math.max(mentionIndex - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const item = mentionItems[mentionIndex];
        if (item) {
          if (item.kind === "file") selectFile(item.file, item.crossProject);
          else selectProject(item.project);
        }
        return;
      }
      if (e.key === "Escape") {
        onUpdateMention();
        return;
      }
    }
    if (e.metaKey && e.key === "Enter") {
      e.preventDefault();
      onSubmit(true);
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length > 0) {
      // Image paste is handled by the parent — we just prevent default
      return;
    }
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    onSetIsEmpty(false);
    onUpdateMention();
  }

  return (
    <div style={{ position: "relative" }}>
      {isEmpty && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            padding: "22px 24px 12px",
            color: "var(--text-hint)",
            fontSize: 14,
            lineHeight: 1.65,
            pointerEvents: "none",
            userSelect: "none",
            fontFamily: "var(--font-ui)",
          }}
        >
          Describe your task… type @ to mention a file
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onSelect={updateMentionState}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
          onUpdateMention();
        }}
        style={
          {
            ...s.composeTextarea,
            height: 120,
            overflowY: "auto",
            wordBreak: "break-word",
            whiteSpace: "pre-wrap",
            userSelect: "text",
            WebkitUserSelect: "text",
            boxSizing: "border-box",
          } as React.CSSProperties
        }
      />
    </div>
  );
}
