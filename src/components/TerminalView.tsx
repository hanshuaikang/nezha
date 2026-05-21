import { useCallback, useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SerializeAddon } from "@xterm/addon-serialize";
import { attachSmartCopy } from "./terminalCopyHelper";
import type { TerminalFontSize, FontFamily } from "../types";
import {
  DARK_THEME,
  LIGHT_THEME,
  initTerminal,
  loadWebglAddon,
  safeFit,
  createSmartWriter,
  applyTerminalFontSize,
  applyTerminalFontFamily,
} from "./terminalShared";
import { attachLinuxIMEFix, attachMacWebKitShiftInputFix } from "./terminalInputFix";
import { IS_MAC_WEBKIT } from "../platform";
import "@xterm/xterm/css/xterm.css";

interface TerminalViewProps {
  onInput: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  onRegisterTerminal: (
    writeFn: ((data: string, callback?: () => void) => void) | null,
  ) => number;
  onReady?: (generation: number) => void;
  isDark: boolean;
  terminalFontSize: TerminalFontSize;
  monoFontFamily: FontFamily;
  isActive?: boolean;
  initialData?: string;
  initialSnapshot?: string;
  onSnapshot?: (snapshot: string) => void;
}

export function TerminalView({
  onInput,
  onResize,
  onRegisterTerminal,
  onReady,
  isDark,
  terminalFontSize,
  monoFontFamily,
  isActive = true,
  initialData,
  initialSnapshot,
  onSnapshot,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const onInputRef = useRef(onInput);
  const onResizeRef = useRef(onResize);
  const onRegisterRef = useRef(onRegisterTerminal);
  const onReadyRef = useRef(onReady);
  const onSnapshotRef = useRef(onSnapshot);
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  onReadyRef.current = onReady;
  onSnapshotRef.current = onSnapshot;

  // Keep refs current on every render
  onInputRef.current = onInput;
  onResizeRef.current = onResize;
  onRegisterRef.current = onRegisterTerminal;

  // 仅在 cols/rows 真正变化时回调；否则会触发 resize_pty → SIGWINCH →
  // 下游 TUI（Claude Code / Codex）全屏重绘，导致每次切回都看到一次多余重画。
  const notifyResize = useCallback((cols: number, rows: number) => {
    const last = lastSizeRef.current;
    if (last && last.cols === cols && last.rows === rows) return;
    lastSizeRef.current = { cols, rows };
    onResizeRef.current(cols, rows);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const { term, fitAddon } = initTerminal(isDark, 1000, terminalFontSize, monoFontFamily);
    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    const serializeAddon = new SerializeAddon();
    term.loadAddon(serializeAddon);
    term.open(container);
    // 关掉 macOS 在 helper textarea 上的拼写检查 / 自动纠正 / 文本预测——
    // 这些行为会主动触发 NSTextInputClient 的 characterIndexForPointAsync
    // 查询。textarea 默认在屏幕外（left: -9999em），但 macOS 输入法仍可能
    // 主动定位它。配合 src/styles/xterm.css 中 .xterm-rows 的 pointer-events: none
    // 一起切断 IME 查询风暴的两条入口。详见 knowledge/xterm/rendering-and-selection-lag.md §7。
    if (IS_MAC_WEBKIT) {
      container.classList.add("xterm-macos-ime-guard");
    }
    if (IS_MAC_WEBKIT && term.textarea) {
      term.textarea.setAttribute("autocomplete", "off");
      term.textarea.setAttribute("autocorrect", "off");
      term.textarea.setAttribute("autocapitalize", "off");
      term.textarea.setAttribute("spellcheck", "false");
    }
    const disposeInputFix = attachMacWebKitShiftInputFix(term);
    loadWebglAddon(term);

    // 拦截 xterm 每帧 _rowFactory.createRow → row div replaceChildren 写入的 span：
    // 含非 ASCII（emoji / box drawing）的 textContent 立刻替换为单字符 "x"。
    //
    // styles/xterm.css 中 .xterm-rows pointer-events: none 拦掉了 macOS
    // characterIndexForPointAsync 的 hit-test 入口，但 WebKit 的 canonicalPosition
    // 仍会在 RenderTree 里向前/向后游走候选 Position，进入 row span 内的 RenderText
    // ——这一步不看 pointer-events。实测把 IME 路径从 99.7% 压到 ~20%，剩下的就是
    // canonicalPosition × PositionIterator::decrement/increment × ICU TextBreakIterator
    // 在每个 RenderText 上做 emoji 簇判断 (__CFStringGetExtendedPictographicSequenceComponent)。
    //
    // 把非 ASCII 替换成单字符 ASCII 后：PositionIterator 仍游走 1500+ 次（这是 WebKit
    // 内部行为，改不了），但每次 ICU setText 走 ASCII fast path 几乎免费。预期把 IME
    // 路径再压到 <5%。row div 仍保留非零 boundingClientRect.width，xterm 的
    // _alignRowWidth scaleX 校准不会触发除零；视觉上 row 子树本来就被 canvas 覆盖，
    // 替换不影响显示。Cmd+C 复制走 attachSmartCopy → buffer.translateToString，不读 DOM。
    //
    // 详见 knowledge/xterm/rendering-and-selection-lag.md §7。
    const rowsEl = container.querySelector(".xterm-rows");
    const processedSpans = new WeakSet<Element>();
    const ASCII_ONLY = /^[\x20-\x7E]*$/;
    let rowSanitizer: MutationObserver | null = null;
    if (IS_MAC_WEBKIT && rowsEl) {
      rowSanitizer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type !== "childList") continue;
          for (const n of m.addedNodes) {
            if (n.nodeType !== Node.ELEMENT_NODE) continue;
            const el = n as Element;
            if (el.tagName !== "SPAN") continue;
            if (processedSpans.has(el)) continue;
            const text = el.textContent;
            if (!text || text.length <= 1 || ASCII_ONLY.test(text)) {
              processedSpans.add(el);
              continue;
            }
            el.textContent = "x";
            processedSpans.add(el);
          }
        }
      });
      rowSanitizer.observe(rowsEl, { childList: true, subtree: true });
    }

    const size = safeFit(fitAddon, term);
    if (size) notifyResize(size.cols, size.rows);

    const focusTerminal = () => {
      window.requestAnimationFrame(() => {
        term.focus();
      });
    };

    const writer = createSmartWriter(term);

    const terminalGeneration = onRegisterRef.current(writer.write);

    const completeRestore = () => {
      onReadyRef.current?.(terminalGeneration);
      focusTerminal();
    };

    window.requestAnimationFrame(() => {
      const s = safeFit(fitAddon, term);
      if (s) notifyResize(s.cols, s.rows);
      if (initialSnapshot) {
        term.write(initialSnapshot, () => {
          if (initialData) {
            term.write(initialData, completeRestore);
            return;
          }
          completeRestore();
        });
        return;
      }
      if (initialData) {
        term.write(initialData, completeRestore);
        return;
      }
      completeRestore();
    });

    const disposeSmartCopy = attachSmartCopy(term);
    const linuxIME = attachLinuxIMEFix(term, (data) => onInputRef.current(data));
    const disposeOnData = { dispose: () => linuxIME.dispose() };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button === 0) {
        focusTerminal();
        writer.setSelectionPaused(true);
      }
    };
    // pointerup 挂在 document 上，拖出终端区域外松手也能正确恢复
    const handlePointerUp = (e: PointerEvent) => {
      if (e.button === 0) {
        writer.setSelectionPaused(false);
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      window.requestAnimationFrame(() => {
        const s = safeFit(fitAddon, term);
        if (s) notifyResize(s.cols, s.rows);
        term.refresh(0, term.rows - 1);
        term.focus();
      });
    };

    container.addEventListener("pointerdown", handlePointerDown as EventListener);
    document.addEventListener("pointerup", handlePointerUp as EventListener);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const s = safeFit(fitAddon, term);
        if (s) notifyResize(s.cols, s.rows);
      }, 50);
    });
    resizeObserver.observe(container);

    return () => {
      try {
        const snapshot = serializeAddon.serialize();
        if (snapshot) onSnapshotRef.current?.(snapshot);
      } catch {
        /* ignore */
      }
      rowSanitizer?.disconnect();
      container.classList.remove("xterm-macos-ime-guard");
      onRegisterRef.current(null);
      fitAddonRef.current = null;
      disposeInputFix();
      disposeSmartCopy();
      disposeOnData.dispose();
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      container.removeEventListener("pointerdown", handlePointerDown as EventListener);
      document.removeEventListener("pointerup", handlePointerUp as EventListener);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      terminalRef.current = null;
      term.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isActive) return;
    window.requestAnimationFrame(() => {
      if (!fitAddonRef.current || !terminalRef.current) return;
      const s = safeFit(fitAddonRef.current, terminalRef.current);
      if (s) notifyResize(s.cols, s.rows);
      terminalRef.current.refresh(0, terminalRef.current.rows - 1);
      terminalRef.current.focus();
    });
  }, [isActive, notifyResize]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.cursorBlink = isActive;
    }
  }, [isActive]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = isDark ? DARK_THEME : LIGHT_THEME;
    }
  }, [isDark]);

  useEffect(() => {
    if (!terminalRef.current || !fitAddonRef.current) return;
    const size = applyTerminalFontSize(terminalRef.current, fitAddonRef.current, terminalFontSize);
    if (size) notifyResize(size.cols, size.rows);
  }, [terminalFontSize, notifyResize]);

  useEffect(() => {
    if (!terminalRef.current || !fitAddonRef.current) return;
    const size = applyTerminalFontFamily(terminalRef.current, fitAddonRef.current, monoFontFamily);
    if (size) notifyResize(size.cols, size.rows);
  }, [monoFontFamily, notifyResize]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        cursor: "text",
      }}
    />
  );
}
