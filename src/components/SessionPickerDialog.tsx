import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, MessageSquare, Search, Eye, Play } from "lucide-react";
import type { SessionListItem } from "../types";
import { useI18n } from "../i18n";
import s from "../styles";

function formatRelativeTime(epochSecs: number): string {
  const now = Date.now() / 1000;
  const diff = now - epochSecs;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(epochSecs * 1000).toLocaleDateString();
}

export function SessionPickerDialog({
  projectPath,
  onSelect,
  onClose,
}: {
  projectPath: string;
  onSelect: (session: SessionListItem, resume: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    invoke<SessionListItem[]>("list_project_sessions", { projectPath })
      .then((items) => {
        if (!cancelled) {
          setSessions(items);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  const filtered = query.trim()
    ? sessions.filter((item) => {
        const q = query.toLowerCase();
        return (
          item.id.toLowerCase().includes(q) ||
          (item.title ?? "").toLowerCase().includes(q)
        );
      })
    : sessions;

  const selected = filtered.find((item) => item.id === selectedId);

  const btnBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "6px 14px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    border: "none",
  };

  return (
    <div style={s.modalOverlay} onClick={onClose}>
      <div
        style={{
          width: "min(560px, calc(100vw - 48px))",
          maxHeight: "min(520px, calc(100vh - 96px))",
          background: "var(--bg-card)",
          border: "1px solid var(--border-medium)",
          borderRadius: 14,
          boxShadow: "var(--shadow-popover)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px 10px",
            borderBottom: "1px solid var(--border-dim)",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
            {t("session.pickerTitle")}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 4,
              display: "flex",
            }}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Search */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 18px",
            borderBottom: "1px solid var(--border-dim)",
          }}
        >
          <Search size={13} strokeWidth={2} color="var(--text-muted)" />
          <input
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              fontSize: 13,
              color: "var(--text-primary)",
              fontFamily: "var(--font-ui)",
            }}
            placeholder="Search sessions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {loading && (
            <div style={{ padding: "24px 18px", color: "var(--text-hint)", fontSize: 13 }}>
              Loading...
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: "24px 18px", color: "var(--text-hint)", fontSize: 13 }}>
              {t("session.noSessions")}
            </div>
          )}
          {filtered.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => setSelectedId(session.id)}
              onDoubleClick={() => onSelect(session, false)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                width: "100%",
                padding: "10px 18px",
                background:
                  selectedId === session.id ? "var(--control-active-bg)" : "transparent",
                border: "none",
                borderRadius: 0,
                cursor: "pointer",
                textAlign: "left",
                color:
                  selectedId === session.id
                    ? "var(--control-active-fg)"
                    : "var(--text-primary)",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => {
                if (selectedId !== session.id)
                  (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                if (selectedId !== session.id)
                  (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              <MessageSquare
                size={14}
                strokeWidth={1.8}
                style={{ flexShrink: 0, marginTop: 2, opacity: 0.6 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    lineHeight: 1.4,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {session.title ?? t("session.untitled")}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color:
                      selectedId === session.id
                        ? "var(--control-active-fg)"
                        : "var(--text-hint)",
                    opacity: 0.8,
                    marginTop: 2,
                  }}
                >
                  {session.id.slice(0, 8)}... · {formatRelativeTime(session.modified_at)}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "10px 18px 14px",
            borderTop: "1px solid var(--border-dim)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              ...btnBase,
              background: "transparent",
              color: "var(--text-muted)",
              border: "1px solid var(--border-dim)",
              fontWeight: 400,
            }}
          >
            {t("session.cancel")}
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && onSelect(selected, false)}
            style={{
              ...btnBase,
              background: selected ? "var(--bg-hover)" : "var(--bg-hover)",
              color: selected ? "var(--text-primary)" : "var(--text-hint)",
              border: "1px solid var(--border-dim)",
              cursor: selected ? "pointer" : "not-allowed",
              fontWeight: 500,
            }}
          >
            <Eye size={12} strokeWidth={2} />
            {t("session.view")}
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && onSelect(selected, true)}
            style={{
              ...btnBase,
              background: selected ? "var(--primary-action-bg)" : "var(--bg-hover)",
              color: selected ? "var(--primary-action-fg)" : "var(--text-hint)",
              cursor: selected ? "pointer" : "not-allowed",
            }}
          >
            <Play size={12} strokeWidth={2.5} />
            {t("session.resume")}
          </button>
        </div>
      </div>
    </div>
  );
}
