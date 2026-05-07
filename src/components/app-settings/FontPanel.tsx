import { useState } from "react";
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

  const [pendingUiFont, setPendingUiFont] = useState(uiFontFamily);
  const [pendingMonoFont, setPendingMonoFont] = useState(monoFontFamily);
  const [pendingFontSize, setPendingFontSize] = useState(terminalFontSize);

  const dirty =
    pendingUiFont !== uiFontFamily ||
    pendingMonoFont !== monoFontFamily ||
    pendingFontSize !== terminalFontSize;

  function handleSave() {
    onUiFontFamilyChange(pendingUiFont);
    onMonoFontFamilyChange(pendingMonoFont);
    onTerminalFontSizeChange(pendingFontSize);
  }

  function handleTerminalFontSizeStep(direction: 1 | -1) {
    setPendingFontSize(
      clampTerminalFontSize(pendingFontSize + direction * TERMINAL_FONT_SIZE_STEP),
    );
  }

  return (
    <div style={s.fontPanel}>
      {/* Font Preview */}
      <div style={s.fontPreviewSection}>
        <span style={s.fontPreviewLabel}>
          {t("font.preview")}
        </span>
        <div style={s.fontPreviewInner}>
          <span style={{ ...s.fontPreviewText, fontFamily: pendingUiFont }}>
            一只敏捷的棕色狐狸跳过一只懒惰的狗。
          </span>
          <span style={{ ...s.fontPreviewText, fontFamily: pendingUiFont }}>
            The quick brown fox jumps over the lazy dog.
          </span>
          <span style={{ ...s.fontPreviewText, fontFamily: pendingUiFont }}>
            0123456789 !@#$%^&*()_+-={"{}"}[]|:;"&#39;&lt;&gt;,.?/
          </span>
          <div style={s.fontPreviewDivider} />
          <span
            style={{ ...s.fontPreviewCode, fontFamily: pendingMonoFont, fontSize: pendingFontSize }}
          >
            {"$ const msg = \"hello world\";"}
          </span>
          <span
            style={{
              ...s.fontPreviewCode,
              fontFamily: pendingMonoFont,
              fontSize: pendingFontSize,
              color: "var(--text-hint)",
            }}
          >
            {"// 0123456789 !@#$%^&*()"}
          </span>
        </div>
      </div>

      {/* Terminal Font Size */}
      <div style={s.fontSection}>
        <div style={s.fontSizeRow}>
          <div style={s.fontSizeLabelCol}>
            <span style={s.fontSettingLabel}>
              {t("font.terminalFontSize")}
            </span>
            <span style={s.fontSettingHint}>
              {t("font.terminalFontSizeHint")}
            </span>
          </div>
          <div style={s.fontSizeControls}>
            <input
              type="number"
              min={TERMINAL_FONT_SIZE_MIN}
              max={TERMINAL_FONT_SIZE_MAX}
              step={TERMINAL_FONT_SIZE_STEP}
              value={pendingFontSize}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isFinite(next)) {
                  setPendingFontSize(clampTerminalFontSize(next));
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
              style={s.fontSizeInput}
            />
            <span style={s.fontSizeUnit}>px</span>
          </div>
        </div>
      </div>

      {/* UI Font Family */}
      <FontSelector
        value={pendingUiFont}
        onChange={setPendingUiFont}
        label={t("font.uiFontFamily")}
        hint={t("font.uiFontFamilyHint")}
        defaultFont={DEFAULT_UI_FONT}
      />

      {/* Monospace Font Family */}
      <FontSelector
        value={pendingMonoFont}
        onChange={setPendingMonoFont}
        label={t("font.monoFontFamily")}
        hint={t("font.monoFontFamilyHint")}
        defaultFont={DEFAULT_MONO_FONT}
      />

      {/* Save Button */}
      {dirty && (
        <button
          type="button"
          onClick={handleSave}
          style={s.fontSaveBtn}
        >
          {t("common.save")}
        </button>
      )}
    </div>
  );
}
