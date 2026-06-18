import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CheckCircle2, AlertCircle, AlertTriangle, Info } from "lucide-react";
import type React from "react";
import type { ToastPosition } from "../types";
import {
  cloneDefaultNotificationSettings,
  DEFAULT_NOTIFICATION_SETTINGS,
  normalizeNotificationSettings,
} from "../types";

export const NOTIFICATION_SETTINGS_CHANGED_EVENT = "nezha:notificationSettingsChanged";

type ToastType = "error" | "warning" | "success" | "info";

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  onClick?: () => void;
  exiting?: boolean;
  persistent?: boolean;
  paused?: boolean;
  waitingForFocus?: boolean;
  notification?: boolean;
}

export interface ToastOptions {
  onClick?: () => void;
  playSound?: boolean;
  persistent?: boolean;
  waitForFocus?: boolean;
  notification?: boolean;
}

interface ToastContextValue {
  showToast: (
    message: string,
    type?: ToastType,
    onClickOrOptions?: (() => void) | ToastOptions,
  ) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export type { ToastType };

function toastAccentColor(type: ToastType): string {
  switch (type) {
    case "error": return "var(--danger)";
    case "warning": return "var(--warning)";
    case "success": return "var(--success)";
    case "info": return "var(--accent)";
  }
}

function ToastIcon({ type }: { type: ToastType }) {
  const size = 16;
  const color = toastAccentColor(type);
  switch (type) {
    case "error": return <AlertCircle size={size} color={color} />;
    case "warning": return <AlertTriangle size={size} color={color} />;
    case "success": return <CheckCircle2 size={size} color={color} />;
    case "info": return <Info size={size} color={color} />;
  }
}

function readNotificationSettings() {
  try {
    const raw = localStorage.getItem("nezha:notificationSettings");
    if (raw) return normalizeNotificationSettings(JSON.parse(raw));
  } catch { /* Corrupt or missing settings — use defaults */ }
  return cloneDefaultNotificationSettings();
}

let audioCtx: AudioContext | null = null;

async function playNotificationSound() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const ctx = audioCtx;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    if (ctx.state !== "running") return;
    const now = ctx.currentTime;

    const notes = [
      { freq: 523.25, start: 0, dur: 0.15 },    // C5
      { freq: 659.25, start: 0.09, dur: 0.2 },   // E5
    ] as const;

    const master = ctx.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(ctx.destination);

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = note.freq;
      env.gain.setValueAtTime(0, now + note.start);
      env.gain.linearRampToValueAtTime(1, now + note.start + 0.005);
      env.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.dur);
      osc.connect(env).connect(master);
      osc.start(now + note.start);
      osc.stop(now + note.start + note.dur + 0.01);

      const osc2 = ctx.createOscillator();
      const env2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.value = note.freq * 2;
      env2.gain.setValueAtTime(0, now + note.start);
      env2.gain.linearRampToValueAtTime(HARMONIC_VOLUME, now + note.start + 0.005);
      env2.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.dur * 0.7);
      osc2.connect(env2).connect(master);
      osc2.start(now + note.start);
      osc2.stop(now + note.start + note.dur + 0.01);
    }
  } catch (e) { console.warn("Notification sound playback failed:", e); }
}

function positionAnimation(position: ToastPosition, exiting: boolean): string {
  const dir = position.includes("right") ? "right" : "left";
  const suffix = exiting ? "out" : "in";
  return `toast-${dir}-${suffix} 0.25s ease forwards`;
}

const DURATION = 4500;
const EXIT_ANIM_MS = 260;
const MAX_MESSAGE_LENGTH = 180;
const MASTER_VOLUME = 0.12;
const HARMONIC_VOLUME = 0.35;

const POSITION_STYLES: Record<ToastPosition, React.CSSProperties> = {
  "top-left": { top: 20, left: 20 },
  "top-right": { top: 20, right: 20 },
  "bottom-left": { bottom: 20, left: 20 },
  "bottom-right": { bottom: 20, right: 20 },
};

function groupToastsByPosition(toasts: ToastItem[], notificationPosition: ToastPosition) {
  const grouped = new Map<ToastPosition, ToastItem[]>();
  for (const toast of toasts) {
    const position = toast.notification
      ? notificationPosition
      : DEFAULT_NOTIFICATION_SETTINGS.toastPosition;
    const items = grouped.get(position);
    if (items) {
      items.push(toast);
    } else {
      grouped.set(position, [toast]);
    }
  }
  return grouped;
}

function truncateToastMessage(message: string): string {
  return message.length > MAX_MESSAGE_LENGTH
    ? message.slice(0, MAX_MESSAGE_LENGTH - 3) + "..."
    : message;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timerMap = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const isWindowFocusedRef = useRef(document.visibilityState === "visible" && document.hasFocus());
  const [notificationPosition, setNotificationPosition] = useState<ToastPosition>(() =>
    readNotificationSettings().toastPosition,
  );

  // Reactively update position when settings change
  useEffect(() => {
    const refreshPosition = () => {
      const settings = readNotificationSettings();
      setNotificationPosition(settings.toastPosition);
      if (settings.enabled && settings.inApp) return;
      setToasts((prev) => {
        const next = prev.filter((toast) => !(toast.notification && toast.waitingForFocus));
        if (next.length === prev.length) return prev;
        const nextIds = new Set(next.map((toast) => toast.id));
        for (const toast of prev) {
          if (nextIds.has(toast.id)) continue;
          const timer = timerMap.current.get(toast.id);
          if (timer) {
            clearTimeout(timer);
            timerMap.current.delete(toast.id);
          }
        }
        return next;
      });
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === "nezha:notificationSettings") {
        refreshPosition();
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(NOTIFICATION_SETTINGS_CHANGED_EVENT, refreshPosition);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(NOTIFICATION_SETTINGS_CHANGED_EVENT, refreshPosition);
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    const timer = timerMap.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timerMap.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const scheduleDismiss = useCallback((id: string, duration: number) => {
    return setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
      );
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        timerMap.current.delete(id);
      }, EXIT_ANIM_MS);
    }, duration);
  }, []);

  const showToast = useCallback(
    (
      message: string,
      type: ToastType = "error",
      onClickOrOptions?: (() => void) | ToastOptions,
    ) => {
      const opts: ToastOptions =
        typeof onClickOrOptions === "function"
          ? { onClick: onClickOrOptions }
          : onClickOrOptions ?? {};

      const id = `${Date.now()}-${Math.random()}`;
      const waitingForFocus = opts.waitForFocus && !isWindowFocusedRef.current;
      const item: ToastItem = {
        id,
        message: truncateToastMessage(message),
        type,
        onClick: opts.onClick,
        persistent: opts.persistent,
        paused: waitingForFocus,
        waitingForFocus,
        notification: opts.notification,
      };
      setToasts((prev) => {
        const kept = prev.slice(-4);
        const keptIds = new Set(kept.map((toast) => toast.id));
        for (const toast of prev) {
          if (keptIds.has(toast.id)) continue;
          const timer = timerMap.current.get(toast.id);
          if (timer) {
            clearTimeout(timer);
            timerMap.current.delete(toast.id);
          }
        }
        return [...kept, item];
      });

      if (item.notification && opts.playSound === true && readNotificationSettings().sound) {
        playNotificationSound();
      }

      if (!opts.persistent && !item.waitingForFocus) {
        const timer = scheduleDismiss(id, DURATION);
        timerMap.current.set(id, timer);
      }
    },
    [scheduleDismiss],
  );

  useEffect(() => {
    const startWaitingToasts = (force = false) => {
      if (!force && !isWindowFocusedRef.current) return;
      setToasts((prev) => {
        let changed = false;
        const next = prev.map((toast) => {
          if (!toast.waitingForFocus || toast.exiting || toast.persistent) return toast;
          if (!timerMap.current.has(toast.id)) {
            timerMap.current.set(toast.id, scheduleDismiss(toast.id, DURATION));
          }
          changed = true;
          return { ...toast, paused: false, waitingForFocus: false };
        });
        return changed ? next : prev;
      });
    };
    const markDomFocused = () => {
      isWindowFocusedRef.current = document.visibilityState === "visible";
      startWaitingToasts();
    };
    const markBlurred = () => {
      isWindowFocusedRef.current = false;
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        isWindowFocusedRef.current = false;
        return;
      }
      if (document.hasFocus()) {
        isWindowFocusedRef.current = true;
        startWaitingToasts();
      }
    };
    const onTauriFocusChanged = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      isWindowFocusedRef.current = focused && document.visibilityState === "visible";
      if (isWindowFocusedRef.current) startWaitingToasts(true);
    });

    window.addEventListener("focus", markDomFocused);
    window.addEventListener("blur", markBlurred);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", markDomFocused);
      window.removeEventListener("blur", markBlurred);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      onTauriFocusChanged.then((unlisten) => unlisten()).catch(console.error);
    };
  }, [scheduleDismiss]);

  const pause = useCallback((id: string) => {
    const timer = timerMap.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timerMap.current.delete(id);
    }
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, paused: true } : t)),
    );
  }, []);

  const resume = useCallback((id: string) => {
    setToasts((prev) => {
      const toast = prev.find((t) => t.id === id);
      if (!toast || toast.exiting || toast.persistent || toast.waitingForFocus) return prev;
      const timer = scheduleDismiss(id, DURATION);
      timerMap.current.set(id, timer);
      return prev.map((t) => (t.id === id ? { ...t, paused: false } : t));
    });
  }, [scheduleDismiss]);

  useEffect(() => {
    const timers = timerMap.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const positionedToasts = groupToastsByPosition(toasts, notificationPosition);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {Array.from(positionedToasts.entries()).map(([position, positionToasts]) => (
        <ToastContainer
          key={position}
          toasts={positionToasts}
          onDismiss={dismiss}
          onPause={pause}
          onResume={resume}
          position={position}
        />
      ))}
    </ToastContext.Provider>
  );
}

function ToastContainer({
  toasts,
  onDismiss,
  onPause,
  onResume,
  position,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  position: ToastPosition;
}) {
  if (toasts.length === 0) return null;

  const isTop = position.startsWith("top");
  const containerStyle: React.CSSProperties = {
    position: "fixed",
    zIndex: 9999,
    display: "flex",
    flexDirection: isTop ? "column" : "column-reverse",
    gap: 10,
    width: 360,
    pointerEvents: "none",
    ...POSITION_STYLES[position],
  };

  return (
    <div style={containerStyle}>
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => {
            if (t.onClick) t.onClick();
            onDismiss(t.id);
          }}
          style={{
            pointerEvents: "auto",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 14px",
            borderRadius: "var(--radius-lg)",
            background: "var(--bg-card)",
            borderLeft: `3px solid ${toastAccentColor(t.type)}`,
            boxShadow: "var(--shadow-toast)",
            animation: positionAnimation(position, !!t.exiting),
            transition: "box-shadow 0.15s ease, transform 0.15s ease",
            cursor: t.onClick ? "pointer" : "default",
            position: "relative",
            overflow: "hidden",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = "var(--shadow-popover)";
            if (t.onClick) e.currentTarget.style.transform = "translateY(-1px)";
            if (!t.persistent) onPause(t.id);
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "var(--shadow-md)";
            e.currentTarget.style.transform = "none";
            if (!t.persistent && !t.exiting) onResume(t.id);
          }}
        >
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
            <ToastIcon type={t.type} />
          </div>
          <span
            style={{
              flex: 1,
              fontSize: 12.5,
              fontWeight: 500,
              lineHeight: 1.5,
              color: "var(--text-primary)",
            }}
          >
            {t.message}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(t.id);
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-hint)",
              padding: "2px",
              fontSize: 16,
              lineHeight: 1,
              flexShrink: 0,
              fontFamily: "inherit",
              borderRadius: 4,
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-hint)";
            }}
          >
            ×
          </button>
          {!t.exiting && !t.persistent && (
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                height: 2,
                background: toastAccentColor(t.type),
                opacity: 0.3,
                borderRadius: "0 0 0 var(--radius-lg)",
                animation: `toast-progress ${DURATION}ms linear forwards`,
                animationPlayState: t.paused ? "paused" : "running",
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
