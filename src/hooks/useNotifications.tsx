import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { NotificationResult } from "../types";
import { useI18n } from "../i18n";

interface NotificationsContextValue {
  result: NotificationResult | null;
  loading: boolean;
  error: string | null;
  fetchNotifications: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [result, setResult] = useState<NotificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke<NotificationResult>("get_notifications");
      setResult(data);
      setError(null);
    } catch (err) {
      const message =
        typeof err === "string"
          ? err
          : err instanceof Error
            ? err.message
            : t("notification.loadingFailed");
      setError(message);
      console.error("Failed to load notifications:", err);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchNotifications();
    // Long-running desktop app: poll periodically so users who never restart
    // still receive new notifications. The backend throttles actual remote
    // fetches to once per hour, so this only triggers a network hit every 6h.
    const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;
    const interval = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markRead = useCallback(async (id: string) => {
    try {
      await invoke("mark_notification_read", { id });
      setResult((prev) => {
        if (!prev) return prev;
        const notifications = prev.notifications.map((n) =>
          n.id === id ? { ...n, isRead: true } : n,
        );
        const unreadCount = notifications.filter((n) => !n.isRead).length;
        return { notifications, unreadCount };
      });
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await invoke("mark_all_notifications_read");
      setResult((prev) => {
        if (!prev) return prev;
        const notifications = prev.notifications.map((n) => ({ ...n, isRead: true }));
        return { notifications, unreadCount: 0 };
      });
    } catch (err) {
      console.error("Failed to mark all notifications as read:", err);
    }
  }, []);

  const value = useMemo(
    () => ({
      result,
      loading,
      error,
      fetchNotifications,
      markRead,
      markAllRead,
    }),
    [error, fetchNotifications, loading, markAllRead, markRead, result],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationsProvider");
  }
  return context;
}
