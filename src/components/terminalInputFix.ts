import type { Terminal } from "@xterm/xterm";
import { IS_MAC_WEBKIT, IS_OTHER_WEBKIT } from "../platform";
import type { XTermWithPrivates } from "./xterm-private";

type TerminalWithInput = Pick<Terminal, "input" | "textarea">;

function getPrintableSymbolInput(data: string | null): string | null {
  if (data === null || data.length === 0) return null;
  if (data.length > 8) return null;
  if (!/^[\p{P}\p{S}]+$/u.test(data)) return null;
  return data;
}

function isSymbolInputType(inputType: string): boolean {
  return inputType === "insertText" || inputType === "insertCompositionText";
}

export function attachMacWebKitShiftInputFix(term: TerminalWithInput): () => void {
  if (!IS_MAC_WEBKIT || !term.textarea) return () => {};

  const textarea = term.textarea;
  let keydownHandledByXterm: string | null = null;

  const handleKeyDown = (event: KeyboardEvent) => {
    keydownHandledByXterm = null;
    if (
      event.keyCode !== 229 &&
      event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      getPrintableSymbolInput(event.key) !== null
    ) {
      keydownHandledByXterm = event.key;
    }
  };

  const handleBeforeInput = (event: InputEvent) => {
    const symbol = getPrintableSymbolInput(event.data);
    if (!isSymbolInputType(event.inputType) || symbol === null) {
      return;
    }
    if (keydownHandledByXterm === symbol) {
      keydownHandledByXterm = null;
      return;
    }
    term.input(symbol);
    event.preventDefault();
  };

  textarea.addEventListener("keydown", handleKeyDown);
  textarea.addEventListener("beforeinput", handleBeforeInput);

  return () => {
    textarea.removeEventListener("keydown", handleKeyDown);
    textarea.removeEventListener("beforeinput", handleBeforeInput);
  };
}

export function attachLinuxIMEFix(
  term: Terminal,
  onDataCallback: (data: string) => void,
): { dispose: () => void } {
  if (!IS_OTHER_WEBKIT || !term.textarea) {
    const disposable = term.onData(onDataCallback);
    return { dispose: () => disposable.dispose() };
  }

  const textarea = term.textarea;
  let isComposing = false;
  let compositionText = "";

  const sendText = (text: string | null | undefined) => {
    if (!text) return;
    onDataCallback(text);
  };

  const handleCompositionStartCapture = (event: CompositionEvent) => {
    isComposing = true;
    compositionText = "";
    textarea.value = "";
    event.stopImmediatePropagation();
  };

  const handleCompositionUpdateCapture = (event: CompositionEvent) => {
    compositionText = event.data ?? "";
    event.stopImmediatePropagation();
  };

  const handleCompositionEndCapture = (event: CompositionEvent) => {
    const text = event.data || compositionText;
    isComposing = false;
    compositionText = "";
    textarea.value = "";
    event.stopImmediatePropagation();
    sendText(text);
  };

  const handleBeforeInputCapture = (event: InputEvent) => {
    if (event.inputType === "insertCompositionText") {
      compositionText = event.data ?? compositionText;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const symbol = getPrintableSymbolInput(event.data);
    if (symbol !== null && isSymbolInputType(event.inputType)) {
      textarea.value = "";
      event.preventDefault();
      event.stopImmediatePropagation();
      sendText(symbol);
      return;
    }

    if (isComposing) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  const handleKeyDownCapture = (event: KeyboardEvent) => {
    if (event.keyCode === 229 || isComposing) {
      event.stopImmediatePropagation();
    }
  };

  const disposable = term.onData(onDataCallback);

  textarea.addEventListener("compositionstart", handleCompositionStartCapture, true);
  textarea.addEventListener("compositionupdate", handleCompositionUpdateCapture, true);
  textarea.addEventListener("compositionend", handleCompositionEndCapture, true);
  textarea.addEventListener("beforeinput", handleBeforeInputCapture, true);
  textarea.addEventListener("keydown", handleKeyDownCapture, true);

  return {
    dispose: () => {
      textarea.removeEventListener("compositionstart", handleCompositionStartCapture, true);
      textarea.removeEventListener("compositionupdate", handleCompositionUpdateCapture, true);
      textarea.removeEventListener("compositionend", handleCompositionEndCapture, true);
      textarea.removeEventListener("beforeinput", handleBeforeInputCapture, true);
      textarea.removeEventListener("keydown", handleKeyDownCapture, true);
      disposable.dispose();
    },
  };
}

// 远程输入法（如 UU 远程）会把整段文本作为 KeyboardEvent.key 发送，例如
// key="测试"、key="Hello, hello, hello."。这些不是普通功能键，需要走 keypress
// 分支直接发完整文本；下面列出的标准功能键/控制键则必须排除。
const NON_PRINTABLE_KEYS = new Set([
  "Alt",
  "AltGraph",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "Backspace",
  "CapsLock",
  "Clear",
  "ContextMenu",
  "Control",
  "Dead",
  "Delete",
  "End",
  "Enter",
  "Escape",
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12",
  "F13",
  "F14",
  "F15",
  "F16",
  "F17",
  "F18",
  "F19",
  "F20",
  "F21",
  "F22",
  "F23",
  "F24",
  "Home",
  "Insert",
  "Meta",
  "NumLock",
  "PageDown",
  "PageUp",
  "Pause",
  "Process",
  "ScrollLock",
  "Shift",
  "Tab",
  "Unidentified",
]);

function isMultiCharRemoteInput(key: string): boolean {
  return (
    key.length > 1 && !NON_PRINTABLE_KEYS.has(key) && /^[\p{L}\p{N}\p{P}\p{S}\p{Zs}]+$/u.test(key)
  );
}

/**
 * 修复 macOS WKWebView 在手机 / Pad 远程输入法（如 UU 远程）下，终端只能收到
 * 第一个字符的问题。
 *
 * 远程输入法会直接把候选词作为 KeyboardEvent.key 发送（例如 key="测试"），而
 * xterm 的 keypress 处理只会按 keyCode 发第一个字。这里在 capture 阶段拦截这
 * 种多字符 keypress，直接发送完整 key 文本。
 */
export function patchMacWebKitInputEvent(term: Terminal): () => void {
  if (!IS_MAC_WEBKIT) {
    return () => {};
  }

  const core = (term as XTermWithPrivates)._core;
  const element = term.element;
  const textarea = term.textarea;
  if (!element || !textarea) {
    return () => {};
  }

  const handleKeyPressCapture = (event: KeyboardEvent) => {
    if (event.target !== textarea) return;
    if (!isMultiCharRemoteInput(event.key)) return;

    core.coreService.triggerDataEvent(event.key, true);
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  element.addEventListener("keypress", handleKeyPressCapture, true);

  return () => {
    element.removeEventListener("keypress", handleKeyPressCapture, true);
  };
}
