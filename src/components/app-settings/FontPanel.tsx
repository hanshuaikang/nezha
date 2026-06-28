import { useState } from "react";
import type { TerminalFontSize, FontFamily } from "../../types";
import {
  TERMINAL_FONT_SIZE_MIN,
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_FONT_SIZE_STEP,
  clampTerminalFontSize,
  DEFAULT_UI_FONT,
  getDefaultMonoFont,
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
        preview={(
          <div style={s.fontInlinePreview}>
            <span style={s.fontPreviewLabel}>{t("font.preview")}</span>
            <span style={{ ...s.fontPreviewText, fontFamily: pendingUiFont }}>
              这是一段测试文字，用于预览字体效果。
            </span>
            <span style={{ ...s.fontPreviewText, fontFamily: pendingUiFont }}>
              The quick brown fox jumps over the lazy dog.
            </span>
            <span style={{ ...s.fontPreviewText, fontFamily: pendingUiFont }}>
              0123456789 !@#$%^&*()_+-={"{}"}[]|:;"&#39;&lt;&gt;,.?/
            </span>
          </div>
        )}
      />

      {/* Monospace Font Family */}
      <FontSelector
        value={pendingMonoFont}
        onChange={setPendingMonoFont}
        label={t("font.monoFontFamily")}
        hint={t("font.monoFontFamilyHint")}
        defaultFont={getDefaultMonoFont()}
        preview={(
          <div style={s.fontInlinePreview}>
            <div style={s.fontPreviewHeaderRow}>
              <span style={s.fontPreviewLabel}>{t("font.preview")}</span>
              <span style={s.fontPreviewMeta}>0O · 1lI · {}[]()</span>
            </div>
            <div
              style={{
                ...s.fontCodePreviewWindow,
                fontFamily: pendingMonoFont,
              }}
            >
              <span style={s.fontCodeLine}>
                <span style={s.fontCodeLineNo}>1</span>
                <span style={s.fontCodeText}>
                  <span style={s.fontCodeKeyword}>const</span> task = {"{"}
                </span>
              </span>
              <span style={s.fontCodeLine}>
                <span style={s.fontCodeLineNo}>2</span>
                <span style={s.fontCodeText}>
                  {"  "}name: <span style={s.fontCodeString}>"Nezha"</span>,
                  status: <span style={s.fontCodeString}>"running"</span>,
                </span>
              </span>
              <span style={s.fontCodeLine}>
                <span style={s.fontCodeLineNo}>3</span>
                <span style={s.fontCodeText}>
                  {"  "}tokens: <span style={s.fontCodeNumber}>24860</span>,
                  tools: [<span style={s.fontCodeString}>"read"</span>, <span style={s.fontCodeString}>"edit"</span>],
                </span>
              </span>
              <span style={s.fontCodeLine}>
                <span style={s.fontCodeLineNo}>4</span>
                <span style={s.fontCodeText}>
                  {"}"} <span style={s.fontCodeComment}>// 0O 1lI == =&gt; =&lt; =&gt;</span>
                </span>
              </span>
            </div>
          </div>
        )}
      />

      {/* Save Button */}
      {dirty && (
        <button
          type="button"
          onClick={handleSave}
          style={s.fontSaveBtn}
        >
          {t("common.apply")}
        </button>
      )}
    </div>
  );
}
