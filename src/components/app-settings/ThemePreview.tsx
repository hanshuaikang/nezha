import type { ThemeMode } from "../../types";

export function ThemePreview({
  mode,
  previewBackground,
  previewBorder,
  previewAccent,
}: {
  mode: Extract<ThemeMode, "dark" | "light">;
  previewBackground: string;
  previewBorder: string;
  previewAccent: string;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: 106,
        borderRadius: 10,
        border: `1px solid ${previewBorder}`,
        background: previewBackground,
        padding: 8,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 7,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", gap: 5 }}>
        {[0.9, 0.65, 0.4].map((opacity) => (
          <span
            key={opacity}
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: previewAccent,
              opacity,
            }}
          />
        ))}
      </div>
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: mode === "dark" ? "28px 1fr" : "24px 1fr",
          gap: 7,
        }}
      >
        <ThemePreviewRail mode={mode} previewAccent={previewAccent} />
        <ThemePreviewContent mode={mode} previewAccent={previewAccent} />
      </div>
    </div>
  );
}

function ThemePreviewRail({
  mode,
  previewAccent,
}: {
  mode: Extract<ThemeMode, "dark" | "light">;
  previewAccent: string;
}) {
  return (
    <div
      style={{
        borderRadius: 7,
        background: mode === "dark" ? "rgba(255,255,255,0.05)" : "rgba(23,27,36,0.06)",
        border:
          mode === "dark"
            ? "1px solid rgba(255,255,255,0.06)"
            : "1px solid rgba(23,27,36,0.06)",
        display: "flex",
        flexDirection: "column",
        gap: 5,
        padding: "7px 5px",
      }}
    >
      {[0.55, 0.28, 0.2].map((opacity) => (
        <span
          key={opacity}
          style={{
            height: 5,
            borderRadius: 999,
            background: previewAccent,
            opacity: mode === "dark" ? opacity : opacity * 0.55,
          }}
        />
      ))}
    </div>
  );
}

function ThemePreviewContent({
  mode,
  previewAccent,
}: {
  mode: Extract<ThemeMode, "dark" | "light">;
  previewAccent: string;
}) {
  return (
    <div
      style={{
        borderRadius: 8,
        background:
          mode === "dark"
            ? "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))"
            : "linear-gradient(180deg, rgba(23,27,36,0.1), rgba(23,27,36,0.04))",
        border:
          mode === "dark"
            ? "1px solid rgba(255,255,255,0.08)"
            : "1px solid rgba(23,27,36,0.08)",
        padding: 8,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}
      >
        <span
          style={{
            width: 34,
            height: 6,
            borderRadius: 999,
            background: previewAccent,
            opacity: mode === "dark" ? 0.75 : 0.2,
          }}
        />
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: 4,
            background: mode === "dark" ? "rgba(255,255,255,0.12)" : "#ffffff",
            border:
              mode === "dark"
                ? "1px solid rgba(255,255,255,0.08)"
                : "1px solid rgba(23,27,36,0.08)",
          }}
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.15fr 0.85fr",
          gap: 6,
          flex: 1,
        }}
      >
        <div
          style={{
            borderRadius: 6,
            background: mode === "dark" ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.9)",
            border:
              mode === "dark"
                ? "1px solid rgba(255,255,255,0.06)"
                : "1px solid rgba(23,27,36,0.06)",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span
            style={{
              height: 18,
              borderRadius: 6,
              background: mode === "dark" ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.92)",
              border:
                mode === "dark"
                  ? "1px solid rgba(255,255,255,0.06)"
                  : "1px solid rgba(23,27,36,0.06)",
            }}
          />
          <span
            style={{
              flex: 1,
              borderRadius: 6,
              background: mode === "dark" ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.82)",
              border:
                mode === "dark"
                  ? "1px solid rgba(255,255,255,0.05)"
                  : "1px solid rgba(23,27,36,0.05)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
