import type { Terminal } from "@xterm/xterm";
import { APP_PLATFORM } from "../platform";

type TerminalWithInput = Pick<Terminal, "input" | "textarea">;

function isMacWebKit(): boolean {
  if (APP_PLATFORM !== "macos" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isWebKit = ua.includes("AppleWebKit");
  return isWebKit;
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
