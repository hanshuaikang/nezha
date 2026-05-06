import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { Search, ChevronDown, RotateCcw, Check, X } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import type { FontFamily } from "../../types";
import { useI18n } from "../../i18n";
import s from "../../styles";
import { loadSystemFonts, parseFirstFontName, filterFonts } from "../../utils/fonts";

interface FontSelectorProps {
  value: FontFamily;
  onChange: (value: FontFamily) => void;
  label: string;
  hint: string;
  defaultFont: FontFamily;
}

export function FontSelector({ value, onChange, label, hint, defaultFont }: FontSelectorProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [fonts, setFonts] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (loaded) return;
    let cancelled = false;
    loadSystemFonts().then((result) => {
      if (cancelled) return;
      setFonts(result);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [open, loaded]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setFocusedIndex(-1);
  }, [search]);

  useEffect(() => {
    if (!open || !loaded) return;
    const target = parseFirstFontName(value).toLowerCase();
    const idx = fonts.findIndex((f) => f.toLowerCase() === target);
    if (idx >= 0) {
      setFocusedIndex(idx);
      requestAnimationFrame(() => scrollItemIntoView(idx));
    }
  }, [open, loaded, value, fonts]);

  const filtered = useMemo(() => filterFonts(fonts, search), [fonts, search]);

  const displayName = parseFirstFontName(value);

  const handleSelect = useCallback(
    (font: string) => {
      onChange(font);
      setOpen(false);
      setSearch("");
    },
    [onChange],
  );

  function scrollItemIntoView(index: number) {
    listRef.current?.children[index]?.scrollIntoView({ block: "nearest" });
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = focusedIndex < filtered.length - 1 ? focusedIndex + 1 : 0;
      setFocusedIndex(next);
      scrollItemIntoView(next);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = focusedIndex > 0 ? focusedIndex - 1 : filtered.length - 1;
      setFocusedIndex(next);
      scrollItemIntoView(next);
    } else if (e.key === "Enter" && focusedIndex >= 0) {
      e.preventDefault();
      handleSelect(filtered[focusedIndex]);
    }
  }

  function handleItemKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = index < filtered.length - 1 ? index + 1 : 0;
      setFocusedIndex(next);
      scrollItemIntoView(next);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = index > 0 ? index - 1 : filtered.length - 1;
      setFocusedIndex(next);
      scrollItemIntoView(next);
    }
  }

  const isSelected = useCallback(
    (font: string) => parseFirstFontName(value).toLowerCase() === font.toLowerCase(),
    [value],
  );

  return (
    <div style={s.fontSection}>
      <div style={s.fontSelectorInner}>
        <div style={s.fontSelectorLabelSection}>
          <div style={s.fontSelectorLabelRow}>
            <span style={s.fontSettingLabel}>
              {label}
            </span>
            <button
              type="button"
              onClick={() => onChange(defaultFont)}
              style={{
                ...s.fontSelectorResetBtn,
                visibility: value !== defaultFont ? "visible" : "hidden",
              }}
            >
              <RotateCcw size={11} />
              {t("common.reset")}
            </button>
          </div>
          <span style={s.fontSettingHint}>
            {hint}
          </span>
        </div>

        <Popover.Root open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
          <Popover.Trigger asChild>
            <button
              type="button"
              className="radix-select-trigger"
              style={s.fontSelectorTrigger}
            >
              <span
                style={{ ...s.fontSelectorTriggerContent, fontFamily: value }}
              >
                {displayName || t("fontSelector.notAvailable")}
              </span>
              <ChevronDown size={13} strokeWidth={2} color="var(--text-hint)" style={{ flexShrink: 0 }} />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="font-selector-content"
              sideOffset={4}
              align="start"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <div className="font-selector-search">
                <Search size={13} strokeWidth={2} color="var(--text-hint)" />
                <input
                  ref={inputRef}
                  className="font-selector-search-input"
                  placeholder={t("fontSelector.search")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                />
                {search && (
                  <button type="button" className="font-selector-clear" onClick={() => setSearch("")}>
                    <X size={11} />
                  </button>
                )}
              </div>
              <div ref={listRef} className="font-selector-list" role="listbox" aria-label={label}>
                {!loaded && (
                  <div className="font-selector-empty">{t("fontSelector.loading")}</div>
                )}
                {loaded && filtered.length === 0 && !search && (
                  <div className="font-selector-empty">{t("fontSelector.notAvailable")}</div>
                )}
                {loaded && search && filtered.length === 0 && (
                  <div className="font-selector-empty">{t("fontSelector.noResults")}</div>
                )}
                {filtered.map((font, index) => (
                  <button
                    key={font}
                    type="button"
                    role="option"
                    aria-selected={isSelected(font)}
                    className="font-selector-item"
                    style={{
                      fontFamily: font,
                      background: focusedIndex === index
                        ? "var(--bg-hover)"
                        : isSelected(font)
                          ? "var(--control-active-bg)"
                          : undefined,
                    }}
                    onClick={() => handleSelect(font)}
                    onKeyDown={(e) => handleItemKeyDown(e, index)}
                    onMouseEnter={() => setFocusedIndex(index)}
                  >
                    <span className="font-selector-item-name">{font}</span>
                    {isSelected(font) && (
                      <Check size={12} strokeWidth={2.5} color="var(--accent)" style={{ flexShrink: 0 }} />
                    )}
                  </button>
                ))}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </div>
  );
}
