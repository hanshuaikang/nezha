import type React from "react";
import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { attachSmartCopy } from "./terminalCopyHelper";
import { X } from "lucide-react";
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

/** 流控水位线（与 TerminalView 保持一致） */
const HIGH_WATER = 128 * 1024;
const LOW_WATER  =  16 * 1024;

interface ShellOutputEvent {
  shell_id: string;
  data: string;
}

export interface ShellTerminalPanelHandle {
  sendCommand: (cmd: string) => void;
}

interface Props {
  projectPath: string;
  projectId: string;
  isActive?: boolean;
  onClose: () => void;
  isDark: boolean;
  onReady?: () => void;
  height?: number;
  onResizeStart?: (e: React.MouseEvent) => void;
}

export const ShellTerminalPanel = forwardRef<ShellTerminalPanelHandle, Props>(
  function ShellTerminalPanel(
    {
      projectPath,
      projectId,
      isActive = true,
      onClose,
      isDark,
      onReady,
      height = 240,
      onResizeStart,
    },
    ref,
  ) {
    const shellId = `shell:${projectId}`;
    const containerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const isDarkRef = useRef(isDark);
    const onReadyRef = useRef(onReady);
    isDarkRef.current = isDark;
    onReadyRef.current = onReady;

    useImperativeHandle(ref, () => ({
      sendCommand: (cmd: string) => {
        invoke("send_input", { taskId: shellId, data: cmd }).catch(console.error);
      },
    }));

    useEffect(() => {
      if (!containerRef.current) return;

      const term = new Terminal({
        convertEol: false,
        scrollback: 5000,
        cursorBlink: true,
        fontFamily: "monospace",
        fontSize: 12,
        theme: isDarkRef.current ? DARK_THEME : LIGHT_THEME,
        allowProposedApi: true,
      });
      terminalRef.current = term;

      const fitAddon = new FitAddon();
      fitAddonRef.current = fitAddon;
      const unicode11Addon = new Unicode11Addon();
      term.loadAddon(fitAddon);
      term.loadAddon(unicode11Addon);
      term.unicode.activeVersion = "11";
      term.open(containerRef.current);

      try {
        const webglAddon = new WebglAddon();
        webglAddon.onContextLoss(() => {
          webglAddon.dispose();
        });
        term.loadAddon(webglAddon);
      } catch {
        /* 不支持 WebGL 时降级 */
      }

      const fit = () => {
        try {
          fitAddon.fit();
          invoke("resize_pty", { taskId: shellId, cols: term.cols, rows: term.rows }).catch(
            () => {},
          );
        } catch {
          // ignore
        }
      };

      setTimeout(() => {
        fit();
        invoke<void>("open_shell", {
          shellId,
          projectPath,
          cols: term.cols,
          rows: term.rows,
        })
          .then(() => {
            setTimeout(() => onReadyRef.current?.(), 300);
          })
          .catch(console.error);
        term.focus();
      }, 50);

      // --- 仅保留高水位流控，不因选区拖拽暂停写入 ---
      const writeState = {
        pendingChunks: [] as string[],
        watermark: 0,
        paused: false,
      };

      function flushOne(data: string) {
        writeState.watermark += data.length;
        term.write(data, () => {
          writeState.watermark -= data.length;
          if (writeState.paused && writeState.watermark < LOW_WATER) {
            writeState.paused = false;
            drainPending();
          }
        });
      }

      function drainPending() {
        while (writeState.pendingChunks.length > 0 && !writeState.paused) {
          const next = writeState.pendingChunks.shift()!;
          if (writeState.watermark >= HIGH_WATER) {
            writeState.pendingChunks.unshift(next);
            writeState.paused = true;
            break;
          }
          flushOne(next);
        }
      }

      function smartWrite(data: string) {
        if (writeState.paused || writeState.watermark >= HIGH_WATER) {
          if (writeState.watermark >= HIGH_WATER) writeState.paused = true;
          writeState.pendingChunks.push(data);
          return;
        }
        flushOne(data);
      }

      const container = containerRef.current!;
      const disposeSmartCopy = attachSmartCopy(term);
      const disposeOnData = term.onData((data) => {
        invoke("send_input", { taskId: shellId, data }).catch(() => {});
      });

      const resizeObserver = new ResizeObserver(() => {
        setTimeout(fit, 50);
      });
      resizeObserver.observe(container);

      const handleVisibilityChange = () => {
        if (document.visibilityState !== "visible" || !terminalRef.current) return;
        // WKWebView 后台挂起 canvas rAF，切回来时强制 refresh 触发重绘。
        // reset() 会清空 scrollback，不能用；refresh() 是非破坏性的。
        window.requestAnimationFrame(() => {
          try {
            fit();
          } catch {
            /* ignore */
          }
          const t = terminalRef.current;
          if (t) {
            t.refresh(0, t.rows - 1);
            t.focus();
          }
        });
      };
      document.addEventListener("visibilitychange", handleVisibilityChange);

      let unlisten: (() => void) | null = null;
      let cleaned = false;
      listen<ShellOutputEvent>("shell-output", (event) => {
        if (event.payload.shell_id === shellId && terminalRef.current) {
          smartWrite(event.payload.data);
        }
      }).then((fn) => {
        if (cleaned) {
          fn(); // already unmounted, unlisten immediately
        } else {
          unlisten = fn;
        }
      });

      return () => {
        cleaned = true;
        unlisten?.();
        disposeSmartCopy();
        disposeOnData.dispose();
        resizeObserver.disconnect();
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        terminalRef.current = null;
        fitAddonRef.current = null;
        term.dispose();
        invoke("kill_shell", { shellId }).catch(() => {});
      };
    }, [shellId, projectPath]);

    useEffect(() => {
      if (!isActive) return;
      window.requestAnimationFrame(() => {
        try {
          fitAddonRef.current?.fit();
          const term = terminalRef.current;
          if (!term) return;
          invoke("resize_pty", { taskId: shellId, cols: term.cols, rows: term.rows }).catch(
            () => {},
          );
          term.refresh(0, term.rows - 1);
          term.focus();
        } catch {
          // ignore
        }
      });
    }, [isActive, shellId]);

    useEffect(() => {
      if (terminalRef.current) {
        terminalRef.current.options.theme = isDark ? DARK_THEME : LIGHT_THEME;
      }
    }, [isDark]);

    return (
      <div
        style={{
          flexShrink: 0,
          height,
          borderTop: "1px solid var(--border-dim)",
          display: "flex",
          flexDirection: "column",
          background: isDark ? DARK_THEME.background : LIGHT_THEME.background,
        }}
      >
        {/* Drag handle */}
        {onResizeStart && (
          <div
            onMouseDown={onResizeStart}
            style={{
              height: 4,
              flexShrink: 0,
              cursor: "row-resize",
              background: "transparent",
            }}
          />
        )}
        {/* Header */}
        <div
          style={{
            height: 32,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            padding: "0 10px 0 14px",
            borderBottom: "1px solid var(--border-dim)",
            background: "var(--bg-sidebar)",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", flex: 1 }}>
            Terminal
          </span>
          <button
            onClick={onClose}
            title="Close terminal"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 3,
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              color: "var(--text-hint)",
            }}
          >
            <X size={14} />
          </button>
        </div>
        {/* Terminal */}
        <div
          ref={containerRef}
          style={{ flex: 1, overflow: "hidden", padding: "4px 6px", cursor: "text" }}
        />
      </div>
    );
  },
);
