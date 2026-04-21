import { useState } from "react";
import { AlertCircle } from "lucide-react";

function formatBytes(byteLength: number): string {
  if (byteLength < 1024) return `${byteLength} B`;
  if (byteLength < 1024 * 1024) return `${(byteLength / 1024).toFixed(1)} KB`;
  return `${(byteLength / 1024 / 1024).toFixed(1)} MB`;
}

export function ImagePreviewPane({
  src,
  fileName,
  mimeType,
  byteLength,
}: {
  src: string;
  fileName: string;
  mimeType: string;
  byteLength: number;
}) {
  const [loadError, setLoadError] = useState(false);

  if (loadError) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 10,
          color: "var(--text-muted)",
        }}
      >
        <AlertCircle size={24} strokeWidth={1.5} />
        <span style={{ fontSize: 12.5 }}>Image preview unavailable</span>
      </div>
    );
  }

  return (
    <div
      style={{
        height: "100%",
        overflow: "auto",
        padding: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(45deg, var(--image-checker-bg) 25%, transparent 25%), linear-gradient(-45deg, var(--image-checker-bg) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--image-checker-bg) 75%), linear-gradient(-45deg, transparent 75%, var(--image-checker-bg) 75%)",
        backgroundSize: "20px 20px",
        backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
      }}
    >
      <div
        style={{
          maxWidth: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
        }}
      >
        <img
          src={src}
          alt={fileName}
          draggable={false}
          onError={() => setLoadError(true)}
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            borderRadius: 8,
            boxShadow: "var(--shadow-media)",
            background: "var(--bg-panel)",
          }}
        />
        <div
          style={{
            fontSize: 11.5,
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {mimeType} · {formatBytes(byteLength)}
        </div>
      </div>
    </div>
  );
}
