import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDown, ChevronRight, Wrench, Copy, Check } from "lucide-react";
import { marked } from "marked";
import { useI18n } from "../i18n";

interface SessionContent {
  type: "text" | "tool_use" | "thinking";
  text?: string;
  id?: string;
  name?: string;
  input?: string;
  thinking?: string;
}

interface SessionMessage {
  role: "user" | "assistant";
  content: SessionContent[];
}

function ToolUseCard({ name, input }: { name: string; input: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      style={{
        margin: "6px 0",
        border: "1px solid var(--border-dim)",
        borderRadius: 6,
        overflow: "hidden",
        fontSize: 12,
      }}
    >
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "5px 10px",
          background: "var(--bg-input)",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          color: "var(--text-secondary)",
        }}
      >
        {expanded ? (
          <ChevronDown size={11} style={{ flexShrink: 0 }} />
        ) : (
          <ChevronRight size={11} style={{ flexShrink: 0 }} />
        )}
        <Wrench size={11} style={{ color: "var(--text-hint)", flexShrink: 0 }} />
        <span
          style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 600 }}
        >
          {name}
        </span>
      </button>
      {expanded && (
        <pre
          style={{
            margin: 0,
            padding: "8px 12px",
            fontSize: 11,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            color: "var(--text-secondary)",
            background: "var(--bg-root)",
            overflowX: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            maxHeight: 280,
            overflowY: "auto",
          }}
        >
          {input}
        </pre>
      )}
    </div>
  );
}

function ThinkingBlock({ thinking }: { thinking: string }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ marginBottom: 6 }}>
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "2px 0",
          color: "var(--text-hint)",
          fontSize: 11.5,
          fontStyle: "italic",
        }}
      >
        {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span>{t("session.thinking")}</span>
      </button>
      {expanded && (
        <div
          style={{
            padding: "6px 12px",
            fontSize: 12,
            color: "var(--text-muted)",
            fontStyle: "italic",
            borderLeft: "2px solid var(--border-dim)",
            marginLeft: 4,
            marginTop: 4,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            lineHeight: 1.55,
          }}
        >
          {thinking}
        </div>
      )}
    </div>
  );
}

function UserMessageBubble({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div style={{ marginBottom: 14, display: "flex", justifyContent: "flex-end" }}>
      <div
        style={{ maxWidth: "72%", position: "relative" }}
        className="user-message-bubble"
        onMouseEnter={(e) => {
          const btn = (e.currentTarget as HTMLElement).querySelector(
            ".copy-btn",
          ) as HTMLElement | null;
          if (btn) btn.style.opacity = "1";
        }}
        onMouseLeave={(e) => {
          const btn = (e.currentTarget as HTMLElement).querySelector(
            ".copy-btn",
          ) as HTMLElement | null;
          if (btn) btn.style.opacity = "0";
        }}
      >
        <button
          className="copy-btn"
          onClick={handleCopy}
          style={{
            position: "absolute",
            top: 6,
            right: 8,
            opacity: 0,
            transition: "opacity 0.15s",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 2,
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
        <div
          style={{
            padding: "10px 16px",
            background: "var(--bg-subtle)",
            color: "var(--text-primary)",
            borderRadius: 20,
            fontSize: 13.5,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {text}
        </div>
      </div>
    </div>
  );
}

function MessageBlock({ message }: { message: SessionMessage }) {
  const isUser = message.role === "user";

  if (isUser) {
    const text = message.content
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n");
    if (!text.trim()) return null;
    return <UserMessageBubble text={text} />;
  }

  const textParts = message.content.filter((c) => c.type === "text");
  const toolParts = message.content.filter((c) => c.type === "tool_use");
  const thinkingParts = message.content.filter((c) => c.type === "thinking");

  if (textParts.length === 0 && toolParts.length === 0 && thinkingParts.length === 0) return null;

  return (
    <div style={{ marginBottom: 18 }}>
      {thinkingParts.map((t, i) => (
        <ThinkingBlock key={i} thinking={t.thinking ?? ""} />
      ))}
      {textParts.map((t, i) => (
        <div
          key={i}
          className="session-prose"
          dangerouslySetInnerHTML={{ __html: marked(t.text ?? "", { async: false }) as string }}
        />
      ))}
      {toolParts.map((t, i) => (
        <ToolUseCard key={i} name={t.name ?? ""} input={t.input ?? ""} />
      ))}
    </div>
  );
}

export function SessionView({ sessionPath }: { sessionPath: string }) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    invoke<SessionMessage[]>("read_session_messages", { sessionPath })
      .then((msgs) => {
        setMessages(msgs);
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, [sessionPath]);

  return (
    <div
      ref={scrollRef}
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "20px 28px 32px",
      }}
    >
      {loading && (
        <div style={{ color: "var(--text-hint)", fontSize: 13, padding: "12px 0" }}>
          {t("session.loading")}
        </div>
      )}
      {error && (
        <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "12px 0" }}>
          {t("session.unableToLoad", { error })}
        </div>
      )}
      {!loading && !error && messages.length === 0 && (
        <div style={{ color: "var(--text-hint)", fontSize: 13, padding: "12px 0" }}>
          {t("session.noMessages")}
        </div>
      )}
      {messages.map((msg, i) => (
        <MessageBlock key={i} message={msg} />
      ))}
    </div>
  );
}
