import type { Terminal } from "@xterm/xterm";
import { APP_PLATFORM } from "../platform";

type TerminalWithInput = Pick<Terminal, "input" | "textarea">;

function isMacWebKit(): boolean {
  if (APP_PLATFORM !== "macos" || typeof navigator === "undefined") return false;
  return navigator.userAgent.includes("AppleWebKit");
}

function isLinuxWebKit(): boolean {
  if (APP_PLATFORM !== "other" || typeof navigator === "undefined") return false;
  return navigator.userAgent.includes("AppleWebKit");
}

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
  if (!isMacWebKit() || !term.textarea) return () => {};

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
  if (!isLinuxWebKit() || !term.textarea) {
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
