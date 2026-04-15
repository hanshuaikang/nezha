import type React from "react";
import { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { attachSmartCopy } from "./terminalCopyHelper";
import {
  DARK_THEME,
  LIGHT_THEME,
  initTerminal,
  loadWebglAddon,
  safeFit,
  createSmartWriter,
} from "./terminalShared";
import { Plus, Terminal as TerminalIcon, Trash2, X } from "lucide-react";
import "@xterm/xterm/css/xterm.css";

interface ShellOutputEvent {
  shell_id: string;
  data: string;
}

export interface ShellTerminalPanelHandle {
  sendCommand: (cmd: string) => void;
}

interface ShellTerminalInstanceHandle {
  sendCommand: (cmd: string) => void;
}

interface ShellSession {
  id: string;
  title: string;
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

const MAX_SHELLS = 5;

function createShellSession(projectId: string, index: number): ShellSession {
  return {
    id: `shell:${projectId}:${index}:${Date.now()}`,
    title: `Terminal ${index}`,
  };
}

const ShellTerminalInstance = forwardRef<ShellTerminalInstanceHandle, {
  shellId: string;
  projectPath: string;
  isActive: boolean;
  isDark: boolean;
  onReady?: () => void;
}>(
  function ShellTerminalInstance({ shellId, projectPath, isActive, isDark, onReady }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<XTerm | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const isDarkRef = useRef(isDark);
    const isActiveRef = useRef(isActive);
    const onReadyRef = useRef(onReady);
    isDarkRef.current = isDark;
    isActiveRef.current = isActive;
    onReadyRef.current = onReady;

    useImperativeHandle(
      ref,
      () => ({
        sendCommand: (cmd: string) => {
          invoke("send_input", { taskId: shellId, data: cmd }).catch(console.error);
        },
      }),
      [shellId],
    );

    useEffect(() => {
      if (!containerRef.current) return;
      const container = containerRef.current;
      let cleaned = false;
      let initTimeoutId: number | null = null;
      let readyTimeoutId: number | null = null;

      const { term, fitAddon } = initTerminal(isDarkRef.current, 5000);
      terminalRef.current = term;
      fitAddonRef.current = fitAddon;
      term.open(container);
      loadWebglAddon(term);

      const fit = () => {
        if (cleaned) return;
        const s = safeFit(fitAddon, term);
        if (s) invoke("resize_pty", { taskId: shellId, cols: s.cols, rows: s.rows }).catch(() => {});
      };

      initTimeoutId = window.setTimeout(() => {
        if (cleaned) return;
        fit();
        invoke<void>("open_shell", {
          shellId,
          projectPath,
          cols: term.cols,
          rows: term.rows,
        })
          .then(() => {
            if (cleaned) return;
            readyTimeoutId = window.setTimeout(() => {
              if (!cleaned) {
                onReadyRef.current?.();
              }
            }, 300);
          })
          .catch(console.error);
        if (isActiveRef.current) {
          term.focus();
        }
      }, 50);

      const writer = createSmartWriter(term);
      const disposeSmartCopy = attachSmartCopy(term);
      const disposeOnData = term.onData((data) => {
        invoke("send_input", { taskId: shellId, data }).catch(() => {});
      });

      const resizeObserver = new ResizeObserver(() => {
        setTimeout(() => {
          if (isActiveRef.current) {
            fit();
          }
        }, 50);
      });
      resizeObserver.observe(container);

      const handleVisibilityChange = () => {
        if (document.visibilityState !== "visible" || !terminalRef.current || !isActiveRef.current) return;
        window.requestAnimationFrame(() => {
          fit();
          const t = terminalRef.current;
          if (t) {
            t.refresh(0, t.rows - 1);
            t.focus();
          }
        });
      };
      document.addEventListener("visibilitychange", handleVisibilityChange);

      let unlisten: (() => void) | null = null;
      listen<ShellOutputEvent>("shell-output", (event) => {
        if (event.payload.shell_id === shellId && terminalRef.current) {
          writer.write(event.payload.data);
        }
      }).then((fn) => {
        if (cleaned) {
          fn();
        } else {
          unlisten = fn;
        }
      });

      return () => {
        cleaned = true;
        if (initTimeoutId !== null) {
          window.clearTimeout(initTimeoutId);
        }
        if (readyTimeoutId !== null) {
          window.clearTimeout(readyTimeoutId);
        }
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
        if (!fitAddonRef.current || !terminalRef.current) return;
        const s = safeFit(fitAddonRef.current, terminalRef.current);
        if (s) invoke("resize_pty", { taskId: shellId, cols: s.cols, rows: s.rows }).catch(() => {});
        terminalRef.current.refresh(0, terminalRef.current.rows - 1);
        terminalRef.current.focus();
      });
    }, [isActive, shellId]);

    useEffect(() => {
      if (terminalRef.current) {
        terminalRef.current.options.theme = isDark ? DARK_THEME : LIGHT_THEME;
      }
    }, [isDark]);

    return (
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          padding: "4px 6px",
          cursor: "text",
          visibility: isActive ? "visible" : "hidden",
          pointerEvents: isActive ? "auto" : "none",
        }}
      />
    );
  },
);

export const ShellTerminalPanel = forwardRef<ShellTerminalPanelHandle, Props>(
  function ShellTerminalPanel(
    { projectPath, projectId, isActive = true, onClose, isDark, onReady, height = 240, onResizeStart },
    ref,
  ) {
    const initialShellRef = useRef<ShellSession | null>(null);
    if (!initialShellRef.current) {
      initialShellRef.current = createShellSession(projectId, 1);
    }

    const nextShellIndexRef = useRef(2);
    const shellRefs = useRef<Record<string, ShellTerminalInstanceHandle | null>>({});
    const [shells, setShells] = useState<ShellSession[]>(() => [initialShellRef.current!]);
    const [activeShellId, setActiveShellId] = useState<string | null>(() => initialShellRef.current!.id);
    const activeShellIdRef = useRef(activeShellId);
    activeShellIdRef.current = activeShellId;

    useImperativeHandle(
      ref,
      () => ({
        sendCommand: (cmd: string) => {
          const currentShellId = activeShellIdRef.current;
          if (!currentShellId) return;
          shellRefs.current[currentShellId]?.sendCommand(cmd);
        },
      }),
      [],
    );

    const handleAddShell = useCallback(() => {
      if (shells.length >= MAX_SHELLS) return;
      const nextShell = createShellSession(projectId, nextShellIndexRef.current++);
      setShells((prev) => [...prev, nextShell]);
      setActiveShellId(nextShell.id);
    }, [projectId, shells.length]);

    const handleCloseShell = useCallback(
      (shellId: string) => {
        const closingIndex = shells.findIndex((shell) => shell.id === shellId);
        if (closingIndex === -1) return;

        const nextShells = shells.filter((shell) => shell.id !== shellId);
        setShells(nextShells);
        delete shellRefs.current[shellId];

        if (nextShells.length === 0) {
          onClose();
          return;
        }

        if (activeShellId === shellId) {
          setActiveShellId(
            nextShells[closingIndex]?.id ??
              nextShells[closingIndex - 1]?.id ??
              nextShells[0]?.id ??
              null,
          );
        }
      },
      [activeShellId, onClose, shells],
    );

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
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {shells.length}/{MAX_SHELLS}
          </span>
          <button
            onClick={onClose}
            title="Close terminals"
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
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, position: "relative" }}>
            {shells.map((shell) => (
              <ShellTerminalInstance
                key={shell.id}
                ref={(instance) => {
                  shellRefs.current[shell.id] = instance;
                }}
                shellId={shell.id}
                projectPath={projectPath}
                isActive={isActive && activeShellId === shell.id}
                isDark={isDark}
                onReady={onReady}
              />
            ))}
          </div>
          <div
            style={{
              width: 104,
              flexShrink: 0,
              borderLeft: "1px solid var(--border-dim)",
              background: "var(--bg-sidebar)",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <div
              style={{
                height: 28,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                padding: "0 4px",
                borderBottom: "1px solid var(--border-dim)",
              }}
            >
              <button
                onClick={handleAddShell}
                disabled={shells.length >= MAX_SHELLS}
                title={shells.length >= MAX_SHELLS ? "Terminal limit reached" : "New terminal"}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  border: "none",
                  background: "transparent",
                  color:
                    shells.length >= MAX_SHELLS ? "var(--text-hint)" : "var(--text-secondary)",
                  cursor: shells.length >= MAX_SHELLS ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Plus size={13} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
              {shells.map((shell) => {
                const selected = activeShellId === shell.id;
                return (
                  <div
                    key={shell.id}
                    onClick={() => setActiveShellId(shell.id)}
                    style={{
                      height: 28,
                      padding: "0 4px 0 8px",
                      borderLeft: selected ? "2px solid var(--accent)" : "2px solid transparent",
                      background: selected ? "var(--bg-hover)" : "transparent",
                      color: "var(--text-primary)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <TerminalIcon size={13} color={selected ? "var(--accent)" : "var(--text-hint)"} />
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 11.5,
                        fontWeight: selected ? 600 : 500,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: selected ? "var(--text-primary)" : "var(--text-secondary)",
                      }}
                    >
                      zsh
                    </div>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        handleCloseShell(shell.id);
                      }}
                      title={`Close ${shell.title}`}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--text-hint)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 1,
                        borderRadius: 4,
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  },
);
