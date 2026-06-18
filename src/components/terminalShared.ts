import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { IS_MAC_WEBKIT } from "../platform";
import type { ThemeVariant } from "../types";
// xterm 私有字段访问的显式契约——见 xterm-private.d.ts 头部说明。
import type { XTermWithPrivates } from "./xterm-private";

// xterm 6 的自绘滚动条宽度由 overviewRuler.width 复用控制；FitAddon 会用它
// 计算可用列数，因此必须和 App.css 中的滚动条槽宽保持一致。
const XTERM_SCROLLBAR_WIDTH = 12;

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

// Midnight dark: same syntax palette as DARK_THEME, but a neutral near-black
// background (#1A1B1D) to match the `html.midnight` --bg-panel surface.
export const MIDNIGHT_THEME = {
  ...DARK_THEME,
  background: "#1a1b1d",
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
  if (variant === "midnight") return MIDNIGHT_THEME;
  if (variant === "eyecare") return EYECARE_THEME;
  return LIGHT_THEME;
}

export function minimumContrastRatioFor(variant: ThemeVariant): number {
  // Dark-family variants (dark / midnight) ship a hand-tuned palette already
  // readable on their backgrounds, so we skip xterm's auto contrast lift to
  // preserve the original ANSI hues. Light-family variants (light / eyecare)
  // pair light surfaces with high-saturation ANSI defaults that fall below
  // WCAG AA — there we let xterm bump foregrounds until they hit 4.5:1.
  return variant === "dark" || variant === "midnight" ? 1 : 4.5;
}

export function applyTerminalTheme(term: Terminal, variant: ThemeVariant): void {
  term.options.theme = themeFor(variant);
  term.options.minimumContrastRatio = minimumContrastRatioFor(variant);
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
  /** 字体 ready 后 resolve（1s 超时兜底），永不 reject。ready 时已 toggle
   *  fontFamily 触发 xterm 重测 cell；调用方应在此之后再 safeFit 一次。 */
  whenFontsReady: Promise<void>;
}

const fontReadyCache = new Set<string>();
const FONT_READY_TIMEOUT_MS = 1000;
const TEXTURE_ATLAS_REFRESH_DELAYS_MS = [0, 50, 250, 1000, 2500, 5000] as const;

function primaryFontFamily(fontFamily: string): string | null {
  const first = fontFamily.split(",")[0]?.trim().replace(/^["']|["']$/g, "");
  if (!first) return null;
  if (first === "monospace" || first === "serif" || first === "sans-serif" || first === "system-ui") {
    return null;
  }
  return first;
}

function waitForFontReady(fontFamily: string, fontSize: number): Promise<void> {
  const key = `${fontFamily}|${fontSize}`;
  if (fontReadyCache.has(key)) return Promise.resolve();

  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (!fonts) {
    fontReadyCache.add(key);
    return Promise.resolve();
  }

  const primary = primaryFontFamily(fontFamily);
  const spec = primary ? `${fontSize}px "${primary}"` : null;

  // nezha 用的都是系统字体，fonts.load 不会触发网络下载——仅 spec 字符串
  // 解析失败时 reject（开发者拼接 bug），warn 出来便于排查。
  const load = spec
    ? fonts.load(spec).catch((err) => {
        console.warn(`[terminal] invalid font spec "${spec}"`, err);
      })
    : Promise.resolve();

  const ready = load.then(() => fonts.ready).then(() => {});

  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      fontReadyCache.add(key);
      resolve();
    };
    ready.then(finish).catch(finish);
    setTimeout(finish, FONT_READY_TIMEOUT_MS);
  });
}

function whenFontEventuallyReady(fontFamily: string, fontSize: number): Promise<void> {
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (!fonts) return Promise.resolve();

  const primary = primaryFontFamily(fontFamily);
  const spec = primary ? `${fontSize}px "${primary}"` : null;
  const load = spec
    ? fonts.load(spec).catch((err) => {
        console.warn(`[terminal] invalid font spec "${spec}"`, err);
      })
    : Promise.resolve();
  return load.then(() => fonts.ready).then(() => {});
}

const DOM_MEASURE_REPEAT = 32;
const domCellWidthCache = new Map<string, number>();

function isFontLoaded(fontFamily: string, fontSize: number): boolean {
  const primary = primaryFontFamily(fontFamily);
  if (!primary) return true; // 通用关键字（monospace 等）总是 ready。
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (!fonts) return true;
  try {
    return fonts.check(`${fontSize}px "${primary}"`);
  } catch {
    return true;
  }
}

function measureCellWidthInDOM(fontFamily: string, fontSize: number): number | null {
  if (typeof document === "undefined" || !document.body) return null;
  const key = `${fontFamily}|${fontSize}`;
  const cached = domCellWidthCache.get(key);
  if (cached !== undefined) return cached;

  const probe = document.createElement("span");
  probe.classList.add("xterm-char-measure-element");
  probe.setAttribute("aria-hidden", "true");
  probe.style.whiteSpace = "pre";
  probe.style.fontKerning = "none";
  probe.style.fontFamily = fontFamily;
  probe.style.fontSize = `${fontSize}px`;
  // 与 xterm DomMeasureStrategy 保持一致：32 个 W 平均掉布局取整误差。
  probe.textContent = "W".repeat(DOM_MEASURE_REPEAT);
  document.body.appendChild(probe);
  try {
    const width = probe.offsetWidth / DOM_MEASURE_REPEAT;
    if (!Number.isFinite(width) || width <= 0) return null;
    // 字体未 ready 时测的是 fallback 宽度，不能缓存；ready 后会再测一次。
    if (isFontLoaded(fontFamily, fontSize)) {
      domCellWidthCache.set(key, width);
    }
    return width;
  } finally {
    probe.remove();
  }
}

/**
 * 只修正 xterm 测量结果里的 width，不直接写 `_charSizeService` 当前值。
 *
 * WKWebView/OffscreenCanvas 对 CJK Nerd Font 的 measureText 可能把半宽字符测成
 * fullwidth。这里用 DOM 宽度覆盖策略返回值，让 xterm 自己的 measure() 继续负责
 * 写入 width/height、触发 onCharSizeChange 和 renderer 更新。height 保持 xterm
 * 原始结果，避免 DOM 高度语义和 xterm lineHeight 叠加后把整屏 cell 拉坏。
 */
export function applyDomCharSizeOverride(term: Terminal): () => void {
  const core = (term as XTermWithPrivates)._core;
  const charSizeService = core?._charSizeService;
  const strategy = charSizeService?._measureStrategy;
  if (!charSizeService || !strategy || typeof strategy.measure !== "function") {
    console.warn("[terminal] xterm char size strategy inaccessible; skip DOM width override");
    return () => {};
  }

  const original = strategy.measure.bind(strategy);
  let active = true;
  let warnedMismatch = false;

  strategy.measure = () => {
    const result = original();
    if (!active || result.width <= 0 || result.height <= 0) return result;

    const fontFamily = term.options.fontFamily;
    const fontSize = term.options.fontSize;
    if (typeof fontFamily !== "string" || typeof fontSize !== "number") return result;

    const domWidth = measureCellWidthInDOM(fontFamily, fontSize);
    if (domWidth === null || Math.abs(result.width - domWidth) < 0.5) return result;

    if (!warnedMismatch) {
      warnedMismatch = true;
      console.warn(
        `[terminal] xterm measured cell width=${result.width.toFixed(2)}, DOM width=${domWidth.toFixed(2)}; using DOM width`,
      );
    }
    return { width: domWidth, height: result.height };
  };

  try {
    charSizeService.measure();
  } catch {
    /* term 未完全就绪时忽略；字体/字号变化会再次触发 measure */
  }

  return () => {
    active = false;
    strategy.measure = original;
  };
}

// xterm OptionsService 对同值 fontFamily 会 dirty-check 跳过，用 toggle 绕开。
function refreshCharSizeAfterFontReady(term: Terminal, fontFamily: string): void {
  try {
    if (term.options.fontFamily !== fontFamily) return;
    term.options.fontFamily = `${fontFamily}, monospace`;
    term.options.fontFamily = fontFamily;
  } catch {
    /* term 已 dispose 的正常 race */
  }
}

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
    minimumContrastRatio: minimumContrastRatioFor(variant),
    allowProposedApi: true,
    overviewRuler: { width: XTERM_SCROLLBAR_WIDTH },
    // 当运行中的 TUI（Claude Code / Codex）开启鼠标上报时，xterm 默认把拖动当作
    // 鼠标事件转发给程序并取消本地选区,导致 macOS 用户"运行时无法框选"。开启此项后
    // 按住 ⌥ Option 拖动可强制本地选区（iTerm2 / Terminal.app 的标准约定）。
    macOptionClickForcesSelection: true,
  });

  const fitAddon = new FitAddon();
  const unicode11Addon = new Unicode11Addon();
  term.loadAddon(fitAddon);
  term.loadAddon(unicode11Addon);
  term.unicode.activeVersion = "11";

  const whenFontsReady = waitForFontReady(fontFamily, fontSize).then(() => {
    refreshCharSizeAfterFontReady(term, fontFamily);
  });

  return { term, fitAddon, whenFontsReady };
}

export function attachTerminalScrollbarAutoHide(term: Terminal, container: HTMLElement): () => void {
  const ownerWindow = container.ownerDocument.defaultView ?? window;
  let scrollHideTimer: number | null = null;

  const clearScrollHideTimer = () => {
    if (scrollHideTimer === null) return;
    ownerWindow.clearTimeout(scrollHideTimer);
    scrollHideTimer = null;
  };

  const hideAfterScroll = () => {
    clearScrollHideTimer();
    scrollHideTimer = ownerWindow.setTimeout(() => {
      container.classList.remove("nezha-xterm-scrolling");
      scrollHideTimer = null;
    }, 700);
  };

  const handleScroll = () => {
    container.classList.add("nezha-xterm-scrolling");
    hideAfterScroll();
  };

  const scrollDisposable = term.onScroll(handleScroll);

  return () => {
    clearScrollHideTimer();
    container.classList.remove("nezha-xterm-scrolling");
    scrollDisposable.dispose();
  };
}

export interface WebglAddonHandle {
  /** 释放 WebGL addon。延迟加载未完成时也安全调用，会标记 disposed 阻止后续 load。 */
  dispose: () => void;
}

interface TextureAtlasRefreshState {
  generation: number;
  frameIds: number[];
  timerIds: number[];
}

const textureAtlasRefreshState = new WeakMap<Terminal, TextureAtlasRefreshState>();

function getTerminalOwnerWindow(term: Terminal): Window {
  return term.element?.ownerDocument.defaultView ?? window;
}

function getTextureAtlasRefreshState(term: Terminal): TextureAtlasRefreshState {
  let state = textureAtlasRefreshState.get(term);
  if (!state) {
    state = { generation: 0, frameIds: [], timerIds: [] };
    textureAtlasRefreshState.set(term, state);
  }
  return state;
}

function cancelScheduledTextureAtlasRefresh(term: Terminal): TextureAtlasRefreshState {
  const ownerWindow = getTerminalOwnerWindow(term);
  const state = getTextureAtlasRefreshState(term);
  for (const frameId of state.frameIds) {
    ownerWindow.cancelAnimationFrame(frameId);
  }
  for (const timerId of state.timerIds) {
    ownerWindow.clearTimeout(timerId);
  }
  state.frameIds = [];
  state.timerIds = [];
  return state;
}

/**
 * 字体或字号变更后丢掉 WebGL atlas 让新尺寸的 glyph 重新光栅化。无 WebGL
 * 时 (`clearTextureAtlas` 不存在或抛出) 静默忽略。
 */
function refreshTextureAtlas(term: Terminal): void {
  try {
    term.clearTextureAtlas();
    if (term.rows > 0) {
      term.refresh(0, term.rows - 1);
    }
  } catch {
    /* DOM renderer 没有 atlas / term 已 dispose */
  }
}

function scheduleTextureAtlasRefresh(term: Terminal): void {
  const ownerWindow = getTerminalOwnerWindow(term);
  const state = cancelScheduledTextureAtlasRefresh(term);
  const generation = state.generation + 1;
  state.generation = generation;

  const firstFrame = ownerWindow.requestAnimationFrame(() => {
    if (state.generation !== generation || !term.element) return;
    const secondFrame = ownerWindow.requestAnimationFrame(() => {
      if (state.generation !== generation || !term.element) return;
      for (const delay of TEXTURE_ATLAS_REFRESH_DELAYS_MS) {
        const timerId = ownerWindow.setTimeout(() => {
          if (state.generation !== generation || !term.element) return;
          refreshTextureAtlas(term);
        }, delay);
        state.timerIds.push(timerId);
      }
    });
    state.frameIds.push(secondFrame);
  });
  state.frameIds.push(firstFrame);
}

/**
 * `display:none → 重新可见` 路径用：xterm WebGL canvas 在 layout tree 移除
 * 期间 atlas/render 缓存可能进入坏状态（切回项目时肉眼可见乱码，改尺寸后
 * 恢复正常），等一帧 layout 稳定后清一次缓存即可。
 *
 * 不复用 scheduleTextureAtlasRefresh —— 那个 6 个延迟节点是字体异步加载
 * 兜底，切回时字体早就 ready，跑 6 次只会让用户看到 6 次闪烁。
 */
export function refreshTerminalDisplay(term: Terminal): void {
  const ownerWindow = getTerminalOwnerWindow(term);
  const state = cancelScheduledTextureAtlasRefresh(term);
  const generation = state.generation + 1;
  state.generation = generation;
  const frameId = ownerWindow.requestAnimationFrame(() => {
    if (state.generation !== generation || !term.element) return;
    refreshTextureAtlas(term);
  });
  state.frameIds.push(frameId);
}

/**
 * 异步加载 WebGL addon：等待字体 ready 后再 new，避免 atlas 用 fallback 字体
 * 首次 prefill。失败时静默降级到 xterm DOM renderer。
 *
 * 为什么必须等字体 ready：WebGL renderer 用 glyph atlas 缓存光栅化结果，
 * 第一次 fill 用什么字体后续就是什么字体——若 atlas 用未加载完的 fallback
 * 字体填，即便后面 cell 尺寸算对了，渲染出来的字符仍是 fallback 形状。
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
 *
 * 必须在 `term.open()` 之后调用——term.element 在 open 时才挂上。
 */
export function loadWebglAddon(term: Terminal): WebglAddonHandle {
  let disposed = false;
  let addon: WebglAddon | null = null;

  const fontFamily = typeof term.options.fontFamily === "string" ? term.options.fontFamily : "monospace";
  const fontSize = typeof term.options.fontSize === "number" ? term.options.fontSize : 12;

  void waitForFontReady(fontFamily, fontSize).finally(() => {
    if (disposed || !term.element) return;
    refreshCharSizeAfterFontReady(term, fontFamily);
    try {
      addon = new WebglAddon();
      addon.onContextLoss(() => {
        console.warn("[terminal] WebGL context lost; falling back to xterm DOM renderer");
        addon?.dispose();
        addon = null;
      });
      term.loadAddon(addon);
      scheduleTextureAtlasRefresh(term);
      void whenFontEventuallyReady(fontFamily, fontSize).then(() => {
        if (!disposed && term.element) {
          refreshCharSizeAfterFontReady(term, fontFamily);
          scheduleTextureAtlasRefresh(term);
        }
      });
    } catch (err) {
      console.warn("[terminal] WebGL addon unavailable; using xterm DOM renderer", err);
      /* 不支持 WebGL 时降级，不影响功能 */
    }
  });

  return {
    dispose: () => {
      disposed = true;
      cancelScheduledTextureAtlasRefresh(term);
      addon?.dispose();
      addon = null;
    },
  };
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
  }
  try {
    const dims = fitAddon.proposeDimensions();
    if (!dims || !Number.isFinite(dims.cols) || !Number.isFinite(dims.rows)) return null;
    if (dims.cols < 2 || dims.rows < 2) return null;
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
  container?: HTMLElement,
): { cols: number; rows: number } | null {
  if (term.options.fontSize === fontSize) return null;
  term.options.fontSize = fontSize;
  const result = safeFit(fitAddon, term, container);
  scheduleTextureAtlasRefresh(term);
  return result;
}

export interface FontFamilyApplyResult {
  /** 同步 fit 的结果。新字体未加载时是 fallback 字体的尺寸，先反馈给用户。 */
  immediate: { cols: number; rows: number } | null;
  /** 字体 ready 后重测并 fit 的结果。CJK 等宽字体首次加载需要这一步纠正 cols/rows。 */
  whenSettled: Promise<{ cols: number; rows: number } | null>;
}

export function applyTerminalFontFamily(
  term: Terminal,
  fitAddon: FitAddon,
  fontFamily: string,
  container?: HTMLElement,
): FontFamilyApplyResult | null {
  if (term.options.fontFamily === fontFamily) return null;
  term.options.fontFamily = fontFamily;
  const fontSize = typeof term.options.fontSize === "number" ? term.options.fontSize : 12;
  const immediate = safeFit(fitAddon, term, container);
  const whenSettled = waitForFontReady(fontFamily, fontSize).then(() => {
    refreshCharSizeAfterFontReady(term, fontFamily);
    scheduleTextureAtlasRefresh(term);
    return safeFit(fitAddon, term, container);
  });
  return { immediate, whenSettled };
}
