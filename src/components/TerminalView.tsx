import { useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SerializeAddon } from "@xterm/addon-serialize";
import { attachSmartCopy } from "./terminalCopyHelper";
import {
  DEFAULT_SHIFT_ENTER_NEWLINE,
  matchesTerminalNewline,
  normalizeShiftEnterNewline,
  TERMINAL_NEWLINE_SEQUENCE,
} from "../shortcuts";
import type { TerminalFontSize, FontFamily, ThemeVariant } from "../types";
import {
  themeFor,
  initTerminal,
  loadWebglAddon,
  safeFit,
  createSmartWriter,
  attachMacWebKitTerminalGuard,
  applyTerminalFontSize,
  applyTerminalFontFamily,
} from "./terminalShared";
import { attachLinuxIMEFix, attachMacWebKitShiftInputFix } from "./terminalInputFix";
import "@xterm/xterm/css/xterm.css";

function chatTerminalThemeFor(themeVariant: ThemeVariant) {
  const theme = themeFor(themeVariant);
  if (themeVariant !== "dark") return theme;
  return { ...theme, background: "#2b313d" };
}

interface TerminalViewProps {
  onInput: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  onRegisterTerminal: (
    writeFn: ((data: string, callback?: () => void) => void) | null,
  ) => number;
  onReady?: (generation: number) => void;
  themeVariant: ThemeVariant;
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
  themeVariant,
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
  const shiftEnterNewlineRef = useRef<boolean>(DEFAULT_SHIFT_ENTER_NEWLINE);
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

    const { term, fitAddon } = initTerminal(themeVariant, 1000, terminalFontSize, monoFontFamily);
    term.options.theme = chatTerminalThemeFor(themeVariant);
    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    const serializeAddon = new SerializeAddon();
    term.loadAddon(serializeAddon);
    term.open(container);
    const disposeInputFix = attachMacWebKitShiftInputFix(term);
    loadWebglAddon(term);

    const size = safeFit(fitAddon, term, container);
    if (size) notifyResize(size.cols, size.rows);

    const focusTerminal = () => {
      window.requestAnimationFrame(() => {
        term.focus();
      });
    };

    const writer = createSmartWriter(term);
    const disposeMacWebKitGuard = attachMacWebKitTerminalGuard({ term, container, writer });

    const terminalGeneration = onRegisterRef.current(writer.write);

    const completeRestore = () => {
      onReadyRef.current?.(terminalGeneration);
      focusTerminal();
    };

    window.requestAnimationFrame(() => {
      const s = safeFit(fitAddon, term, container);
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

    const disposeSmartCopy = attachSmartCopy(term, {
      matchesNewline: (e) => matchesTerminalNewline(e, shiftEnterNewlineRef.current),
      onNewline: () => onInputRef.current(TERMINAL_NEWLINE_SEQUENCE),
    });
    const linuxIME = attachLinuxIMEFix(term, (data) => onInputRef.current(data));
    const disposeOnData = { dispose: () => linuxIME.dispose() };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button === 0) {
        focusTerminal();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      window.requestAnimationFrame(() => {
        const s = safeFit(fitAddon, term, container);
        if (s) notifyResize(s.cols, s.rows);
        term.focus();
      });
    };

    container.addEventListener("pointerdown", handlePointerDown as EventListener);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const s = safeFit(fitAddon, term, container);
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
      onRegisterRef.current(null);
      fitAddonRef.current = null;
      disposeMacWebKitGuard();
      disposeInputFix();
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

  // Keep the configured "insert newline" combo in sync with app settings.
  // Mirrors NewTaskView: load once, then react to the global settings event.
  useEffect(() => {
    function loadNewlineShortcut() {
      invoke<{ terminal_shift_enter_newline?: unknown }>("load_app_settings")
        .then((settings) => {
          shiftEnterNewlineRef.current = normalizeShiftEnterNewline(
            settings.terminal_shift_enter_newline,
          );
        })
        .catch(() => {
          shiftEnterNewlineRef.current = DEFAULT_SHIFT_ENTER_NEWLINE;
        });
    }
    loadNewlineShortcut();
    window.addEventListener("nezha:app-settings-changed", loadNewlineShortcut);
    return () => window.removeEventListener("nezha:app-settings-changed", loadNewlineShortcut);
  }, []);

  useEffect(() => {
    if (!isActive) return;
    window.requestAnimationFrame(() => {
      if (!fitAddonRef.current || !terminalRef.current || !containerRef.current) return;
      const s = safeFit(fitAddonRef.current, terminalRef.current, containerRef.current);
      if (s) notifyResize(s.cols, s.rows);
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
      terminalRef.current.options.theme = chatTerminalThemeFor(themeVariant);
    }
  }, [themeVariant]);

  useEffect(() => {
    if (!terminalRef.current || !fitAddonRef.current || !containerRef.current) return;
    const size = applyTerminalFontSize(
      terminalRef.current,
      fitAddonRef.current,
      terminalFontSize,
      containerRef.current,
    );
    if (size) notifyResize(size.cols, size.rows);
  }, [terminalFontSize, notifyResize]);

  useEffect(() => {
    if (!terminalRef.current || !fitAddonRef.current || !containerRef.current) return;
    const size = applyTerminalFontFamily(
      terminalRef.current,
      fitAddonRef.current,
      monoFontFamily,
      containerRef.current,
    );
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
