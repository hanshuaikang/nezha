import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { IS_MAC_WEBKIT } from "../platform";
import { publishTerminalSelectionActive } from "../terminalSelection";
import { smartCopy } from "./terminalCopyHelper";

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

interface TerminalSelectionGuardOptions {
  term: Terminal;
  container: HTMLElement;
  writer?: Pick<SmartWriter, "setSelectionPaused">;
}

let macWebKitSelectionGuardCount = 0;

function setMacWebKitTextareaAttrs(term: Terminal): void {
  if (!term.textarea) return;
  term.textarea.setAttribute("autocomplete", "off");
  term.textarea.setAttribute("autocorrect", "off");
  term.textarea.setAttribute("autocapitalize", "off");
  term.textarea.setAttribute("spellcheck", "false");
}

// 真因：macOS 系统设置「显示文内预测文本」会让 NSTextInputContext 对当前 focused
// text input 持续查询 characterIndexForPoint，触发 WebKit LocalFrame::rangeForPoint
// → PositionIterator::decrement → ICU emoji 簇判断，遍历整个 document 的 RenderText。
// 用户可在 系统设置 → 输入法 → 所有输入法 关闭该开关彻底消除。
//
// 这里的兜底策略：拖选 / 有选区期间把 textarea blur 掉——NSTextInputContext
// 没有 focused text input 就不查询了，hit-test 风暴断在源头。textarea blur 期间
// xterm 的 attachCustomKeyEventHandler 收不到 Cmd+C，在 document 捕获阶段加兜底。
//
// 历史：曾经的 inert 防御（inertTerminalBranchSiblings）在 2026-05-25 sample 实证
// 无效——inert 只阻止用户交互，不改变 RenderText 在 layout tree 的存在，
// NSTextInput hit-test 照样遍历。已删除。
export function attachMacWebKitTerminalGuard({
  term,
  container,
  writer,
}: TerminalSelectionGuardOptions): () => void {
  if (!IS_MAC_WEBKIT) return () => {};

  setMacWebKitTextareaAttrs(term);

  let pointerSelecting = false;
  let terminalHasSelection = term.hasSelection();
  let guardSelectionActive = false;

  const setGuardSelectionActive = (active: boolean) => {
    if (guardSelectionActive === active) return;
    guardSelectionActive = active;
    macWebKitSelectionGuardCount += active ? 1 : -1;
    publishTerminalSelectionActive(macWebKitSelectionGuardCount > 0);
  };

  const blurTextareaIfFocused = () => {
    if (term.textarea && document.activeElement === term.textarea) {
      term.textarea.blur();
    }
  };
  const refocusTextarea = () => {
    if (term.textarea) {
      term.textarea.focus({ preventScroll: true });
    }
  };

  const syncSelectionGuard = () => {
    const active = pointerSelecting || terminalHasSelection;
    setGuardSelectionActive(active);
    if (active) {
      blurTextareaIfFocused();
    }
  };

  const handlePointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    term.focus();
    pointerSelecting = true;
    writer?.setSelectionPaused(true);
    syncSelectionGuard();
  };

  const handlePointerUp = (e: PointerEvent) => {
    if (e.button !== 0) return;
    pointerSelecting = false;
    writer?.setSelectionPaused(false);
    terminalHasSelection = term.hasSelection();
    syncSelectionGuard();
  };

  const handlePointerCancel = () => {
    pointerSelecting = false;
    writer?.setSelectionPaused(false);
    terminalHasSelection = term.hasSelection();
    syncSelectionGuard();
  };

  const handleDocumentPointerDown = (e: PointerEvent) => {
    const target = e.target;
    if (!terminalHasSelection || (target instanceof Node && container.contains(target))) return;
    pointerSelecting = false;
    terminalHasSelection = false;
    writer?.setSelectionPaused(false);
    term.clearSelection();
    syncSelectionGuard();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !terminalHasSelection) return;
    pointerSelecting = false;
    terminalHasSelection = false;
    writer?.setSelectionPaused(false);
    term.clearSelection();
    syncSelectionGuard();
    // ESC 清掉选区后用户预期继续输入，把 textarea 焦点还回来。
    // 注意 handleDocumentPointerDown 路径不要 refocus —— 那种情况用户点了别处，
    // 焦点本来就该去那里，强抢回来反而是 UX bug。
    refocusTextarea();
  };

  // textarea 被 blur 期间，xterm 的 attachCustomKeyEventHandler 收不到 Cmd+C。
  // 这里在 document 捕获阶段兜底：有选区且 textarea 不聚焦时直接调 smartCopy。
  // textarea 聚焦的场景仍走 attachSmartCopy 原路径，互不冲突。
  const handleDocumentCopy = (e: KeyboardEvent) => {
    if (e.type !== "keydown") return;
    if (e.key !== "c" || !(e.metaKey || e.ctrlKey)) return;
    if (!term.hasSelection()) return;
    if (document.activeElement === term.textarea) return;
    e.preventDefault();
    smartCopy(term).catch(() => {});
  };

  const selectionDisposable = term.onSelectionChange(() => {
    terminalHasSelection = term.hasSelection();
    syncSelectionGuard();
  });

  container.addEventListener("pointerdown", handlePointerDown);
  document.addEventListener("pointerup", handlePointerUp);
  document.addEventListener("pointercancel", handlePointerCancel);
  document.addEventListener("pointerdown", handleDocumentPointerDown, true);
  document.addEventListener("keydown", handleKeyDown, true);
  document.addEventListener("keydown", handleDocumentCopy, true);

  return () => {
    selectionDisposable.dispose();
    container.removeEventListener("pointerdown", handlePointerDown);
    document.removeEventListener("pointerup", handlePointerUp);
    document.removeEventListener("pointercancel", handlePointerCancel);
    document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
    document.removeEventListener("keydown", handleKeyDown, true);
    document.removeEventListener("keydown", handleDocumentCopy, true);
    writer?.setSelectionPaused(false);
    setGuardSelectionActive(false);
  };
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
 *
 * 关于"要不要关掉 WebGL"的实测结论（recording8/9/10 对照）：
 * - WebGL 的代价：拖大段选区时偶发 100–400 ms composite 爆点（GPU 几何上传）
 * - DOM renderer 的代价：高频 mousemove（鼠标在终端区域移动）+ 高速文本输出时
 *   持续中等卡顿（每次 mousemove 触发多个 row DOM 节点的 reflow/composite，
 *   rec10 实测 1233 mousemove/2.7s 下出现 511ms 单帧）
 * - Nezha 日常以"鼠标在终端区域活动"为主，长拖选区相对罕见，因此 WebGL 的
 *   "偶发爆点"比 DOM 的"持续小卡顿"更可接受。
 *
 * 不要为了"避免偶发卡顿"再把这里关掉——见 timeline rec10。
 */
export function loadWebglAddon(term: Terminal): void {
  try {
    const webglAddon = new WebglAddon();
    webglAddon.onContextLoss(() => {
      console.warn("[terminal] WebGL context lost; falling back to xterm DOM renderer");
      webglAddon.dispose();
    });
    term.loadAddon(webglAddon);
  } catch (err) {
    console.warn("[terminal] WebGL addon unavailable; using xterm DOM renderer", err);
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
