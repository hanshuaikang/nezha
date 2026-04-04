interface PastedImage {
  id: string;
  dataUrl: string;
}

export function ImageAttachments({
  images,
  onRemove,
}: {
  images: PastedImage[];
  onRemove: (id: string) => void;
}) {
  if (images.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "6px 12px 0" }}>
      {images.map((img) => (
        <div key={img.id} style={{ position: "relative", flexShrink: 0 }}>
          <img
            src={img.dataUrl}
            style={{
              width: 64,
              height: 64,
              objectFit: "cover",
              borderRadius: 6,
              display: "block",
              border: "1px solid var(--border)",
            }}
          />
          <button
            onClick={() => onRemove(img.id)}
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
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
