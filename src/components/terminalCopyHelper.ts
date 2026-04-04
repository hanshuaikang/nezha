import type { Terminal } from "@xterm/xterm";

/** Threshold below which we use the fast synchronous path. */
const FAST_PATH_MAX_LINES = 200;
const FAST_PATH_MAX_BYTES = 128 * 1024; // 128 KB

/** How many lines to process per chunk before yielding. */
const LINES_PER_CHUNK = 128;

type SelectionPosition = [column: number, row: number];

interface XtermSelectionService {
  selectionStart?: SelectionPosition | null;
  selectionEnd?: SelectionPosition | null;
}

type TerminalWithSelectionService = Terminal & {
  _core?: {
    _selectionService?: XtermSelectionService;
  };
};

function getSelectionService(terminal: Terminal): XtermSelectionService | undefined {
  return (terminal as TerminalWithSelectionService)._core?._selectionService;
}

/** Yield to the main thread so rendering / PTY writes can proceed. */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Read the selected text from the xterm buffer line-by-line in async chunks.
 * This avoids the single long-task that `terminal.getSelection()` produces
 * when thousands of lines are selected.
 */
async function readSelectionChunked(terminal: Terminal): Promise<string> {
  const sel = getSelectionService(terminal);
  if (!sel) {
    // Fallback: internal API unavailable
    return terminal.getSelection();
  }

  const selectionStart = sel.selectionStart;
  const selectionEnd = sel.selectionEnd;
  if (!selectionStart || !selectionEnd) {
    return terminal.getSelection();
  }

  // Normalise: ensure start is before end
  let startRow = selectionStart[1];
  let startCol = selectionStart[0];
  let endRow = selectionEnd[1];
  let endCol = selectionEnd[0];

  if (startRow > endRow || (startRow === endRow && startCol > endCol)) {
    [startRow, endRow] = [endRow, startRow];
    [startCol, endCol] = [endCol, startCol];
  }

  const buffer = terminal.buffer.active;
  const chunks: string[] = [];
  let linesInChunk = 0;

  for (let y = startRow; y <= endRow; y++) {
    const line = buffer.getLine(y);
    if (!line) continue;

    const isSingleLine = startRow === endRow;
    const isFirstLine = y === startRow;
    const isLastLine = y === endRow;

    let trimStart = 0;
    let trimEnd = terminal.cols;

    if (isSingleLine) {
      trimStart = startCol;
      trimEnd = endCol;
    } else if (isFirstLine) {
      trimStart = startCol;
    } else if (isLastLine) {
      trimEnd = endCol;
    }

    const text = line.translateToString(!isLastLine || isSingleLine, trimStart, trimEnd);
    chunks.push(text);

    // Add newline between lines, but not after wrapped lines or the last line
    if (!isLastLine && !line.isWrapped) {
      // The next line being wrapped means it's a continuation — don't add \n
      const nextLine = buffer.getLine(y + 1);
      if (!nextLine || !nextLine.isWrapped) {
        chunks.push("\n");
      }
    }

    linesInChunk++;
    if (linesInChunk >= LINES_PER_CHUNK) {
      linesInChunk = 0;
      await yieldToMain();
    }
  }

  return chunks.join("");
}

/**
 * Smart copy: fast path for small selections, chunked async path for large ones.
 * Returns true if the copy was handled, false if the caller should fall through
 * to default behaviour (e.g. Ctrl-C sending SIGINT when nothing is selected).
 */
export async function smartCopy(terminal: Terminal): Promise<boolean> {
  if (!terminal.hasSelection()) return false;

  const sel = getSelectionService(terminal);
  let lineCount = 0;
  if (sel?.selectionStart && sel?.selectionEnd) {
    lineCount = Math.abs(sel.selectionEnd[1] - sel.selectionStart[1]) + 1;
  }

  let text: string;

  if (lineCount <= FAST_PATH_MAX_LINES) {
    // Fast path: synchronous — small enough to not matter
    text = terminal.getSelection();
    if (text.length > FAST_PATH_MAX_BYTES) {
      // Oops, still large (very wide lines). Fall through to chunked.
      text = await readSelectionChunked(terminal);
    }
  } else {
    // Chunked path: yield between batches of lines
    text = await readSelectionChunked(terminal);
  }

  if (!text) return false;

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for older WebView or permission denial
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }

  return true;
}

/**
 * Attach the smart copy handler to a terminal instance.
 * Returns a dispose function.
 */
export function attachSmartCopy(terminal: Terminal): () => void {
  let copyInProgress = false;

  const handleCustomKeyEvent = (e: KeyboardEvent) => {
    const isCopy =
      (e.metaKey || e.ctrlKey) && e.key === "c" && e.type === "keydown";

    if (!isCopy) return true; // Let xterm handle other keys
    if (!terminal.hasSelection()) return true; // No selection → send SIGINT as normal

    if (copyInProgress) {
      e.preventDefault();
      return false;
    }

    // Prevent default and handle copy ourselves
    e.preventDefault();
    copyInProgress = true;

    smartCopy(terminal).finally(() => {
      copyInProgress = false;
    });

    return false; // Don't let xterm process this key
  };

  terminal.attachCustomKeyEventHandler(handleCustomKeyEvent);

  return () => {
    terminal.attachCustomKeyEventHandler(() => true);
  };
}
