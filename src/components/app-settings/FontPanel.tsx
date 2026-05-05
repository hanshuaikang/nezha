import type { TerminalFontSize, FontFamily } from "../../types";
import {
  TERMINAL_FONT_SIZE_MIN,
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_FONT_SIZE_STEP,
  clampTerminalFontSize,
  DEFAULT_UI_FONT,
  DEFAULT_MONO_FONT,
} from "../../types";
import { useI18n } from "../../i18n";
import s from "../../styles";
import { FontSelector } from "./FontSelector";

interface FontPanelProps {
  terminalFontSize: TerminalFontSize;
  onTerminalFontSizeChange: (size: TerminalFontSize) => void;
  uiFontFamily: FontFamily;
  onUiFontFamilyChange: (family: FontFamily) => void;
  monoFontFamily: FontFamily;
  onMonoFontFamilyChange: (family: FontFamily) => void;
}

export function FontPanel({
  terminalFontSize,
  onTerminalFontSizeChange,
  uiFontFamily,
  onUiFontFamilyChange,
  monoFontFamily,
  onMonoFontFamilyChange,
}: FontPanelProps) {
  const { t } = useI18n();

  function handleTerminalFontSizeStep(direction: 1 | -1) {
    onTerminalFontSizeChange(
      clampTerminalFontSize(terminalFontSize + direction * TERMINAL_FONT_SIZE_STEP),
    );
  }

  return (
    <div
      style={{
        ...s.settingsBody,
        display: "flex",
        flexDirection: "column",
        gap: 18,
        padding: "20px",
      }}
    >
      {/* Font Preview */}
      <div
        style={{
          padding: "14px 18px",
          borderRadius: 8,
          border: "1px solid var(--border-dim)",
          background: "var(--bg-subtle)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
          {t("font.preview")}
        </span>
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 6,
            border: "1px solid var(--border-dim)",
            background: "var(--bg-card)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <span style={{ fontFamily: uiFontFamily, fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 }}>
            一只敏捷的棕色狐狸跳过一只懒惰的狗。
          </span>
          <span style={{ fontFamily: uiFontFamily, fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 }}>
            The quick brown fox jumps over the lazy dog.
          </span>
          <span style={{ fontFamily: uiFontFamily, fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 }}>
            0123456789 !@#$%^&*()_+-={"{}"}[]|:;"&#39;&lt;&gt;,.?/
          </span>
          <div style={{ height: 1, background: "var(--border-dim)", margin: "2px 0" }} />
          <span
            style={{
              fontFamily: monoFontFamily,
              fontSize: terminalFontSize,
              color: "var(--text-secondary)",
              lineHeight: 1.5,
            }}
          >
            {"$ const msg = \"hello world\";"}
          </span>
          <span
            style={{
              fontFamily: monoFontFamily,
              fontSize: terminalFontSize,
              color: "var(--text-hint)",
              lineHeight: 1.5,
            }}
          >
            {"// 0123456789 !@#$%^&*()"}
          </span>
        </div>
      </div>

      {/* Terminal Font Size */}
      <div
        style={{
          padding: "16px 18px",
          borderRadius: 8,
          border: "1px solid var(--border-dim)",
          background: "var(--bg-subtle)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              {t("font.terminalFontSize")}
            </span>
            <span style={{ fontSize: 11.5, color: "var(--text-hint)", lineHeight: 1.45 }}>
              {t("font.terminalFontSizeHint")}
            </span>
          </div>
          <div
            style={{
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
            }}
          >
            <input
              type="number"
              min={TERMINAL_FONT_SIZE_MIN}
              max={TERMINAL_FONT_SIZE_MAX}
              step={TERMINAL_FONT_SIZE_STEP}
              value={terminalFontSize}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isFinite(next)) {
                  onTerminalFontSizeChange(clampTerminalFontSize(next));
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  handleTerminalFontSizeStep(1);
                  return;
                }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  handleTerminalFontSizeStep(-1);
                  return;
                }
                if (e.key !== "Tab") {
                  e.preventDefault();
                }
              }}
              onPaste={(e) => e.preventDefault()}
              style={{
                width: 54,
                height: 28,
                padding: "0 6px",
                borderRadius: 6,
                border: "1px solid var(--border-medium)",
                background: "var(--bg-card)",
                color: "var(--text-secondary)",
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
                textAlign: "center",
                outline: "none",
              }}
            />
            <span style={{ color: "var(--text-hint)" }}>px</span>
          </div>
        </div>
      </div>

      {/* UI Font Family */}
      <FontSelector
        value={uiFontFamily}
        onChange={onUiFontFamilyChange}
        label={t("font.uiFontFamily")}
        hint={t("font.uiFontFamilyHint")}
        defaultFont={DEFAULT_UI_FONT}
      />

      {/* Monospace Font Family */}
      <FontSelector
        value={monoFontFamily}
        onChange={onMonoFontFamilyChange}
        label={t("font.monoFontFamily")}
        hint={t("font.monoFontFamilyHint")}
        defaultFont={DEFAULT_MONO_FONT}
      />
    </div>
  );
}
