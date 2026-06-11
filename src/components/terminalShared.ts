import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { IS_MAC_WEBKIT } from "../platform";
import type { ThemeVariant } from "../types";

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

// Solarized Light–inspired warm palette to match the eyecare CSS tokens.
export const EYECARE_THEME = {
  background: "#fdf6e3",
  foreground: "#586e75",
  cursor: "#586e75",
  selectionBackground: "#eee8d5",
  black: "#073642",
  red: "#dc322f",
  green: "#859900",
  yellow: "#b58900",
  blue: "#268bd2",
  magenta: "#d33682",
  cyan: "#2aa198",
  white: "#93a1a1",
  brightBlack: "#657b83",
  brightRed: "#cb4b16",
  brightGreen: "#586e75",
  brightYellow: "#657b83",
  brightBlue: "#839496",
  brightMagenta: "#6c71c4",
  brightCyan: "#93a1a1",
  brightWhite: "#fdf6e3",
};

export function themeFor(variant: ThemeVariant) {
  if (variant === "dark") return DARK_THEME;
  if (variant === "eyecare") return EYECARE_THEME;
  return LIGHT_THEME;
}

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

function setMacWebKitTextareaAttrs(term: Terminal): void {
  if (!term.textarea) return;
  term.textarea.setAttribute("autocomplete", "off");
  term.textarea.setAttribute("autocorrect", "off");
  term.textarea.setAttribute("autocapitalize", "off");
  term.textarea.setAttribute("spellcheck", "false");
  // hint WKWebView 不需要候选条 UI，跳过 EditorState::stringForCandidateRequest
  // 路径上的 wordRangeFromPosition → ICU 簇分析——这条路径每帧 willCommitMainFrameData
  // 都跑一次（即使 textarea 已 blur），是 spellcheck=false 三件套覆盖不到的独立入口。
  term.textarea.setAttribute("inputmode", "none");
}

// macOS WKWebView 在 xterm 选区拖动期间会被 NSTextInputClient 持续查询
// characterIndexForPoint，触发 LocalFrame::rangeForPoint → ICU 簇分析，
// 主线程被打满。
//
// 修复：拖动期间把 textarea 设 disabled——NSTextInputContext 没有可接收 focus
// 的 text input 就不查询，hit-test 风暴断在源头。松手 enable 后 refocus，
// 普通字符 / IME 输入照常。社区先例：xterm.js Discussion #5227。
//
// 历史：
// - 曾经基于 inert 把终端外的 sibling 子树标为不可命中（试图阻断 NSTextInput
//   hit-test 遍历）。2026-05-25 sample 实证 inert 只改变交互语义，不改变
//   RenderText 在 layout tree 的存在，hit-test 照样遍历，已删。
// - 曾用 textarea.blur()。2026-05-27 用户 A/B 实测拼音卡 / 英文不卡，印证 IME
//   路径是真因；blur 后 textarea 仍 focusable（可能被 RAF / 内部回调夺回焦点），
//   改为 disabled 是硬性禁用，更彻底。
// - 曾叠加 user-select:none 抑制 + window.getSelection().removeAllRanges() +
//   TERMINAL_SELECTION_ACTIVE_EVENT 广播给 RunningView/useUsageSnapshot 暂停
//   IPC 轮询。2026-05-27 disabled 升级实测拼音不卡，旁支防御全部移除。
export function attachMacWebKitTerminalGuard({
  term,
  container,
  writer,
}: TerminalSelectionGuardOptions): () => void {
  if (!IS_MAC_WEBKIT) return () => {};

  setMacWebKitTextareaAttrs(term);

  let pointerSelecting = false;
  let terminalHasSelection = term.hasSelection();

  // 拖选期间用 disabled 切断 IME host：
  // - blur: textarea 仍 focusable，后续 RAF / 内部回调可能把焦点夺回，IME 又能查
  // - disabled: 硬性禁用接收 focus / input，IME 100% 无法发起 NSTextInputClient 查询
  // 参考：xterm.js Discussion #5227（社区实战验证）。
  const disableTextarea = () => {
    if (term.textarea && !term.textarea.disabled) {
      term.textarea.disabled = true;
    }
  };

  const enableTextarea = () => {
    if (term.textarea && term.textarea.disabled) {
      term.textarea.disabled = false;
    }
  };

  const refocusTextarea = () => {
    if (term.textarea) {
      term.textarea.focus({ preventScroll: true });
    }
  };

  const syncSelectionGuard = () => {
    if (pointerSelecting) disableTextarea();
    else enableTextarea();
  };

  const handlePointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    pointerSelecting = true;
    writer?.setSelectionPaused(true);
    syncSelectionGuard();
  };

  const handlePointerUp = (e: PointerEvent) => {
    if (e.button !== 0) return;
    // document 级监听：必须先确认是终端发起的拖选流程，否则会把别处输入框的焦点抢走。
    if (!pointerSelecting) return;
    pointerSelecting = false;
    writer?.setSelectionPaused(false);
    terminalHasSelection = term.hasSelection();
    syncSelectionGuard();
    refocusTextarea();
  };

  const handlePointerCancel = () => {
    if (!pointerSelecting) return;
    pointerSelecting = false;
    writer?.setSelectionPaused(false);
    terminalHasSelection = term.hasSelection();
    syncSelectionGuard();
    refocusTextarea();
  };

  const handleDocumentPointerDown = (e: PointerEvent) => {
    const target = e.target;
    if (!terminalHasSelection || (target instanceof Node && container.contains(target))) return;
    pointerSelecting = false;
    terminalHasSelection = false;
    writer?.setSelectionPaused(false);
    term.clearSelection();
    syncSelectionGuard();
    // 用户点了终端外部，焦点本来就该去那里，不强抢回 textarea。
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !terminalHasSelection) return;
    pointerSelecting = false;
    terminalHasSelection = false;
    writer?.setSelectionPaused(false);
    term.clearSelection();
    syncSelectionGuard();
    refocusTextarea();
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

  return () => {
    selectionDisposable.dispose();
    container.removeEventListener("pointerdown", handlePointerDown);
    document.removeEventListener("pointerup", handlePointerUp);
    document.removeEventListener("pointercancel", handlePointerCancel);
    document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
    document.removeEventListener("keydown", handleKeyDown, true);
    // 兜底：若卸载时仍处于选区拖动状态，恢复 textarea，避免下次输入丢失。
    enableTextarea();
    writer?.setSelectionPaused(false);
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

interface TerminalMetricsCore {
  _charSizeService?: {
    width: number;
    height: number;
  };
  _renderService?: {
    handleCharSizeChanged: () => void;
  };
}

const DOM_MEASURE_REPEAT = 32;

function measureTerminalFontWithDom(
  term: Terminal,
  container: HTMLElement,
): { width: number; height: number } | null {
  // xterm 在支持 OffscreenCanvas 时会用 canvas measureText 测量字符宽度；
  // WKWebView + Nerd Font 下这个结果可能和真实 DOM 排版不一致，导致 WebGL cell 宽度偏移。
  const measure = container.ownerDocument.createElement("span");
  measure.classList.add("xterm-char-measure-element");
  measure.textContent = "W".repeat(DOM_MEASURE_REPEAT);
  measure.setAttribute("aria-hidden", "true");
  measure.style.whiteSpace = "pre";
  measure.style.fontKerning = "none";
  measure.style.fontFamily = term.options.fontFamily ?? "monospace";
  measure.style.fontSize = `${term.options.fontSize ?? 12}px`;
  measure.style.fontWeight = String(term.options.fontWeight ?? "normal");
  container.appendChild(measure);

  const width = measure.offsetWidth / DOM_MEASURE_REPEAT;
  const height = measure.offsetHeight;
  measure.remove();

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

function syncTerminalFontMetrics(term: Terminal, container: HTMLElement): void {
  // WebGL renderer 的 cell dimensions 来自 _charSizeService；这里用 DOM 实测值校正它，
  // 让 FitAddon 和 WebGL glyph atlas 使用同一套字符宽度。
  const core = (term as unknown as { _core?: TerminalMetricsCore })._core;
  const charSizeService = core?._charSizeService;
  const renderService = core?._renderService;
  if (!charSizeService || !renderService) return;

  const measured = measureTerminalFontWithDom(term, container);
  if (!measured) return;

  const changed =
    Math.abs(charSizeService.width - measured.width) > 0.01 ||
    Math.abs(charSizeService.height - measured.height) > 0.01;
  if (!changed) return;

  charSizeService.width = measured.width;
  charSizeService.height = measured.height;
  renderService.handleCharSizeChanged();
  term.refresh(0, term.rows - 1);
}

/**
 * 创建 xterm Terminal 实例并加载通用 addon（FitAddon, Unicode11, WebGL）。
 * 调用方负责 term.open(container)。
 */
export function initTerminal(
  variant: ThemeVariant,
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
    theme: themeFor(variant),
    allowProposedApi: true,
    // 当运行中的 TUI（Claude Code / Codex）开启鼠标上报时，xterm 默认把拖动当作
    // 鼠标事件转发给程序并取消本地选区，导致 macOS 用户"运行时无法框选"。开启此项后
    // 按住 ⌥ Option 拖动可强制本地选区（iTerm2 / Terminal.app 的标准约定）。
    macOptionClickForcesSelection: true,
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
 * 安全地执行 fitAddon.fit() 并返回 { cols, rows }，失败/容器不可见时返回 null。
 *
 * container 传了的话会做两道防御（xterm.js issue #3029 / #4338 / #4841 的已知坑）：
 * 1. rect 宽高任一为 0 → 容器在 display:none 子树里，跳过。多项目挂载时这是
 *    日常状态（非激活 ProjectPage display:none）。
 * 2. proposeDimensions 返回非有限值或 cols/rows < 2 → 退化场景，跳过。
 *
 * 为什么必须拦：FitAddon 在 0 尺寸容器上不返回 NaN，而是退化到 `Math.max(
 * MINIMUM_COLS, Math.floor(0 / cell))` = MINIMUM_COLS (2)；若放过 → 调用方
 * notifyResize → resize_pty → SIGWINCH → Claude Code / Codex 这类 TUI 按
 * cols=2 重排，buffer 永久打散成一字一行。VS Code 的同等防线在 _resize()
 * 里是 `if (isNaN(cols) || isNaN(rows)) return`，但 xterm.js 这条 NaN 路径
 * 不存在，必须在 rect 层先拦。
 */
export function safeFit(
  fitAddon: FitAddon,
  term: Terminal,
  container?: HTMLElement,
): { cols: number; rows: number } | null {
  if (container) {
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    // proposeDimensions 依赖 renderer dimensions，先同步一次才能用正确 cell 宽度计算列数。
    syncTerminalFontMetrics(term, container);
  }
  try {
    const dims = fitAddon.proposeDimensions();
    if (!dims || !Number.isFinite(dims.cols) || !Number.isFinite(dims.rows)) return null;
    if (dims.cols < 2 || dims.rows < 2) return null;
    fitAddon.fit();
    // fit/resize 后 WebGL renderer 可能重算 dimensions，再补一次避免窗口缩放后宽度回退。
    if (container) syncTerminalFontMetrics(term, container);
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
  container?: HTMLElement,
): { cols: number; rows: number } | null {
  if (term.options.fontSize === fontSize) return null;
  term.options.fontSize = fontSize;
  return safeFit(fitAddon, term, container);
}

export function applyTerminalFontFamily(
  term: Terminal,
  fitAddon: FitAddon,
  fontFamily: string,
  container?: HTMLElement,
): { cols: number; rows: number } | null {
  if (term.options.fontFamily === fontFamily) return null;
  term.options.fontFamily = fontFamily;
  return safeFit(fitAddon, term, container);
}
