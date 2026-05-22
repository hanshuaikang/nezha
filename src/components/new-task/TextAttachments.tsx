import { FileText, X } from "lucide-react";

export interface PastedText {
  id: string;
  text: string;
}

function formatSize(len: number): string {
  if (len < 1000) return `${len}`;
  return `${(len / 1000).toFixed(1)}K`;
}

export function TextAttachments({
  texts,
  onRemove,
}: {
  texts: PastedText[];
  onRemove: (id: string) => void;
}) {
  if (texts.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "6px 12px 0" }}>
      {texts.map((item) => (
        <div
          key={item.id}
          style={{
            position: "relative",
            width: 64,
            height: 64,
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--bg-secondary)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            flexShrink: 0,
          }}
        >
          <FileText size={18} style={{ color: "var(--text-muted)" }} />
          <span
            style={{
              fontSize: 10,
              color: "var(--text-hint)",
              fontWeight: 500,
            }}
          >
            {formatSize(item.text.length)}
          </span>
          <button
            onClick={() => onRemove(item.id)}
            style={{
              position: "absolute",
              top: -5,
              right: -5,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "var(--text-muted)",
              border: "none",
              color: "var(--bg)",
              fontSize: 10,
              lineHeight: "16px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            <X size={10} />
          </button>
        </div>
      ))}
    </div>
  );
}
