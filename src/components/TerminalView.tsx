import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { SerializeAddon } from "@xterm/addon-serialize";
import { WebglAddon } from "@xterm/addon-webgl";
import { attachSmartCopy } from "./terminalCopyHelper";
import "@xterm/xterm/css/xterm.css";

const DARK_THEME = {
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

const LIGHT_THEME = {
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

/** 流控水位线 */
const HIGH_WATER = 128 * 1024; // 128 KB：超过时停止写入
const LOW_WATER  =  16 * 1024; //  16 KB：恢复写入

interface TerminalViewProps {
  onInput: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  onRegisterTerminal: (
    writeFn: ((data: string, callback?: () => void) => void) | null,
  ) => number;
  onReady?: (generation: number) => void;
  isDark: boolean;
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
  onReadyRef.current = onReady;
  onSnapshotRef.current = onSnapshot;

  // Keep refs current on every render
  onInputRef.current = onInput;
  onResizeRef.current = onResize;
  onRegisterRef.current = onRegisterTerminal;

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const term = new Terminal({
      convertEol: false,
      scrollback: 1000,
      cursorBlink: true,
      fontFamily: "monospace",
      fontSize: 12,
      theme: isDark ? DARK_THEME : LIGHT_THEME,
      allowProposedApi: true,
    });
    terminalRef.current = term;

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    const unicode11Addon = new Unicode11Addon();
    const serializeAddon = new SerializeAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(unicode11Addon);
    term.loadAddon(serializeAddon);
    term.unicode.activeVersion = "11";
    term.open(container);

    // WebGL renderer：GPU 渲染性能最优，选中高亮在 GPU 侧完成。
    // context loss 时自动 dispose，退回默认 canvas renderer。
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      term.loadAddon(webglAddon);
    } catch {
      /* 不支持 WebGL 时降级，不影响功能 */
    }

    try {
      fitAddon.fit();
      onResizeRef.current(term.cols, term.rows);
    } catch {
      // container may have zero dimensions during initial layout; resize observer will retry
    }

    const focusTerminal = () => {
      window.requestAnimationFrame(() => {
        term.focus();
      });
    };

    // 用对象持有状态，避免闭包捕获过期值
    const writeState = {
      pendingChunks: [] as Array<{ data: string; callback?: () => void }>,
      watermark: 0,  // 当前 xterm write queue 中的字节估算
      paused: false, // 是否因高水位被暂停
    };

    /** 真正写入 xterm，写完后更新水位并检查是否可以 flush 下一条 */
    function flushOne(data: string, callback?: () => void) {
      writeState.watermark += data.length;
      term.write(data, () => {
        writeState.watermark -= data.length;
        callback?.();
        // 低水位时尝试继续写入已缓冲的数据
        if (writeState.paused && writeState.watermark < LOW_WATER) {
          writeState.paused = false;
          drainPending();
        }
      });
    }

    function enqueueChunk(data: string, callback?: () => void) {
      if (writeState.paused || writeState.watermark >= HIGH_WATER) {
        if (writeState.watermark >= HIGH_WATER) writeState.paused = true;
        writeState.pendingChunks.push({ data, callback });
        return;
      }
      flushOne(data, callback);
    }

    /** 将 pending 队列里的数据依次写入（低水位恢复时调用） */
    function drainPending() {
      while (writeState.pendingChunks.length > 0 && !writeState.paused) {
        const next = writeState.pendingChunks.shift()!;
        if (writeState.watermark >= HIGH_WATER) {
          writeState.pendingChunks.unshift(next);
          writeState.paused = true;
          break;
        }
        flushOne(next.data, next.callback);
      }
    }

    /** 对外暴露的 write 函数，仅在高水位时缓冲 */
    function smartWrite(data: string, callback?: () => void) {
      enqueueChunk(data, callback);
    }

    const terminalGeneration = onRegisterRef.current(smartWrite);

    const completeRestore = () => {
      onReadyRef.current?.(terminalGeneration);
      focusTerminal();
    };

    window.requestAnimationFrame(() => {
      try {
        fitAddon.fit();
        onResizeRef.current(term.cols, term.rows);
      } catch {
        /* ignore */
      }
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
    const disposeOnData = term.onData((data) => onInputRef.current(data));

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button === 0) focusTerminal();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      window.requestAnimationFrame(() => {
        try {
          fitAddon.fit();
          onResizeRef.current(term.cols, term.rows);
        } catch {
          /* ignore */
        }
        term.refresh(0, term.rows - 1);
        term.focus();
      });
    };

    container.addEventListener("pointerdown", handlePointerDown as EventListener);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        try {
          fitAddon.fit();
          onResizeRef.current(term.cols, term.rows);
        } catch {
          // ignore resize errors when element is hidden
        }
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
      onRegisterRef.current(null);
      fitAddonRef.current = null;
      disposeSmartCopy();
      disposeOnData.dispose();
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      container.removeEventListener("pointerdown", handlePointerDown as EventListener);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      terminalRef.current = null;
      term.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isActive) return;
    window.requestAnimationFrame(() => {
      try {
        fitAddonRef.current?.fit();
        if (terminalRef.current) {
          onResizeRef.current(terminalRef.current.cols, terminalRef.current.rows);
          terminalRef.current.refresh(0, terminalRef.current.rows - 1);
          terminalRef.current.focus();
        }
      } catch {
        /* ignore */
      }
    });
  }, [isActive]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = isDark ? DARK_THEME : LIGHT_THEME;
    }
  }, [isDark]);

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
