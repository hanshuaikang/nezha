import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";

// ── Theme ────────────────────────────────────────────────────────────────────

export const DARK_THEME = {
  background: "#1e2230",
  foreground: "#cdd6f4",
  cursor: "#cdd6f4",
  selectionBackground: "#45475a",
  black: "#484f58",
  red: "#ff7b72",
  green: "#3fb950",
  yellow: "#d29922",
  blue: "#58a6ff",
  magenta: "#d2a8ff",
  cyan: "#39c5cf",
  white: "#b1bac4",
  brightBlack: "#6e7681",
  brightRed: "#ffa198",
  brightGreen: "#56d364",
  brightYellow: "#e3b341",
  brightBlue: "#79c0ff",
  brightMagenta: "#f0a1ff",
  brightCyan: "#56d4dd",
  brightWhite: "#f0f6fc",
};

export const LIGHT_THEME = {
  background: "#ffffff",
  foreground: "#24292f",
  cursor: "#24292f",
  selectionBackground: "#b3d7ff",
  black: "#24292f",
  red: "#cf222e",
  green: "#116329",
  yellow: "#9a6700",
  blue: "#0550ae",
  magenta: "#8250df",
  cyan: "#1b7c83",
  white: "#6e7781",
  brightBlack: "#57606a",
  brightRed: "#a40e26",
  brightGreen: "#1a7f37",
  brightYellow: "#633c01",
  brightBlue: "#0969da",
  brightMagenta: "#6639ba",
  brightCyan: "#3192aa",
  brightWhite: "#8c959f",
};

// ── Watermark flow control ───────────────────────────────────────────────────

const HIGH_WATER = 128 * 1024; // 128 KB：超过时停止写入
const LOW_WATER  =  16 * 1024; //  16 KB：恢复写入

export interface SmartWriter {
  write: (data: string, callback?: () => void) => void;
  drainPending: () => void;
  setSelectionPaused: (paused: boolean) => void;
}

/**
 * 创建基于水位线的流控写入器。
 *
 * - 当 xterm write queue 积累超过 HIGH_WATER 时暂停写入
 * - 低于 LOW_WATER 时恢复
 * - selectionPaused 在鼠标选择期间暂停写入（可选使用）
 */
export function createSmartWriter(term: Terminal): SmartWriter {
  const state = {
    pendingChunks: [] as Array<{ data: string; callback?: () => void }>,
    watermark: 0,
    paused: false,
    selectionPaused: false,
  };

  function flushOne(data: string, callback?: () => void) {
    state.watermark += data.length;
    term.write(data, () => {
      state.watermark -= data.length;
      callback?.();
      if (state.paused && state.watermark < LOW_WATER) {
        state.paused = false;
        drainPending();
      }
    });
  }

  function drainPending() {
    while (state.pendingChunks.length > 0 && !state.paused && !state.selectionPaused) {
      const next = state.pendingChunks.shift()!;
      if (state.watermark >= HIGH_WATER) {
        state.pendingChunks.unshift(next);
        state.paused = true;
        break;
      }
      flushOne(next.data, next.callback);
    }
  }

  function write(data: string, callback?: () => void) {
    if (state.paused || state.selectionPaused || state.watermark >= HIGH_WATER) {
      if (state.watermark >= HIGH_WATER) state.paused = true;
      state.pendingChunks.push({ data, callback });
      return;
    }
    flushOne(data, callback);
  }

  function setSelectionPaused(paused: boolean) {
    state.selectionPaused = paused;
    if (!paused) drainPending();
  }

  return { write, drainPending, setSelectionPaused };
}

// ── xterm initialization ─────────────────────────────────────────────────────

export interface InitTerminalResult {
  term: Terminal;
  fitAddon: FitAddon;
}

/**
 * 创建 xterm Terminal 实例并加载通用 addon（FitAddon, Unicode11, WebGL）。
 * 调用方负责 term.open(container)。
 */
export function initTerminal(
  isDark: boolean,
  scrollback = 1000,
  fontSize = 12,
  fontFamily = "monospace",
): InitTerminalResult {
  const term = new Terminal({
    convertEol: false,
    scrollback,
    cursorBlink: true,
    fontFamily,
    fontSize,
    theme: isDark ? DARK_THEME : LIGHT_THEME,
    allowProposedApi: true,
  });

  const fitAddon = new FitAddon();
  const unicode11Addon = new Unicode11Addon();
  term.loadAddon(fitAddon);
  term.loadAddon(unicode11Addon);
  term.unicode.activeVersion = "11";

  return { term, fitAddon };
}

/**
 * 尝试加载 WebGL addon，失败时静默降级。
 * 必须在 term.open() 之后调用。
 */
export function loadWebglAddon(term: Terminal): void {
  try {
    const webglAddon = new WebglAddon();
    webglAddon.onContextLoss(() => {
      webglAddon.dispose();
    });
    term.loadAddon(webglAddon);
  } catch {
    /* 不支持 WebGL 时降级，不影响功能 */
  }
}

/**
 * 安全地执行 fitAddon.fit() 并返回 { cols, rows }，失败时返回 null。
 */
export function safeFit(
  fitAddon: FitAddon,
  term: Terminal,
): { cols: number; rows: number } | null {
  try {
    fitAddon.fit();
    return { cols: term.cols, rows: term.rows };
  } catch {
    return null;
  }
}

/**
 * 更新终端字体大小并重新 fit，返回新的 { cols, rows } 或 null。
 */
export function applyTerminalFontSize(
  term: Terminal,
  fitAddon: FitAddon,
  fontSize: number,
): { cols: number; rows: number } | null {
  if (term.options.fontSize === fontSize) return null;
  term.options.fontSize = fontSize;
  return safeFit(fitAddon, term);
}

export function applyTerminalFontFamily(
  term: Terminal,
  fitAddon: FitAddon,
  fontFamily: string,
): { cols: number; rows: number } | null {
  if (term.options.fontFamily === fontFamily) return null;
  term.options.fontFamily = fontFamily;
  return safeFit(fitAddon, term);
}
