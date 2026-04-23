import { useState, useEffect, useCallback } from "react";
import { Bell, X, ExternalLink, Check, CheckCheck, Info, AlertTriangle, AlertCircle } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { NotificationItem, NotificationResult } from "../types";
import s from "../styles";

function LevelIcon({ level }: { level: string }) {
  switch (level) {
    case "warning":
      return <AlertTriangle size={14} strokeWidth={2} color="var(--color-warning)" />;
    case "error":
      return <AlertCircle size={14} strokeWidth={2} color="var(--danger)" />;
    default:
      return <Info size={14} strokeWidth={2} color="var(--accent)" />;
  }
}

function NotificationEntry({
  item,
  onMarkRead,
}: {
  item: NotificationItem;
  onMarkRead: (id: string) => void;
}) {
  const [hov, setHov] = useState(false);

  const handleClick = async () => {
    if (!item.isRead) onMarkRead(item.id);
    if (item.url) {
      await openUrl(item.url);
    }
  };

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "10px 12px",
        borderBottom: "1px solid var(--border-dim)",
        cursor: item.url ? "pointer" : "default",
        background: hov ? "var(--bg-hover)" : item.isRead ? "transparent" : "var(--accent-subtle)",
        transition: "background 0.12s",
        display: "grid",
        gridTemplateColumns: "auto minmax(0, 1fr) auto",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <div style={{ flexShrink: 0, marginTop: 2 }}>
        <LevelIcon level={item.level} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 3,
          }}
        >
          <span
            style={{
              fontSize: 12.5,
              fontWeight: item.isRead ? 500 : 600,
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
            }}
          >
            {item.title}
          </span>
          {item.url && (
            <ExternalLink
              size={11}
              strokeWidth={2}
              color="var(--text-hint)"
              style={{ flexShrink: 0 }}
            />
          )}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: "var(--text-muted)",
            lineHeight: 1.5,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
          }}
        >
          {item.body}
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: "var(--text-hint)",
            marginTop: 4,
          }}
        >
          {item.createdAt}
        </div>
      </div>
      {!item.isRead && (
        <button
          title="Mark as read"
          onClick={(e) => {
            e.stopPropagation();
            onMarkRead(item.id);
          }}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 2,
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            color: "var(--text-hint)",
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          <Check size={12} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
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
            : "Failed to load notifications";
      setError(message);
      console.error("Failed to load notifications:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkRead = useCallback(
    async (id: string) => {
      try {
        await invoke("mark_notification_read", { id });
        setResult((prev) => {
          if (!prev) return prev;
          const notifications = prev.notifications.map((n) =>
            n.id === id ? { ...n, isRead: true } : n,
          );
          const unreadCount = notifications.filter((n) => !n.isRead).length;
          const hasUnreadPopup = notifications.some((n) => !n.isRead && n.popup);
          return { notifications, unreadCount, hasUnreadPopup };
        });
      } catch {
        // Silent
      }
    },
    [],
  );

  const handleMarkAllRead = useCallback(async () => {
    try {
      await invoke("mark_all_notifications_read");
      setResult((prev) => {
        if (!prev) return prev;
        const notifications = prev.notifications.map((n) => ({ ...n, isRead: true }));
        return { notifications, unreadCount: 0, hasUnreadPopup: false };
      });
    } catch {
      // Silent
    }
  }, []);

  const unreadCount = result?.unreadCount ?? 0;
  const isActive = unreadCount > 0 || loading || Boolean(error);
  const bellColor = error
    ? "var(--danger)"
    : unreadCount > 0
      ? "var(--accent)"
      : "var(--text-hint)";

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) {
      setOpen(false);
    }
  }

  return (
    <>
      <button
        style={{
          ...s.sidebarIconBtn,
          opacity: isActive ? 1 : 0.5,
        }}
        title="Notifications"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={14} strokeWidth={1.6} color={bellColor} />
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -1,
              right: -1,
              minWidth: 12,
              height: 12,
              borderRadius: 6,
              background: "var(--danger)",
              color: "var(--fg-on-accent)",
              fontSize: 8,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 2px",
              lineHeight: 1,
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={s.modalOverlay}
          onClick={handleOverlayClick}
        >
          <div
            style={{
              width: 420,
              maxWidth: "calc(100vw - 32px)",
              maxHeight: "72vh",
              background: "var(--bg-card)",
              border: "1px solid var(--border-medium)",
              borderRadius: 14,
              boxShadow: "var(--shadow-popover)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "14px 16px",
                borderBottom: "1px solid var(--border-dim)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  flex: 1,
                }}
              >
                Notifications
                {unreadCount > 0 && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 11,
                      fontWeight: 500,
                      color: "var(--text-muted)",
                    }}
                  >
                    ({unreadCount} unread)
                  </span>
                )}
              </span>
              {unreadCount > 0 && (
                <button
                  title="Mark all as read"
                  onClick={handleMarkAllRead}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 3,
                    borderRadius: 4,
                    display: "flex",
                    alignItems: "center",
                    color: "var(--text-muted)",
                  }}
                >
                  <CheckCheck size={14} strokeWidth={2} />
                </button>
              )}
              <button
                title="Close"
                onClick={() => setOpen(false)}
                style={s.modalCloseBtn}
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: "auto",
              }}
            >
              {loading && !result ? (
                <div
                  style={{
                    padding: 24,
                    textAlign: "center",
                    fontSize: 12,
                    color: "var(--text-hint)",
                  }}
                >
                  Loading...
                </div>
              ) : error && !result ? (
                <div
                  style={{
                    padding: 24,
                    textAlign: "center",
                    fontSize: 12,
                    color: "var(--danger)",
                    lineHeight: 1.5,
                  }}
                >
                  {error}
                </div>
              ) : !result || result.notifications.length === 0 ? (
                <div
                  style={{
                    padding: 24,
                    textAlign: "center",
                    fontSize: 12,
                    color: "var(--text-hint)",
                  }}
                >
                  No notifications
                </div>
              ) : (
                result.notifications.map((item) => (
                  <NotificationEntry key={item.id} item={item} onMarkRead={handleMarkRead} />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
